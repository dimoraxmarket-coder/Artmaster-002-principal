import { execFileSync } from "node:child_process";
import { mkdir, writeFile, lstat, realpath } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roots = new Set([
  "src",
  "public",
  "scripts",
  "tests",
  "docs",
  "supabase",
  "config",
  ".github",
]);
const files = new Set([
  "package.json",
  "package-lock.json",
  "README.md",
  "README-WINDOWS.md",
  "START.bat",
  "CREATE-ADMIN.bat",
  "START-WINDOWS.cmd",
  ".env.example",
  ".gitignore",
  ".gitattributes",
  "AGENTS.md",
  "next.config.ts",
  "tsconfig.json",
  "eslint.config.mjs",
  "postcss.config.mjs",
  "playwright.config.ts",
]);
export function distributable(path, mode = "100644") {
  if (
    !["100644", "100755"].includes(mode) ||
    path.includes("\\") ||
    path.split("/").includes("..")
  )
    return false;
  if (
    /(^|\/)(node_modules|\.next|\.git|\.data|backups|uploads|attachments|private|test-results|playwright-report)(\/|$)/i.test(
      path,
    ) ||
    /(^|\/)\.env(?!\.example$)/i.test(path) ||
    /\.(sqlite(?:-wal|-shm)?|db|zip|bak|tsbuildinfo)$/i.test(path)
  )
    return false;
  return files.has(path) || roots.has(path.split("/")[0]);
}
export function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}
export async function packageWindows(destination) {
  if (git(["status", "--porcelain"]).trim())
    throw new Error(
      "Comite modificarile inainte de impachetare; arhiva trebuie sa corespunda unui commit verificabil.",
    );
  const sourceCommit = git(["rev-parse", "HEAD"]).trim(),
    sourceTree = git(["rev-parse", "HEAD^{tree}"]).trim();
  const entries = git([
    "ls-tree",
    "-r",
    "--format=%(objectmode) %(path)",
    "HEAD",
  ])
    .trim()
    .split("\n")
    .map((line) => ({ mode: line.slice(0, 6), path: line.slice(7) }));
  const selected = entries
    .filter((e) => distributable(e.path, e.mode))
    .map((e) => e.path);
  for (const required of [
    "START.bat",
    "CREATE-ADMIN.bat",
    "README-WINDOWS.md",
    "package-lock.json",
    "src/app/admin/page.tsx",
    "src/app/[locale]/page.tsx",
    "scripts/windows-local.mjs",
    "config/windows.env.example",
    "supabase/migrations/202610150005_content_studio.sql",
  ])
    if (!selected.includes(required))
      throw new Error(`Lipseste un fisier obligatoriu: ${required}`);
  const output = resolve(
    destination || resolve(root, "..", "artifacts", sourceCommit.slice(0, 12)),
  );
  if (output === root || output.startsWith(root + sep))
    throw new Error(
      "Pastreaza arhiva in afara proiectului pentru a nu include date sau arhive in Git.",
    );
  await mkdir(output, { recursive: true });
  const physical = await realpath(output),
    physicalRoot = await realpath(root);
  if (physical === physicalRoot || physical.startsWith(physicalRoot + sep))
    throw new Error("Directorul de iesire nu poate indica proiectul.");
  if ((await lstat(output)).isSymbolicLink())
    throw new Error("Nu folosim legaturi pentru directorul arhivei.");
  const prefix = "ARTMASTER-COMPLETE-WINDOWS/",
    info =
      JSON.stringify(
        {
          name: "ARTMASTER-COMPLETE-WINDOWS",
          sourceCommit,
          sourceTree,
          nodeMinimum: "24",
          purpose:
            "Isolated local testing only. SQLite password authentication is not Supabase MFA.",
          files: selected.length,
          omitted:
            "Git metadata, legacy archive, dependencies, build output, runtime configuration, databases, attachments and backups",
        },
        null,
        2,
      ) + "\n";
  const archive = execFileSync(
    "git",
    [
      "archive",
      "--format=zip",
      `--prefix=${prefix}`,
      `--add-virtual-file=${prefix}PACKAGE-INFO.json:${info}`,
      "HEAD",
      "--",
      ...selected,
    ],
    { cwd: root, maxBuffer: 128 * 1024 * 1024 },
  );
  const path = resolve(output, "ARTMASTER-COMPLETE-WINDOWS.zip"),
    sha256 = createHash("sha256").update(archive).digest("hex");
  await writeFile(path, archive, { flag: "wx" });
  await writeFile(
    path + ".sha256",
    `${sha256}  ARTMASTER-COMPLETE-WINDOWS.zip\n`,
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        path,
        sha256,
        sourceCommit,
        files: selected.length + 1,
        bytes: archive.length,
      },
      null,
      2,
    ),
  );
  return { path, sha256, sourceCommit, selected, info };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  packageWindows(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
