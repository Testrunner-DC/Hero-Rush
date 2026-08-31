import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load an ignored local file for desktop development; production uses host environment variables. */
export function loadLocalEnvironment(cwd = process.cwd()): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const candidates = [resolve(cwd, ".env.local"), resolve(cwd, "server", ".env.local")];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) return null;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    const value = line.slice(equals + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return path;
}
