import { syntheticVideo } from "./fixtures/synthetic-video";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  createLocalAdmin,
  loginAdmin,
  actorForSession,
  logoutAdmin,
} from "../src/lib/server/auth";
import {
  storeMedia,
  storeHeroVideo,
  readMedia,
  readPublishedMedia,
  mediaResponse,
} from "../src/lib/server/media";
import { LocalStorage } from "../src/lib/server/local";
import {
  archiveMedia,
  mediaReferences,
  replaceDraftMedia,
} from "../src/lib/server/media-inventory";
import {
  restoreContent,
  contentHistory,
} from "../src/lib/server/content-history";
import { POST as upload } from "../src/app/api/admin/hero/route";
import { GET as overview } from "../src/app/api/admin/seo/route";
import { POST as audit } from "../src/app/api/admin/seo/audit/route";
import { POST as speed } from "../src/app/api/admin/seo/pagespeed/route";
import { defaultContent } from "../src/lib/content/defaults";
import { contentAssets } from "../src/lib/content/assets";
import type { Actor } from "../src/lib/server/types";
const directory = mkdtempSync(join(tmpdir(), "artmaster-hero-test-"));
let actor: Actor, cookie: string, viewer: string;
const store = new LocalStorage();
before(async () => {
  Object.assign(process.env, {
    ARTMASTER_STORAGE: "local",
    ARTMASTER_DATA_DIR: directory,
    SITE_URL: "http://localhost:3000",
  });
  await createLocalAdmin(
    "hero-admin@example.invalid",
    "Synthetic-private-password-54!",
    "admin",
  );
  const a = await loginAdmin(
    "hero-admin@example.invalid",
    "Synthetic-private-password-54!",
  );
  cookie = a.cookie;
  actor = (await actorForSession(cookie))!;
  await createLocalAdmin(
    "hero-viewer@example.invalid",
    "Synthetic-private-password-54!",
    "viewer",
  );
  viewer = (
    await loginAdmin(
      "hero-viewer@example.invalid",
      "Synthetic-private-password-54!",
    )
  ).cookie;
});
after(() => rm(directory, { recursive: true, force: true }));
const req = (session?: string, body?: BodyInit) =>
  new Request("http://localhost:3000/api/admin/hero", {
    method: body ? "POST" : "GET",
    headers: {
      Origin: "http://localhost:3000",
      ...(session ? { Cookie: `artmaster_admin=${session}` } : {}),
    },
    ...(body ? { body } : {}),
  });
const error = (code: string) => (e: unknown) =>
  e instanceof Error && e.message === code;
async function photo() {
  return new File(
    [
      Uint8Array.from(
        await sharp({
          create: {
            width: 320,
            height: 180,
            channels: 3,
            background: "#f4d342",
          },
        })
          .png()
          .toBuffer(),
      ),
    ],
    "synthetic.png",
    { type: "image/png" },
  );
}
test("all new endpoints deny anonymous users and read-only roles cannot upload or run PageSpeed", async () => {
  const form = new FormData();
  form.set("file", await photo());
  form.set("rightsConfirmed", "true");
  assert.equal((await upload(req(undefined, form))).status, 401);
  assert.equal((await overview(req())).status, 401);
  assert.equal(
    (await audit(req(undefined, JSON.stringify({ path: "/ro" })))).status,
    401,
  );
  assert.equal((await speed(req(undefined, "{}"))).status, 401);
  assert.equal((await upload(req(viewer, form))).status, 403);
  assert.equal((await speed(req(viewer, "{}"))).status, 403);
});
test("hero upload requires rights confirmation and a valid server-side crop", async () => {
  const form = new FormData();
  form.set("file", await photo());
  assert.equal((await upload(req(cookie, form))).status, 400);
  form.set("rightsConfirmed", "true");
  form.set("crop", JSON.stringify({ x: 0.9, y: 0, width: 0.5, height: 1 }));
  assert.equal((await upload(req(cookie, form))).status, 400);
  form.set(
    "crop",
    JSON.stringify({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }),
  );
  const result = await upload(req(cookie, form));
  assert.equal(result.status, 201);
  const image = await result.json();
  assert.equal(image.width, 160);
  assert.equal(image.height, 90);
  await assert.rejects(
    () => readPublishedMedia(image.url.split("/").pop()),
    error("not_found"),
  );
});
test("video type verification rejects spoofed executable or image bytes", async () => {
  await assert.rejects(
    () =>
      storeHeroVideo(
        new File(["<script>bad</script>"], "fake.mp4", { type: "video/mp4" }),
        actor,
      ),
    error("invalid_file"),
  );
});
test("responsive hero images stay private until publication, track usage, protect archival and restore into a new draft", async () => {
  const first = await storeMedia(await photo(), actor),
    mobile = await storeMedia(await photo(), actor),
    value = structuredClone(defaultContent);
  value.heroMedia = {
    desktop: { image: first.url },
    mobile: { image: mobile.url },
  };
  let state = await store.content();
  await store.saveContent(value, false, actor, state.version);
  await assert.rejects(
    () => readPublishedMedia(first.url.split("/").pop()!),
    error("not_found"),
  );
  state = await store.content();
  assert.equal(
    mediaReferences(state).filter((r) => r.use.section === "hero").length,
    2,
  );
  assert.ok(contentAssets(value).includes(mobile.url));
  await assert.rejects(
    () => archiveMedia(first.url, actor),
    error("asset_in_use"),
  );
  await store.saveContent(value, true, actor, state.version);
  assert.ok((await readPublishedMedia(first.url.split("/").pop()!)).length > 0);
  const history = await contentHistory({ page: 1, pageSize: 10 });
  const source = history.versions.find((v) => v.action === "publish")!;
  const next = await storeMedia(await photo(), actor);
  state = await store.content();
  await replaceDraftMedia(first.url, next.url, state.version, actor);
  assert.equal(
    (await store.content()).draft?.heroMedia?.desktop.image,
    next.url,
  );
  state = await store.content();
  await restoreContent(source.id, state.version, actor);
  assert.equal(
    (await store.content()).draft?.heroMedia?.desktop.image,
    first.url,
  );
  assert.equal(
    (await store.content()).published?.heroMedia?.desktop.image,
    first.url,
  );
  assert.ok((await readMedia(first.url.split("/").pop()!)).length > 0);
});
test("video publication, archival and restoration preserve reference confidentiality", async () => {
  const media = await storeHeroVideo(
    new File([Uint8Array.from(syntheticVideo)], "synthetic.mp4", {
      type: "video/mp4",
    }),
    actor,
  );
  let current = await store.content();
  const value = structuredClone(current.draft!);
  value.heroMedia!.desktop.video = media.url;
  await assert.rejects(
    () => readPublishedMedia(media.url.split("/").pop()!),
    error("not_found"),
  );
  await store.saveContent(value, true, actor, current.version);
  assert.deepEqual(
    await readPublishedMedia(media.url.split("/").pop()!),
    syntheticVideo,
  );
  const source = (await contentHistory({ page: 1, pageSize: 1 })).versions[0];
  await assert.rejects(
    () => archiveMedia(media.url, actor),
    error("asset_in_use"),
  );
  current = await store.content();
  delete value.heroMedia!.desktop.video;
  await store.saveContent(value, true, actor, current.version);
  await archiveMedia(media.url, actor);
  current = await store.content();
  await assert.rejects(
    () => restoreContent(source.id, current.version, actor),
    error("asset_unavailable"),
  );
  assert.equal(
    (await store.content()).published?.heroMedia?.desktop.video,
    undefined,
  );
});
test("byte ranges are bounded, typed and always no-store", async () => {
  const bytes = Buffer.from("0123456789");
  for (const [range, status, expected] of [
    ["bytes=2-4", 206, "234"],
    ["bytes=-2", 206, "89"],
    ["bytes=99-", 416, ""],
    ["bytes=1-2,4-5", 416, ""],
  ] as const) {
    const r = mediaResponse(
      bytes,
      "synthetic.mp4",
      new Request("http://localhost", { headers: { Range: range } }),
      true,
    );
    assert.equal(r.status, status);
    assert.equal(await r.text(), expected);
    assert.equal(r.headers.get("Content-Type"), "video/mp4");
    assert.equal(r.headers.get("Cache-Control"), "private, no-store");
  }
});
test("revoked sessions lose access to all new security-sensitive endpoints", async () => {
  await logoutAdmin(cookie);
  const form = new FormData();
  form.set("file", await photo());
  form.set("rightsConfirmed", "true");
  assert.equal((await upload(req(cookie, form))).status, 401);
  assert.equal((await overview(req(cookie))).status, 401);
  assert.equal((await audit(req(cookie, "{}"))).status, 401);
  assert.equal((await speed(req(cookie, "{}"))).status, 401);
});
