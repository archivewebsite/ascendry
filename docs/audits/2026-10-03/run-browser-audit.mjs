import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const probe = net.createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const baseURL = `http://127.0.0.1:${port}`;
const directory = mkdtempSync(path.join(tmpdir(), "ascendry-browser-audit-"));
const env = { ...process.env, ASCENDRY_DATA_DIR: directory, ASCENDRY_NEXT_DIST_DIR: ".next-audit-build", ASCENDRY_E2E_BASE_URL: baseURL };
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env, stdio: "inherit", windowsHide: true });
let overallExitCode = 0;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Audit server exited.");
    try { if ((await fetch(baseURL, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* Starting. */ }
    await delay(250);
  }
  if (!ready) throw new Error("Audit server did not start.");
  const configs = process.argv.includes("--reproductions-only") ? ["playwright.config.ts"] : ["playwright.baseline.config.ts", "playwright.config.ts"];
  for (const config of configs) {
    const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", `docs/audits/2026-10-03/${config}`], { env, stdio: "inherit", windowsHide: true });
    const [code] = await once(child, "exit");
    process.stdout.write(`Audit suite ${config} exit: ${code}\n`);
    if (code !== 0) overallExitCode = 1;
  }
} finally {
  if (server.exitCode === null) { server.kill(); await once(server, "exit"); }
  if (!directory.startsWith(path.resolve(tmpdir()) + path.sep + "ascendry-browser-audit-")) throw new Error("Unexpected audit directory.");
  rmSync(directory, { recursive: true, force: true });
}
process.exitCode = overallExitCode;
