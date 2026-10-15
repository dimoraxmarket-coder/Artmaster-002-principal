import { localPort } from "./windows-local.mjs";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { storageMode, dataDirectory } from "../src/lib/server/config";
import { localDatabase } from "../src/lib/server/local";
async function main() {
  const expected = resolve(".data/windows-local");
  if (
    process.env.NODE_ENV !== "development" ||
    storageMode() !== "local" ||
    dataDirectory() !== expected ||
    process.env.SITE_URL !== `http://localhost:${localPort()}` ||
    process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION !== "false"
  )
    throw new Error("Configuratia nu este cea izolata Windows.");
  if (
    (await readFile(resolve(expected, ".windows-local-owner"), "utf8")) !==
    "ARTMASTER_WINDOWS_LOCAL_V1"
  )
    throw new Error("Lipseste marcajul directorului local.");
  localDatabase();
  console.log(
    "SQLite local este pregatit. Datele existente sunt pastrate; nu cream conturi sau clienti demonstrativi.",
  );
}
main().catch(() => {
  console.error(
    "Initializarea izolata nu a reusit. Foloseste START.bat intr-o copie curata.",
  );
  process.exitCode = 1;
});
