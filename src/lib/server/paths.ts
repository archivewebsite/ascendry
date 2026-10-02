import "server-only";
import path from "node:path";
import { mkdirSync } from "node:fs";

export function dataDirectory(): string {
  const configured = process.env.ASCENDRY_DATA_DIR;
  const directory = configured ? path.resolve(configured) : path.join(process.cwd(), "data");
  mkdirSync(directory, { recursive: true });
  return directory;
}
