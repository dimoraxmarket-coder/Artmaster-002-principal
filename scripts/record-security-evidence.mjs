import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.NODE_ENV === "production")
  throw Error("Run evidence checks only in an isolated development/CI copy.");
const files = [
  "src/lib/server/backup.ts",
  "src/lib/server/config.ts",
  "src/lib/server/local.ts",
];
async function sourceHash() {
  const hash = createHash("sha256");
  for (const path of files) {
    hash.update(path + "\0");
    hash.update(await readFile(resolve(root, path)));
  }
  return hash.digest("hex");
}
const before = await sourceHash();
const run = spawnSync(
  process.execPath,
  [
    resolve(root, "node_modules/tsx/dist/cli.mjs"),
    "--test",
    "--test-reporter=tap",
    "tests/backup.test.ts",
  ],
  {
    cwd: root,
    env: { ...process.env, NODE_ENV: "test" },
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  },
);
const count = Number(/^# tests (\d+)$/m.exec(run.stdout || "")?.[1]),
  passed = Number(/^# pass (\d+)$/m.exec(run.stdout || "")?.[1]),
  skipped = Number(/^# skipped (\d+)$/m.exec(run.stdout || "")?.[1]);
if (
  run.status !== 0 ||
  count < 3 ||
  passed !== count ||
  skipped !== 0 ||
  before !== (await sourceHash())
)
  throw Error(
    "Restoration evidence not recorded: checks failed, did not run, or source changed.",
  );
const scan = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["audit", "--json"],
  {
    cwd: root,
    env: {
      ...process.env,
      npm_config_cache:
        process.env.npm_config_cache ||
        resolve(root, ".data", "npm-evidence-cache"),
    },
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    shell: process.platform === "win32",
  },
);
const report = JSON.parse(scan.stdout || "{}");
if (
  !report.metadata?.vulnerabilities ||
  !Number.isSafeInteger(report.metadata.vulnerabilities.total)
)
  throw Error("Dependency scan unavailable; no success evidence recorded.");
const checkedAt = new Date().toISOString();
await writeFile(
  resolve(root, "config/security-evidence.json"),
  JSON.stringify(
    {
      checkedAt,
      lockSha256: createHash("sha256")
        .update(await readFile(resolve(root, "package-lock.json")))
        .digest("hex"),
      source: "npm audit --json, all dependencies, isolated audit environment",
      total: report.metadata.vulnerabilities.total,
      restoration: {
        checkedAt,
        passed: count,
        scope:
          "Synthetic local restoration tests only; never production or hosted Supabase.",
        sourceSha256: before,
        files,
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    dependencyVulnerabilities: report.metadata.vulnerabilities.total,
    syntheticRestorationTests: count,
    checkedAt,
  }),
);
if (report.metadata.vulnerabilities.total) process.exitCode = 1;
