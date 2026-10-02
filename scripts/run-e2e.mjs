import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const cwd = process.cwd();
const nextCli = path.join(cwd, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join(cwd, "node_modules", "@playwright", "test", "cli.js");

async function reservePort() {
  const probe = net.createServer();
  probe.unref();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  if (!address || typeof address === "string") throw new Error("Could not reserve an E2E port.");
  const port = address.port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url, server) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`The E2E server exited before becoming ready (${server.exitCode}).`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch { /* Server is still starting. */ }
    await delay(250);
  }
  throw new Error("The E2E server did not become ready within 120 seconds.");
}

async function capture(command, args) {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  await once(child, "exit");
  return output;
}

async function terminateTree(child, port) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    const listeners = await capture("netstat.exe", ["-ano", "-p", "tcp"]);
    const listener = listeners.split(/\r?\n/).find((line) => new RegExp(`^\\s*TCP\\s+127\\.0\\.0\\.1:${port}\\s+\\S+\\s+LISTENING\\s+\\d+\\s*$`).test(line));
    const listenerPid = listener?.trim().split(/\s+/).at(-1);
    const targets = [...new Set([listenerPid, String(child.pid)].filter((value) => value && value !== "0"))];
    for (const target of targets) {
      const killer = spawn("taskkill.exe", ["/PID", target, "/T", "/F"], { stdio: "ignore", windowsHide: true });
      await once(killer, "exit");
    }
    return;
  }
  if (child.exitCode !== null) return;
  try { process.kill(-child.pid, "SIGKILL"); }
  catch (error) { if (error?.code !== "ESRCH") throw error; }
}

const port = await reservePort();
const baseUrl = `http://127.0.0.1:${port}`;
const environment = {
  ...process.env,
  ASCENDRY_DATA_DIR: path.join(cwd, "test-results", "e2e-data"),
  ASCENDRY_E2E_BASE_URL: baseUrl,
  ASCENDRY_NEXT_DIST_DIR: ".next-e2e",
};
const server = spawn(process.execPath, [nextCli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd,
  detached: process.platform !== "win32",
  env: environment,
  stdio: "inherit",
  windowsHide: true,
});

let shuttingDown = false;
async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  await terminateTree(server, port);
  process.exit(code);
}
process.once("SIGINT", () => { void shutdown(130); });
process.once("SIGTERM", () => { void shutdown(143); });

let exitCode = 1;
try {
  await waitForServer(baseUrl, server);
  const runner = spawn(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
    cwd,
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  });
  const [code] = await once(runner, "exit");
  exitCode = typeof code === "number" ? code : 1;
} finally {
  await terminateTree(server, port);
}

process.exit(exitCode);
