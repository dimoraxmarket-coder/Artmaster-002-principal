import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import sharp from "sharp";
import {
  createLocalAdmin,
  loginAdmin,
  actorForSession,
  logoutAdmin,
} from "../src/lib/server/auth";
import { LocalStorage, localDatabase } from "../src/lib/server/local";
import { BackendError } from "../src/lib/server/config";
import {
  contentHistory,
  contentSnapshot,
  restoreContent,
} from "../src/lib/server/content-history";
import { savedDraftPreview } from "../src/lib/server/content-preview";
import { storeMedia, readPublishedMedia } from "../src/lib/server/media";
import {
  archiveMedia,
  replaceDraftMedia,
} from "../src/lib/server/media-inventory";
import { defaultContent } from "../src/lib/content/defaults";
import { websiteCopy } from "../src/lib/content/page-copy";
import { compareContent } from "../src/lib/content/compare";
import { contentSchema } from "../src/lib/server/schema";
import { HISTORY_LIMIT_BYTES } from "../src/lib/content/history-types";
import { GET as list } from "../src/app/api/admin/content/history/route";
import {
  GET as detail,
  POST as restore,
} from "../src/app/api/admin/content/history/[id]/route";
import type { Actor } from "../src/lib/server/types";
const directory = mkdtempSync(join(tmpdir(), "artmaster-content-"));
Object.assign(process.env, {
  ARTMASTER_STORAGE: "local",
  ARTMASTER_DATA_DIR: directory,
  SITE_URL: "http://localhost:3000",
});
after(() => rm(directory, { recursive: true, force: true }));
const store = new LocalStorage(),
  users: Record<string, { actor: Actor; cookie: string }> = {};
const failure = (code: string) => (error: unknown) =>
  error instanceof BackendError && error.code === code;
function request(cookie?: string, method = "GET", body?: unknown) {
  return new Request("http://localhost:3000/api/admin/content/history", {
    method,
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: `artmaster_admin=${cookie}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const context = (id: number) => ({
  params: Promise.resolve({ id: String(id) }),
});
async function image() {
  const bytes = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#f6cd31" },
  })
    .png()
    .toBuffer();
  return storeMedia(
    new File([Uint8Array.from(bytes)], "synthetic.png", { type: "image/png" }),
    users.admin.actor,
  );
}
test("history endpoints and preview deny unauthenticated users; authenticated roles get real immutable snapshots", async () => {
  for (const role of ["admin", "editor", "viewer"] as const) {
    await createLocalAdmin(
      `${role}@example.invalid`,
      "Synthetic-only-password-29!",
      role,
    );
    const auth = await loginAdmin(
      `${role}@example.invalid`,
      "Synthetic-only-password-29!",
    );
    users[role] = {
      cookie: auth.cookie,
      actor: (await actorForSession(auth.cookie))!,
    };
  }
  assert.equal((await list(request())).status, 401);
  assert.equal((await detail(request(), context(1))).status, 401);
  assert.equal(
    (
      await restore(
        request(undefined, "POST", { version: 0, confirm: true }),
        context(1),
      )
    ).status,
    401,
  );
  await assert.rejects(
    () => savedDraftPreview(request()),
    failure("unauthorized"),
  );
  await store.saveContent(defaultContent, true, users.admin.actor, 0);
  const saved = structuredClone(defaultContent);
  saved.services[0].title = {
    ro: "Ciornă privată RO",
    ru: "Приватный черновик",
    en: "Private draft EN",
  };
  saved.copy = websiteCopy(saved);
  saved.copy.hero.title = {
    ro: "Titlu privat",
    ru: "Приватный заголовок",
    en: "Private headline",
  };
  await store.saveContent(saved, false, users.editor.actor, 1);
  const page = await contentHistory({ page: 1, pageSize: 1 });
  assert.equal(page.total, 2);
  assert.equal(page.versions[0].actor, users.editor.actor.id);
  assert.equal(page.versions[0].action, "draft");
  assert.equal(page.versions[0].version, 2);
  assert.ok(Date.parse(page.versions[0].createdAt) > 0);
  assert.equal("content" in page.versions[0], false);
  for (const user of Object.values(users)) {
    const response = await list(request(user.cookie));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /private.*no-store/);
    assert.equal((await detail(request(user.cookie), context(2))).status, 200);
    const preview = await savedDraftPreview(request(user.cookie));
    assert.equal(preview.content.services[0].title.en, "Private draft EN");
  }
  assert.equal(
    (await store.content()).published!.services[0].title.en,
    defaultContent.services[0].title.en,
  );
  for (const sql of [
    "UPDATE content_versions SET content='{}' WHERE id=1",
    "DELETE FROM content_versions WHERE id=1",
  ])
    assert.throws(() => localDatabase().exec(sql), /immutable/);
  assert.deepEqual((await contentSnapshot(1)).content, defaultContent);
});
test("restore is editor-only, origin-checked, CAS-protected and creates a new draft without publishing", async () => {
  const before = await store.content();
  assert.equal(
    (
      await restore(
        request(users.viewer.cookie, "POST", { version: 2, confirm: true }),
        context(1),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await restore(
        new Request("http://localhost:3000", {
          method: "POST",
          headers: {
            Origin: "https://invalid.example",
            Cookie: `artmaster_admin=${users.admin.cookie}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ version: 2, confirm: true }),
        }),
        context(1),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await restore(
        request(users.editor.cookie, "POST", { version: 1, confirm: true }),
        context(1),
      )
    ).status,
    409,
  );
  assert.equal((await contentHistory({ page: 1, pageSize: 10 })).total, 2);
  const result = await restore(
    request(users.editor.cookie, "POST", { version: 2, confirm: true }),
    context(1),
  );
  assert.equal(result.status, 200);
  assert.equal((await result.json()).version, 3);
  assert.deepEqual((await store.content()).published, before.published);
  assert.deepEqual((await store.content()).draft, defaultContent);
  const history = await contentHistory({ page: 1, pageSize: 10 });
  assert.equal(history.total, 3);
  assert.equal(history.versions[0].action, "restore");
  assert.equal(history.versions[0].sourceId, 1);
  assert.deepEqual((await contentSnapshot(2)).content, before.draft);
  assert.equal(
    (
      await restore(
        request(users.admin.cookie, "POST", { version: 3, confirm: false }),
        context(1),
      )
    ).status,
    400,
  );
  assert.equal(
    (await detail(request(users.viewer.cookie), context(999))).status,
    404,
  );
});
test("media replacement participates in history; archived and missing assets prevent restoration without partial writes", async () => {
  const first = await image(),
    second = await image(),
    draft = structuredClone(defaultContent);
  draft.projects[0].image = first.url;
  draft.projects[0].published = false;
  let version = await store.saveContent(draft, false, users.editor.actor, 3);
  const source = (await contentHistory({ page: 1, pageSize: 1 })).versions[0];
  await assert.rejects(
    () => readPublishedMedia(first.url.split("/").pop()!),
    failure("not_found"),
  );
  version = (
    await replaceDraftMedia(first.url, second.url, version, users.editor.actor)
  ).version;
  assert.equal(
    (await contentHistory({ page: 1, pageSize: 1 })).versions[0].version,
    version,
  );
  await archiveMedia(first.url, users.admin.actor);
  await assert.rejects(
    () => restoreContent(source.id, version, users.editor.actor),
    failure("asset_unavailable"),
  );
  const missingVersion = (await contentHistory({ page: 1, pageSize: 1 }))
    .versions[0];
  await unlink(join(directory, "media", second.url.split("/").pop()!));
  const count = (await contentHistory({ page: 1, pageSize: 1 })).total;
  await assert.rejects(
    () => restoreContent(missingVersion.id, version, users.editor.actor),
    failure("asset_unavailable"),
  );
  assert.equal((await store.content()).version, version);
  assert.equal((await contentHistory({ page: 1, pageSize: 1 })).total, count);
});
test("revoked sessions cannot inspect history or preview drafts or restore", async () => {
  const viewer = users.viewer;
  await logoutAdmin(viewer.cookie);
  assert.equal((await list(request(viewer.cookie))).status, 401);
  assert.equal((await detail(request(viewer.cookie), context(1))).status, 401);
  assert.equal(
    (
      await restore(
        request(viewer.cookie, "POST", { version: 5, confirm: true }),
        context(1),
      )
    ).status,
    401,
  );
  await assert.rejects(
    () => savedDraftPreview(request(viewer.cookie)),
    failure("unauthorized"),
  );
});
test("structured multilingual copy remains backward compatible and comparisons escape at rendering rather than accepting executable HTML", () => {
  assert.deepEqual(contentSchema.parse(defaultContent), defaultContent);
  const next = structuredClone(defaultContent);
  next.copy = websiteCopy(next);
  for (const locale of ["ro", "ru", "en"] as const) {
    assert.ok(next.copy.hero.title[locale]);
    assert.ok(next.copy.about.body[locale]);
  }
  next.services[0].title.en = "<script>alert(1)</script>";
  const diff = compareContent(defaultContent, next);
  assert.ok(
    diff.changes.some(
      (c) => c.path === "services.0.title.en" && c.after.includes("<script>"),
    ),
  );
  assert.equal(
    contentSchema.safeParse({ ...next, html: "<script>x</script>" }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({
      ...next,
      copy: {
        ...next.copy,
        hero: { ...next.copy.hero, title: { ro: "", ru: "", en: "" } },
      },
    }).success,
    false,
  );
});
test("additive SQLite initialization retains existing published and draft baselines exactly once", async () => {
  const legacy = mkdtempSync(join(tmpdir(), "artmaster-legacy-content-")),
    path = join(legacy, "artmaster.sqlite"),
    db = new DatabaseSync(path);
  const draft = structuredClone(defaultContent);
  draft.contact.companyName = "Synthetic legacy draft";
  db.exec(
    "CREATE TABLE content(id INTEGER PRIMARY KEY,published TEXT,draft TEXT,version INTEGER NOT NULL)",
  );
  db.prepare("INSERT INTO content VALUES(1,?,?,12)").run(
    JSON.stringify(defaultContent),
    JSON.stringify(draft),
  );
  db.close();
  process.env.ARTMASTER_DATA_DIR = legacy;
  try {
    const state = await new LocalStorage().content();
    assert.equal(state.version, 12);
    assert.deepEqual(state.draft, draft);
    const history = await contentHistory({ page: 1, pageSize: 10 });
    assert.equal(history.total, 2);
    assert.deepEqual(
      (await contentSnapshot(history.versions[0].id)).content,
      draft,
    );
    await new LocalStorage().content();
    assert.equal((await contentHistory({ page: 1, pageSize: 10 })).total, 2);
  } finally {
    process.env.ARTMASTER_DATA_DIR = directory;
    await rm(legacy, { recursive: true, force: true });
  }
});
test("history storage capacity stops saves atomically without deleting content, history or audit", async () => {
  const before = await store.content(),
    db = localDatabase();
  db.prepare(
    "INSERT INTO content_versions(version,action,created_at,bytes,content) VALUES(?,?,?,?,?)",
  ).run(
    before.version,
    "baseline-draft",
    new Date().toISOString(),
    HISTORY_LIMIT_BYTES,
    JSON.stringify(defaultContent),
  );
  const count = (await contentHistory({ page: 1, pageSize: 1 })).total,
    logs = db.prepare("SELECT count(*) n FROM audit").get();
  await assert.rejects(
    () =>
      store.saveContent(
        defaultContent,
        false,
        users.admin.actor,
        before.version,
      ),
    failure("history_limit"),
  );
  assert.deepEqual(await store.content(), before);
  assert.equal((await contentHistory({ page: 1, pageSize: 1 })).total, count);
  assert.deepEqual(db.prepare("SELECT count(*) n FROM audit").get(), logs);
});
