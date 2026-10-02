import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: {
    "@": fileURLToPath(new URL("../../../src", import.meta.url)),
    "server-only": fileURLToPath(new URL("../../../src/lib/server/server-only.test-shim.ts", import.meta.url)),
  } },
  test: { environment: "node", include: ["docs/audits/2026-10-03/reproductions.test.ts"], fileParallelism: false },
});
