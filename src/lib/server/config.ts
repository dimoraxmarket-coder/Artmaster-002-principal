import { resolve, dirname, basename, sep } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { resolveSiteUrl } from "../site";

export class BackendError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(code);
  }
}
export function storageMode(): "local" | "supabase" {
  const selected = process.env.ARTMASTER_STORAGE;
  if (selected === "supabase" || (!selected && process.env.SUPABASE_URL)) {
    if (
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !process.env.SUPABASE_ANON_KEY
    )
      throw new BackendError("unavailable", 503);
    return "supabase";
  }
  if (process.env.NODE_ENV === "production") {
    const localSmoke =
      selected === "local" &&
      process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION === "true" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(resolveSiteUrl()).hostname,
      );
    if (!localSmoke) throw new BackendError("unavailable", 503);
  }
  if (selected && selected !== "local")
    throw new BackendError("unavailable", 503);
  return "local";
}
function canonicalLocation(path: string) {
  const tail: string[] = [];
  let parent = path;
  while (!existsSync(parent)) {
    const next = dirname(parent);
    if (next === parent) throw new BackendError("unavailable", 503);
    tail.unshift(basename(parent));
    parent = next;
  }
  return resolve(realpathSync(parent), ...tail);
}
export function dataDirectory() {
  const path = resolve(
    /* turbopackIgnore: true */ process.env.ARTMASTER_DATA_DIR || ".data",
  );
  try {
    const physical = canonicalLocation(path);
    const comparable =
      process.platform === "win32" ? physical.toLowerCase() : physical;
    for (const exposed of [resolve("public"), resolve(".next/static")]) {
      const location = canonicalLocation(exposed);
      const root =
        process.platform === "win32" ? location.toLowerCase() : location;
      if (comparable === root || comparable.startsWith(root + sep))
        throw new BackendError("unavailable", 503);
    }
  } catch {
    throw new BackendError("unavailable", 503);
  }
  return path;
}
export function publicOrigin() {
  return resolveSiteUrl();
}
export const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_FILE_BYTES = 10 * 1024 * 1024;
