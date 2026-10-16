import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { defaultContent } from "../src/lib/content/defaults";
import {
  candidateEquipment,
  equipmentCandidates,
} from "../src/lib/content/equipment-candidates";
import { screenshotPartnerCandidates } from "../src/lib/content/partner-candidates";
import { contentAssets, publicContent } from "../src/lib/content/assets";
import { contentSchema } from "../src/lib/server/schema";
import {
  createLocalAdmin,
  loginAdmin,
  actorForSession,
} from "../src/lib/server/auth";
import { LocalStorage } from "../src/lib/server/local";
import {
  storeMedia,
  storeHeroVideo,
  readPublishedMedia,
} from "../src/lib/server/media";
import {
  archiveMedia,
  mediaReferences,
  replaceDraftMedia,
} from "../src/lib/server/media-inventory";
import {
  contentHistory,
  restoreContent,
} from "../src/lib/server/content-history";
import { syntheticVideo } from "./fixtures/synthetic-video";
import type { Actor } from "../src/lib/server/types";
const directory = mkdtempSync(join(tmpdir(), "artmaster-complete-"));
const store = new LocalStorage();
let actor: Actor,
  version = 0,
  sourceId: number;
const document = structuredClone(defaultContent),
  urls: string[] = [];
before(async () => {
  Object.assign(process.env, {
    ARTMASTER_STORAGE: "local",
    ARTMASTER_DATA_DIR: directory,
    SITE_URL: "http://localhost:3000",
  });
  await createLocalAdmin(
    "complete@example.invalid",
    "Synthetic-private-password-43!",
    "admin",
  );
  const auth = await loginAdmin(
    "complete@example.invalid",
    "Synthetic-private-password-43!",
  );
  actor = (await actorForSession(auth.cookie))!;
  for (const color of ["#a83232", "#4c67a1", "#e7c947", "#91ae78", "#bc8ad2"]) {
    const buffer = await sharp({
      create: { width: 320, height: 160, channels: 4, background: color },
    })
      .png()
      .toBuffer();
    urls.push(
      (
        await storeMedia(
          new File(
            [new Uint8Array(buffer)],
            "Synthetic integrated artwork.png",
            { type: "image/png" },
          ),
          actor,
          "artwork",
        )
      ).url,
    );
  }
  const video = (
    await storeHeroVideo(
      new File([new Uint8Array(syntheticVideo)], "synthetic.mp4", {
        type: "video/mp4",
      }),
      actor,
    )
  ).url;
  document.heroMedia = { desktop: { image: urls[0], video } };
  document.banner = {
    enabled: true,
    desktop: {
      image: urls[1],
      width: 320,
      height: 160,
      alt: { ro: "Banner test", ru: "Тестовый баннер", en: "Test banner" },
    },
  };
  document.partners = [
    {
      ...screenshotPartnerCandidates()[0],
      name: "Synthetic integrated partner",
      image: urls[2],
      identity: "confirmed",
      relationshipConfirmed: true,
      rights: "owner-authorized",
      provenance: "Synthetic permission only",
      status: "published",
    },
  ];
  document.equipment.push({
    ...candidateEquipment(equipmentCandidates[0], 50),
    image: urls[3],
  });
});
after(() => rm(directory, { recursive: true, force: true }));
const bytes = (url: string) => readPublishedMedia(url.split("/").pop()!);
test("combined strict document preserves hero/video, panoramic banner, partners and equipment metadata in immutable history", async () => {
  assert.equal(contentSchema.safeParse(document).success, true);
  assert.ok(
    contentAssets(document).includes(document.heroMedia!.desktop.video!),
  );
  assert.ok(contentAssets(document).includes(urls[2]));
  version = await store.saveContent(document, false, actor, version);
  sourceId = (await contentHistory({ page: 1, pageSize: 1 })).versions[0].id;
  for (const url of urls.slice(0, 4)) await assert.rejects(() => bytes(url));
  const state = await store.content();
  assert.deepEqual(state.draft, document);
  assert.ok(
    mediaReferences(state).some(
      (r) => r.use.section === "hero" && r.url.endsWith(".mp4"),
    ),
  );
  for (const section of ["banner", "partners", "equipment"])
    assert.ok(mediaReferences(state).some((r) => r.use.section === section));
});
test("panoramic publication takes precedence without exposing inactive hero video or draft equipment", async () => {
  version = await store.saveContent(document, true, actor, version);
  assert.ok((await bytes(urls[1])).length);
  assert.ok((await bytes(urls[2])).length);
  for (const url of [urls[0], urls[3], document.heroMedia!.desktop.video!])
    await assert.rejects(() => bytes(url));
  assert.ok(
    !publicContent(document).equipment.some((e) => e.image === urls[3]),
  );
  for (const url of [
    urls[0],
    urls[1],
    urls[2],
    urls[3],
    document.heroMedia!.desktop.video!,
  ])
    await assert.rejects(() => archiveMedia(url, actor));
});
test("switching to image/video requires publication and retains both variants and partner permissions", async () => {
  const next = structuredClone(document);
  next.banner!.enabled = false;
  version = await store.saveContent(next, false, actor, version);
  await assert.rejects(() => bytes(urls[0]));
  assert.ok((await bytes(urls[1])).length);
  version = await store.saveContent(next, true, actor, version);
  assert.ok((await bytes(urls[0])).length);
  assert.ok((await bytes(next.heroMedia!.desktop.video!)).length);
  await assert.rejects(() => bytes(urls[1]));
  assert.deepEqual(
    (await store.content()).published!.banner!.desktop,
    document.banner!.desktop,
  );
  const replaced = await replaceDraftMedia(urls[1], urls[4], version, actor);
  version = replaced.version;
  const state = await store.content();
  assert.equal(state.draft!.banner!.desktop.image, urls[4]);
  assert.deepEqual(state.draft!.heroMedia, document.heroMedia);
  assert.deepEqual(state.draft!.partners, document.partners);
  assert.deepEqual(state.draft!.equipment, document.equipment);
});
test("restoration recovers the combined document into a new draft while the public mode and live version remain protected", async () => {
  const previous = (await store.content()).published;
  version = await restoreContent(sourceId, version, actor);
  assert.deepEqual((await store.content()).draft, document);
  assert.deepEqual((await store.content()).published, previous);
  await assert.rejects(() => restoreContent(sourceId, version - 1, actor));
  assert.equal((await store.content()).version, version);
});
