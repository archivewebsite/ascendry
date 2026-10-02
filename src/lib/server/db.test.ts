import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import seed from "@/data/catalog-seed.json";
import { itemDataSchema, marketPreviewSchema } from "@/lib/server/schemas";

const directory = mkdtempSync(path.join(tmpdir(), "ascendry-catalog-test-"));
process.env.ASCENDRY_DATA_DIR = directory;

// An existing installation has an items table without weapon_damage.
const legacy = new DatabaseSync(path.join(directory, "ascendry.sqlite"));
legacy.exec(`CREATE TABLE items(
  id INTEGER PRIMARY KEY, id_name TEXT NOT NULL UNIQUE, name TEXT NOT NULL, emoji TEXT NOT NULL,
  image_url TEXT, description TEXT, base_value TEXT NOT NULL, uncraftable INTEGER NOT NULL,
  attributes_json TEXT NOT NULL, loot_sources_json TEXT NOT NULL, used_to_craft_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT`);
legacy.close();

const { closeDatabaseForTests, getCatalog, getSetting, storeSync } = await import("@/lib/server/db");

afterAll(() => {
  closeDatabaseForTests();
  delete process.env.ASCENDRY_DATA_DIR;
  if (!directory.startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error("Unexpected test directory.");
  rmSync(directory, { recursive: true, force: true });
});

describe("catalog sync", () => {
  it("migrates existing catalogs and updates weapon damage even without a new market snapshot", () => {
    expect(getCatalog().find((item) => item.idName === "rustyknife")?.weaponDamage).toBe("200");
    const preview = marketPreviewSchema.parse({ lastUpdated: "1789586239142", data: {} });
    const initial = itemDataSchema.parse(seed);
    expect(storeSync(initial, preview).inserted).toBe(true);

    const changed = structuredClone(seed);
    changed.find((item) => item.idName === "rustyknife")!.damage = 250;
    expect(storeSync(itemDataSchema.parse(changed), preview).inserted).toBe(false);
    expect(getCatalog().find((item) => item.idName === "rustyknife")?.weaponDamage).toBe("250");
    expect(getSetting("catalog_source")).toBe("Bconomy Data API");
  });
});
