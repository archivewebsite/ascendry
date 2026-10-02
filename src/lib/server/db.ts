import "server-only";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { randomUUID } from "node:crypto";
import seedRaw from "@/data/catalog-seed.json";
import { dataDirectory } from "@/lib/server/paths";
import { itemDataSchema, type ItemData, type MarketPreview } from "@/lib/server/schemas";
import { requiredMercantilistLevel } from "@/lib/prestige";
import { planInputSchema, timestampSchema } from "@/lib/plan-schema";
import { backupSchema } from "@/lib/server/backup-schema";
import type { CatalogItem, SavedPlan, WatchAlert } from "@/lib/types";

type Row = Record<string, unknown>;
let singleton: DatabaseSync | null = null;

function database(): DatabaseSync {
  if (singleton) return singleton;
  const db = new DatabaseSync(path.join(dataDirectory(), "ascendry.sqlite"), { enableForeignKeyConstraints: true });
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;");
  migrate(db);
  singleton = db;
  seedCatalogIfEmpty(db);
  return db;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS items(
      id INTEGER PRIMARY KEY, id_name TEXT NOT NULL UNIQUE, name TEXT NOT NULL, emoji TEXT NOT NULL,
      image_url TEXT, description TEXT, base_value TEXT NOT NULL, weapon_damage TEXT, uncraftable INTEGER NOT NULL,
      attributes_json TEXT NOT NULL, loot_sources_json TEXT NOT NULL, used_to_craft_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS recipes(
      output_id_name TEXT NOT NULL, ingredient_id_name TEXT NOT NULL, amount TEXT NOT NULL, position INTEGER NOT NULL,
      PRIMARY KEY(output_id_name, ingredient_id_name)
    ) STRICT;
    CREATE TABLE IF NOT EXISTS market_snapshots(
      id INTEGER PRIMARY KEY, upstream_updated_at TEXT NOT NULL UNIQUE, captured_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS market_prices(
      snapshot_id INTEGER NOT NULL, id_name TEXT NOT NULL, price TEXT, delta_day REAL, delta_week REAL, delta_month REAL,
      PRIMARY KEY(snapshot_id, id_name), FOREIGN KEY(snapshot_id) REFERENCES market_snapshots(id) ON DELETE CASCADE
    ) STRICT;
    CREATE INDEX IF NOT EXISTS market_prices_item_idx ON market_prices(id_name, snapshot_id);
    CREATE TABLE IF NOT EXISTS external_cache(
      cache_key TEXT PRIMARY KEY, value_json TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS plans(
      id TEXT PRIMARY KEY, name TEXT NOT NULL, payload_json TEXT NOT NULL, result_json TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS alerts(
      id TEXT PRIMARY KEY, id_name TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('below','above')),
      threshold TEXT NOT NULL, enabled INTEGER NOT NULL, triggered_at TEXT, triggered_price TEXT, created_at TEXT NOT NULL
    ) STRICT;
  `);
  const itemColumns = db.prepare("PRAGMA table_info(items)").all() as Row[];
  if (!itemColumns.some((column) => column.name === "weapon_damage")) db.exec("ALTER TABLE items ADD COLUMN weapon_damage TEXT");
  db.prepare("INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES(1, ?)").run(new Date().toISOString());
}

function seedCatalogIfEmpty(db: DatabaseSync) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM items").get() as Row;
  if (Number(row.count) > 0) return;
  replaceCatalog(db, itemDataSchema.parse(seedRaw));
  setSetting("catalog_source", "bundled validated snapshot", db);
}

function setSetting(key: string, value: string, db = database()) {
  db.prepare("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

export function getSetting(key: string): string | null {
  const row = database().prepare("SELECT value FROM app_settings WHERE key=?").get(key) as Row | undefined;
  return row ? String(row.value) : null;
}

function replaceCatalog(db: DatabaseSync, items: ItemData) {
  const now = new Date().toISOString();
  db.prepare("DELETE FROM recipes").run();
  db.prepare("DELETE FROM items").run();
  const itemStatement = db.prepare(`
    INSERT INTO items(id,id_name,name,emoji,image_url,description,base_value,weapon_damage,uncraftable,attributes_json,loot_sources_json,used_to_craft_json,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id_name) DO UPDATE SET id=excluded.id,name=excluded.name,emoji=excluded.emoji,image_url=excluded.image_url,
      description=excluded.description,base_value=excluded.base_value,weapon_damage=excluded.weapon_damage,uncraftable=excluded.uncraftable,
      attributes_json=excluded.attributes_json,loot_sources_json=excluded.loot_sources_json,used_to_craft_json=excluded.used_to_craft_json,updated_at=excluded.updated_at
  `);
  const recipeStatement = db.prepare("INSERT INTO recipes(output_id_name,ingredient_id_name,amount,position) VALUES(?,?,?,?)");
  for (const item of items) {
    itemStatement.run(item.id, item.idName, item.name, item.emoji, item.imageUrl ?? null, item.desc ?? null, item.cost, item.damage ?? null, item.uncraftable ? 1 : 0, JSON.stringify(item.attributes), JSON.stringify(item.lootSources), JSON.stringify(item.usedToCraft), now);
    item.recipe.forEach(([ingredient, amount], position) => recipeStatement.run(item.idName, ingredient, amount, position));
  }
}

function parseSnapshotTime(value: string): string {
  return timestampSchema.parse(value);
}

// Older installations stored millisecond text; newer writes use canonical ISO.
const snapshotEpoch = (column = "upstream_updated_at") => `CASE WHEN ${column} NOT GLOB '*[^0-9]*' AND ${column} <> '' THEN CAST(${column} AS REAL)/1000.0 ELSE unixepoch(${column}, 'subsec') END`;

export function storeSync(items: ItemData, preview: MarketPreview): { inserted: boolean; snapshotAt: string } {
  const snapshotAt = parseSnapshotTime(preview.lastUpdated);
  const db = database();
  const existing = db.prepare(`SELECT id FROM market_snapshots WHERE ${snapshotEpoch()}=unixepoch(?, 'subsec')`).get(snapshotAt) as Row | undefined;
  if (existing) {
    db.exec("BEGIN IMMEDIATE");
    try {
      replaceCatalog(db, items);
      setSetting("catalog_source", "Bconomy Data API", db);
      setSetting("last_sync_success", new Date().toISOString(), db);
      setSetting("last_sync_error", "", db);
      db.exec("COMMIT");
      return { inserted: false, snapshotAt };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    replaceCatalog(db, items);
    setSetting("catalog_source", "Bconomy Data API", db);
    const captured = new Date().toISOString();
    const result = db.prepare("INSERT INTO market_snapshots(upstream_updated_at,captured_at) VALUES(?,?)").run(snapshotAt, captured);
    const snapshotId = Number(result.lastInsertRowid);
    const priceStatement = db.prepare("INSERT INTO market_prices(snapshot_id,id_name,price,delta_day,delta_week,delta_month) VALUES(?,?,?,?,?,?)");
    for (const item of items) {
      const market = preview.data[item.idName];
      priceStatement.run(snapshotId, item.idName, market?.price ?? null, market?.delta.day ?? null, market?.delta.week ?? null, market?.delta.month ?? null);
    }
    const latest = db.prepare(`SELECT id FROM market_snapshots ORDER BY ${snapshotEpoch()} DESC, id DESC LIMIT 1`).get() as Row;
    if (Number(latest.id) === snapshotId) evaluateAlerts(db, snapshotId, snapshotAt);
    setSetting("last_sync_success", captured, db);
    setSetting("last_sync_error", "", db);
    db.exec("COMMIT");
    return { inserted: true, snapshotAt };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function recordSyncError(message: string) {
  setSetting("last_sync_error", message.slice(0, 500));
}

function evaluateAlerts(db: DatabaseSync, snapshotId: number, timestamp: string) {
  const rows = db.prepare(`SELECT a.id,a.direction,a.threshold,p.price FROM alerts a JOIN market_prices p ON p.id_name=a.id_name AND p.snapshot_id=? WHERE a.enabled=1 AND p.price IS NOT NULL`).all(snapshotId) as Row[];
  const update = db.prepare("UPDATE alerts SET triggered_at=?,triggered_price=? WHERE id=?");
  for (const row of rows) {
    const price = BigInt(String(row.price));
    const threshold = BigInt(String(row.threshold));
    if ((row.direction === "below" && price <= threshold) || (row.direction === "above" && price >= threshold)) update.run(timestamp, price.toString(), String(row.id));
  }
}

function recipeMap(db: DatabaseSync) {
  const recipes = new Map<string, Array<{ ingredientIdName: string; ingredientName: string; amount: string }>>();
  const rows = db.prepare(`SELECT r.output_id_name,r.ingredient_id_name,r.amount,i.name FROM recipes r JOIN items i ON i.id_name=r.ingredient_id_name ORDER BY r.output_id_name,r.position`).all() as Row[];
  for (const row of rows) {
    const key = String(row.output_id_name);
    const list = recipes.get(key) ?? [];
    list.push({ ingredientIdName: String(row.ingredient_id_name), ingredientName: String(row.name), amount: String(row.amount) });
    recipes.set(key, list);
  }
  return recipes;
}

export function getCatalog(): CatalogItem[] {
  const db = database();
  const recipes = recipeMap(db);
  const rows = db.prepare(`
    SELECT i.*,p.price,p.delta_day,p.delta_week,p.delta_month,s.upstream_updated_at
    FROM items i
    LEFT JOIN market_snapshots s ON s.id=(SELECT id FROM market_snapshots ORDER BY ${snapshotEpoch()} DESC, id DESC LIMIT 1)
    LEFT JOIN market_prices p ON p.snapshot_id=s.id AND p.id_name=i.id_name
    ORDER BY i.id
  `).all() as Row[];
  return rows.map((row) => ({
    id: Number(row.id), idName: String(row.id_name), name: String(row.name), emoji: String(row.emoji), imageUrl: row.image_url === null ? null : String(row.image_url), description: row.description === null ? null : String(row.description), baseValue: String(row.base_value), weaponDamage: row.weapon_damage === null ? null : String(row.weapon_damage), craftable: !Boolean(row.uncraftable),
    attributes: JSON.parse(String(row.attributes_json)) as string[], lootSources: JSON.parse(String(row.loot_sources_json)) as string[], usedToCraft: JSON.parse(String(row.used_to_craft_json)) as string[], recipe: recipes.get(String(row.id_name)) ?? [],
    market: row.upstream_updated_at === null || row.upstream_updated_at === undefined ? null : { price: row.price === null ? null : String(row.price), delta: { day: row.delta_day === null ? null : Number(row.delta_day), week: row.delta_week === null ? null : Number(row.delta_week), month: row.delta_month === null ? null : Number(row.delta_month) }, snapshotAt: parseSnapshotTime(String(row.upstream_updated_at)), source: "local" },
    mercantilistLevel: requiredMercantilistLevel(String(row.name)),
  }));
}

export function getItem(idName: string): CatalogItem | null { return getCatalog().find((item) => item.idName === idName) ?? null; }

export function localPriceHistory(idName: string) {
  return (database().prepare(`SELECT s.upstream_updated_at,p.price FROM market_prices p JOIN market_snapshots s ON s.id=p.snapshot_id WHERE p.id_name=? ORDER BY ${snapshotEpoch("s.upstream_updated_at")}, s.id`).all(idName) as Row[]).map((row) => ({ snapshotTime: parseSnapshotTime(String(row.upstream_updated_at)), lowestPrice: row.price === null ? null : String(row.price), source: "local" as const }));
}

export function diagnostics() {
  const db = database();
  const counts = Object.fromEntries(["items", "recipes", "market_snapshots", "plans", "alerts"].map((table) => [table, Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as Row).count)]));
  return {
    items: counts.items ?? 0,
    recipes: counts.recipes ?? 0,
    market_snapshots: counts.market_snapshots ?? 0,
    plans: counts.plans ?? 0,
    alerts: counts.alerts ?? 0,
    lastSyncSuccess: getSetting("last_sync_success"),
    lastSyncError: getSetting("last_sync_error") || null,
    catalogSource: getSetting("catalog_source"),
  };
}

export function getCache<T>(key: string, allowExpired = false): T | null {
  const row = database().prepare("SELECT value_json,expires_at FROM external_cache WHERE cache_key=?").get(key) as Row | undefined;
  if (!row || (!allowExpired && Date.parse(String(row.expires_at)) <= Date.now())) return null;
  return JSON.parse(String(row.value_json)) as T;
}

export function putCache(key: string, value: unknown, ttlMs: number) {
  const now = new Date();
  database().prepare("INSERT INTO external_cache(cache_key,value_json,fetched_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET value_json=excluded.value_json,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at").run(key, JSON.stringify(value), now.toISOString(), new Date(now.getTime() + ttlMs).toISOString());
}

export function listPlans(): SavedPlan[] {
  return (database().prepare("SELECT * FROM plans ORDER BY updated_at DESC").all() as Row[]).map(planFromRow);
}
function planFromRow(row: Row): SavedPlan { return { id: String(row.id), name: String(row.name), payload: JSON.parse(String(row.payload_json)), result: JSON.parse(String(row.result_json)), createdAt: String(row.created_at), updatedAt: String(row.updated_at) } as SavedPlan; }
export function getPlan(id: string): SavedPlan | null { const row = database().prepare("SELECT * FROM plans WHERE id=?").get(id) as Row | undefined; return row ? planFromRow(row) : null; }
export function savePlan(input: Omit<SavedPlan, "id" | "createdAt" | "updatedAt"> & { id?: string }): SavedPlan {
  const value = planInputSchema.parse(input);
  const id = input.id ?? randomUUID(); const existing = getPlan(id); const now = new Date().toISOString(); const created = existing?.createdAt ?? now;
  database().prepare("INSERT INTO plans(id,name,payload_json,result_json,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,payload_json=excluded.payload_json,result_json=excluded.result_json,updated_at=excluded.updated_at").run(id, value.name, JSON.stringify(value.payload), JSON.stringify(value.result), created, now);
  return getPlan(id)!;
}
export function deletePlan(id: string) { database().prepare("DELETE FROM plans WHERE id=?").run(id); }

function alertFromRow(row: Row): WatchAlert { return { id: String(row.id), idName: String(row.id_name), itemName: row.item_name === null || row.item_name === undefined ? undefined : String(row.item_name), direction: row.direction as "below" | "above", threshold: String(row.threshold), enabled: Boolean(row.enabled), triggeredAt: row.triggered_at === null ? null : String(row.triggered_at), triggeredPrice: row.triggered_price === null ? null : String(row.triggered_price), createdAt: String(row.created_at) }; }
export function listAlerts(): WatchAlert[] { return (database().prepare("SELECT a.*,i.name AS item_name FROM alerts a LEFT JOIN items i ON i.id_name=a.id_name ORDER BY a.created_at DESC").all() as Row[]).map(alertFromRow); }
export function getAlert(id: string): WatchAlert | null { const row = database().prepare("SELECT a.*,i.name AS item_name FROM alerts a LEFT JOIN items i ON i.id_name=a.id_name WHERE a.id=?").get(id) as Row | undefined; return row ? alertFromRow(row) : null; }
export function saveAlert(input: Omit<WatchAlert, "id" | "createdAt" | "triggeredAt" | "triggeredPrice"> & { id?: string }): WatchAlert {
  const id = input.id ?? randomUUID(); const now = new Date().toISOString();
  database().prepare(`INSERT INTO alerts(id,id_name,direction,threshold,enabled,triggered_at,triggered_price,created_at) VALUES(?,?,?,?,?,NULL,NULL,?) ON CONFLICT(id) DO UPDATE SET
    triggered_at=CASE WHEN alerts.id_name<>excluded.id_name OR alerts.direction<>excluded.direction OR alerts.threshold<>excluded.threshold THEN NULL ELSE alerts.triggered_at END,
    triggered_price=CASE WHEN alerts.id_name<>excluded.id_name OR alerts.direction<>excluded.direction OR alerts.threshold<>excluded.threshold THEN NULL ELSE alerts.triggered_price END,
    id_name=excluded.id_name,direction=excluded.direction,threshold=excluded.threshold,enabled=excluded.enabled`).run(id, input.idName, input.direction, input.threshold, input.enabled ? 1 : 0, now);
  return getAlert(id)!;
}
export function deleteAlert(id: string) { database().prepare("DELETE FROM alerts WHERE id=?").run(id); }

export function deleteHistory() { const db = database(); db.exec("BEGIN"); try { db.prepare("DELETE FROM market_snapshots").run(); db.prepare("DELETE FROM external_cache").run(); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; } }

export function exportBackup() {
  const db = database();
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), plans: db.prepare("SELECT * FROM plans").all(), alerts: db.prepare("SELECT * FROM alerts").all(), snapshots: db.prepare("SELECT * FROM market_snapshots").all(), prices: db.prepare("SELECT * FROM market_prices").all() };
}

export function importBackup(raw: unknown) {
  const backup = backupSchema.parse(raw);
  const db = database(); db.exec("BEGIN IMMEDIATE");
  try {
    for (const row of backup.plans) db.prepare("INSERT OR REPLACE INTO plans(id,name,payload_json,result_json,created_at,updated_at) VALUES(?,?,?,?,?,?)").run(row.id, row.name, row.payload_json, row.result_json, row.created_at, row.updated_at);
    for (const row of backup.alerts) db.prepare("INSERT OR REPLACE INTO alerts(id,id_name,direction,threshold,enabled,triggered_at,triggered_price,created_at) VALUES(?,?,?,?,?,?,?,?)").run(row.id, row.id_name, row.direction, row.threshold, row.enabled, row.triggered_at, row.triggered_price, row.created_at);
    const snapshotIds = new Map<number, number>();
    for (const row of backup.snapshots) {
      let found = db.prepare(`SELECT id FROM market_snapshots WHERE ${snapshotEpoch()}=unixepoch(?, 'subsec')`).get(row.upstream_updated_at) as Row | undefined;
      if (!found) { const result = db.prepare("INSERT INTO market_snapshots(upstream_updated_at,captured_at) VALUES(?,?)").run(row.upstream_updated_at, row.captured_at); found = { id: result.lastInsertRowid }; }
      snapshotIds.set(row.id, Number(found.id));
    }
    for (const row of backup.prices) {
      const mapped = snapshotIds.get(row.snapshot_id)!;
      db.prepare("INSERT OR REPLACE INTO market_prices(snapshot_id,id_name,price,delta_day,delta_week,delta_month) VALUES(?,?,?,?,?,?)").run(mapped, row.id_name, row.price, row.delta_day, row.delta_week, row.delta_month);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function closeDatabaseForTests() { singleton?.close(); singleton = null; }
