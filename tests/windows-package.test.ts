import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import {
  localEnvironment,
  localPort,
  prepareConfiguration,
  requireCompatibleNode,
  assertPortAvailable,
} from "../scripts/windows-local.mjs";
import { distributable } from "../scripts/package-windows.mjs";
const roots: string[] = [];
after(() =>
  Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))),
);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "artmaster-windows-"));
  roots.push(root);
  await mkdir(join(root, "config"));
  await copyFile(
    new URL("../config/windows.env.example", import.meta.url),
    join(root, "config/windows.env.example"),
  );
  return root;
}
test("Windows launcher enforces compatible Node and isolates production credentials, mail, secrets and storage", () => {
  assert.throws(() => requireCompatibleNode("22.0.0"), /Node.js 24/);
  requireCompatibleNode("24.0.0");
  const env = localEnvironment("/synthetic-root", {
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-secret",
    SUPABASE_URL: "https://synthetic.invalid",
    NODE_ENV: "production",
    ARTMASTER_DATA_DIR: "/unrelated-data",
    SITE_URL: "https://synthetic.invalid",
    ARTMASTER_ALLOW_LOCAL_PRODUCTION: "true",
    RESEND_API_KEY: "synthetic-secret",
    ADMIN_PASSWORD: "synthetic-secret",
  });
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, "");
  assert.equal(env.SUPABASE_URL, "");
  assert.equal(env.ARTMASTER_SESSION_SECRET, "");
  assert.equal(env.RESEND_API_KEY, "");
  assert.equal(env.ADMIN_PASSWORD, "");
  assert.equal(env.ARTMASTER_ALLOW_LOCAL_PRODUCTION, "false");
  assert.equal(env.ARTMASTER_STORAGE, "local");
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.SITE_URL, "http://localhost:3000");
  assert.equal(
    env.ARTMASTER_DATA_DIR,
    join("/synthetic-root", ".data", "windows-local"),
  );
});
test("local port overrides remain numeric loopback configuration", () => {
  assert.equal(localPort("3001"), 3001);
  for (const port of ["0", "-1", "65536", "3000junk", "0.0.0.0:3000"])
    assert.throws(() => localPort(port), /ARTMASTER_LOCAL_PORT/);
  const env = localEnvironment("/synthetic-root", {
    ARTMASTER_LOCAL_PORT: "3001",
  });
  assert.equal(env.SITE_URL, "http://localhost:3001");
  assert.equal(env.PORT, "3001");
});
test("Windows setup is repeatable and never overwrites unrelated configuration or local data", async () => {
  const root = await fixture(),
    directory = await prepareConfiguration(root);
  await writeFile(
    join(directory, "synthetic-retained.txt"),
    "retain this synthetic fixture",
  );
  const config = await readFile(join(root, ".env.local"), "utf8");
  await prepareConfiguration(root);
  assert.equal(await readFile(join(root, ".env.local"), "utf8"), config);
  assert.equal(
    await readFile(join(directory, "synthetic-retained.txt"), "utf8"),
    "retain this synthetic fixture",
  );
  const foreign = await fixture();
  await writeFile(
    join(foreign, ".env.local"),
    "SUPABASE_URL=https://synthetic.invalid\n",
  );
  await assert.rejects(() => prepareConfiguration(foreign), /diferita/);
  assert.equal(
    await readFile(join(foreign, ".env.local"), "utf8"),
    "SUPABASE_URL=https://synthetic.invalid\n",
  );
  const occupied = await fixture();
  await mkdir(join(occupied, ".data", "windows-local"), { recursive: true });
  await writeFile(
    join(occupied, ".data", "windows-local", "synthetic.sqlite"),
    "existing fixture",
  );
  await assert.rejects(() => prepareConfiguration(occupied), /fara marcaj/);
  assert.equal(
    await readFile(
      join(occupied, ".data", "windows-local", "synthetic.sqlite"),
      "utf8",
    ),
    "existing fixture",
  );
});
test("Windows setup rejects alternate environment files and symlinked data roots", async () => {
  const root = await fixture();
  await writeFile(
    join(root, ".env.development.local"),
    "# synthetic foreign configuration",
  );
  await assert.rejects(
    () => prepareConfiguration(root),
    /\.env.development.local/,
  );
  const linked = await fixture(),
    outside = await fixture();
  await symlink(outside, join(linked, ".data"), "dir");
  await assert.rejects(() => prepareConfiguration(linked), /legatura/);
});
test("local launcher detects an occupied loopback port without stopping the existing server", async () => {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  try {
    await assert.rejects(() => assertPortAvailable(port), /ocupat/);
    assert.equal(server.listening, true);
  } finally {
    await new Promise<void>((done, reject) =>
      server.close((e) => (e ? reject(e) : done())),
    );
  }
  await assertPortAvailable(port);
});
test("Windows distribution allowlist retains complete application sources and excludes runtime and sensitive paths", () => {
  for (const path of [
    "src/app/admin/page.tsx",
    "src/app/[locale]/page.tsx",
    "public/media/hero-wide.webp",
    "config/windows.env.example",
    ".env.example",
    "scripts/create-admin.ts",
    "package-lock.json",
    "supabase/migrations/202610150005_content_studio.sql",
  ])
    assert.equal(distributable(path), true, path);
  for (const path of [
    ".env.local",
    "docs/.env.production",
    ".data/artmaster.sqlite",
    "node_modules/next/index.js",
    ".next/server/app.js",
    "backups/fixture.json",
    "test-results/trace.zip",
    "artmaster-machete.zip",
    "private/attachment.pdf",
    "docs/legacy.db",
    "src/../.env.local",
  ])
    assert.equal(distributable(path), false, path);
  assert.equal(distributable("public/synthetic.png", "120000"), false);
});
