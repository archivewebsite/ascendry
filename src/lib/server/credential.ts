import "server-only";
import { spawn } from "node:child_process";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDirectory } from "@/lib/server/paths";

const credentialPath = () => path.join(dataDirectory(), "credential.dpapi");
const scriptPath = () => path.join(process.cwd(), "scripts", "dpapi.ps1");

function invokeDpapi(mode: "protect" | "unprotect", value: string): Promise<string> {
  if (process.platform !== "win32") throw new Error("Ascendry credential protection requires Windows DPAPI.");
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath(), mode], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let error = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { output += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { error += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error.trim() || "Windows could not protect the credential.")));
    child.stdin.end(value);
  });
}

export async function saveApiKey(apiKey: string) {
  const protectedValue = await invokeDpapi("protect", apiKey.trim());
  const target = credentialPath();
  const temporary = `${target}.tmp`;
  await writeFile(temporary, protectedValue, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

export async function loadApiKey(): Promise<string | null> {
  try {
    const protectedValue = await readFile(credentialPath(), "utf8");
    return await invokeDpapi("unprotect", protectedValue.trim());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("The saved Bconomy API key cannot be opened in this Windows session. Enter it again in Settings to replace it.");
  }
}

export async function clearApiKey() {
  try { await unlink(credentialPath()); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

export async function hasApiKey(): Promise<boolean> {
  try { return Boolean((await readFile(credentialPath(), "utf8")).trim()); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
