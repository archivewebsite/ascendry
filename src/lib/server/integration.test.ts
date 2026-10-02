import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import seedRaw from "@/data/catalog-seed.json";
import { itemDataSchema, marketPreviewSchema } from "@/lib/server/schemas";

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "ascendry-integration-"));
process.env.ASCENDRY_DATA_DIR = temporaryDirectory;

const credential = await import("@/lib/server/credential");
const db = await import("@/lib/server/db");

describe.sequential("local persistence", () => {
  beforeAll(() => db.closeDatabaseForTests());

  afterAll(async () => {
    await credential.clearApiKey();
    db.closeDatabaseForTests();
    rmSync(temporaryDirectory, { recursive: true, force: true });
    delete process.env.ASCENDRY_DATA_DIR;
  });

  it.runIf(process.platform === "win32")("round-trips a key through DPAPI without storing plaintext", async () => {
    const dummySecret = "integration-test-secret-never-a-live-key";
    try {
      await credential.saveApiKey(dummySecret);
    } catch (error) {
      // Sandboxed/impersonated Windows runners may intentionally omit a loaded
      // user profile, in which case current-user DPAPI cannot operate at all.
      expect(String(error)).toContain("user profile loaded");
      return;
    }
    const blob = readFileSync(path.join(temporaryDirectory, "credential.dpapi"), "utf8");
    expect(blob).not.toContain(dummySecret);
    expect(await credential.loadApiKey()).toBe(dummySecret);
    expect(await credential.hasApiKey()).toBe(true);
    await credential.clearApiKey();
    expect(await credential.hasApiKey()).toBe(false);
  }, 20_000);

  it("migrates and seeds the complete catalog", () => {
    expect(db.getCatalog()).toHaveLength(185);
    expect(db.diagnostics()).toMatchObject({ items: 185, market_snapshots: 0 });
  });

  it("stores snapshots atomically and deduplicates by upstream timestamp", () => {
    const items = itemDataSchema.parse(seedRaw);
    db.saveAlert({ idName: "rock", direction: "below", threshold: "30", enabled: true });
    const preview = marketPreviewSchema.parse({
      lastUpdated: "2026-09-16T00:00:00.000Z",
      data: { rock: { price: "25", delta: { day: 1.5, week: null, month: -2 } } },
    });
    expect(db.storeSync(items, preview).inserted).toBe(true);
    expect(db.storeSync(items, preview).inserted).toBe(false);
    expect(db.getItem("rock")?.market?.price).toBe("25");
    expect(db.listAlerts()[0]).toMatchObject({ itemName: "Rock", triggeredPrice: "25" });
    expect(db.diagnostics().market_snapshots).toBe(1);
    const backup = db.exportBackup();
    expect(backup).not.toHaveProperty("apiKey");
    expect(backup.snapshots).toHaveLength(1);
  });
});
