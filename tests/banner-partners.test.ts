import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { defaultContent } from "../src/lib/content/defaults";
import { screenshotPartnerCandidates } from "../src/lib/content/partner-candidates";
import { contentSchema } from "../src/lib/server/schema";
import {
  contentAssets,
  publishedImageUrls,
} from "../src/lib/content/visual-assets";
import { LocalStorage, localDatabase } from "../src/lib/server/local";
import {
  createLocalAdmin,
  loginAdmin,
  actorForSession,
} from "../src/lib/server/auth";
import {
  storeMedia,
  readMedia,
  readPublishedMedia,
} from "../src/lib/server/media";
import {
  archiveMedia,
  inventory,
  mediaQuerySchema,
  replaceDraftMedia,
} from "../src/lib/server/media-inventory";
import {
  restoreContent,
  contentHistory,
} from "../src/lib/server/content-history";
import { PUT } from "../src/app/api/admin/content/route";
import type { Actor } from "../src/lib/server/types";
const directory = mkdtempSync(join(tmpdir(), "artmaster-visuals-"));
Object.assign(process.env, {
  ARTMASTER_STORAGE: "local",
  ARTMASTER_DATA_DIR: directory,
  SITE_URL: "http://localhost:3000",
});
after(() => rm(directory, { recursive: true, force: true }));
const store = new LocalStorage();
const members: Record<string, { actor: Actor; cookie: string }> = {};
const content = structuredClone(defaultContent);
let version = 0,
  image: string,
  second: string,
  snapshot: number;
const notFound = (e: unknown) =>
  e instanceof Error && "code" in e && e.code === "not_found";
function request(role?: string, action = "save-draft", v = version) {
  return new Request("http://localhost:3000/api/admin/content", {
    method: "PUT",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      ...(role ? { Cookie: `artmaster_admin=${members[role].cookie}` } : {}),
    },
    body: JSON.stringify({ content, version: v, action }),
  });
}
test("screenshot transcription has 15 distinct unconfirmed candidates, no fabricated assets or ARTMASTER self-endorsement", () => {
  const list = screenshotPartnerCandidates();
  assert.equal(list.length, 15);
  assert.equal(new Set(list.map((p) => p.slug)).size, 15);
  assert.ok(
    list.every(
      (p) =>
        p.status === "draft" &&
        p.identity === "unconfirmed" &&
        !p.relationshipConfirmed &&
        !p.image &&
        !p.website &&
        p.rights === "unverified",
    ),
  );
  assert.ok(!list.some((p) => p.name === "ARTMASTER"));
  assert.equal(
    contentSchema.safeParse({ ...defaultContent, partners: list }).success,
    true,
  );
});
test("schema requires confirmed relationships, documented logo rights and safe source URLs", () => {
  const p = screenshotPartnerCandidates()[0];
  const valid = (patch: object) =>
    contentSchema.safeParse({
      ...defaultContent,
      partners: [{ ...p, ...patch }],
    }).success;
  assert.equal(valid({ status: "published" }), false);
  assert.equal(
    valid({
      status: "published",
      identity: "confirmed",
      relationshipConfirmed: true,
    }),
    true,
  );
  const ready = {
    status: "published",
    identity: "confirmed",
    relationshipConfirmed: true,
    image: "/media/hero-wide.webp",
  };
  assert.equal(valid(ready), false);
  assert.equal(
    valid({
      ...ready,
      rights: "owner-authorized",
      provenance: "Permission recorded by owner",
    }),
    true,
  );
  assert.equal(
    valid({
      ...ready,
      rights: "official-permission",
      provenance: "Authorized usage",
    }),
    false,
  );
  assert.equal(
    valid({
      ...ready,
      rights: "official-permission",
      provenance: "Authorized usage",
      sourceUrl: "https://company.example/press",
    }),
    true,
  );
  for (const website of [
    "javascript:alert(1)",
    "https://user:secret@company.example",
    "http://company.example",
    "https://company.example/?token=secret",
  ])
    assert.equal(valid({ website }), false);
  assert.equal(
    contentSchema.safeParse({ ...defaultContent, partners: [p, p] }).success,
    false,
  );
  assert.equal(
    contentSchema.safeParse({
      ...defaultContent,
      partners: [p, { ...p, slug: "different", name: p.name.toLowerCase() }],
    }).success,
    false,
  );
});
test("media upload losslessly preserves sharp pixels, alpha, full panorama and strips metadata", async () => {
  for (const role of ["admin", "editor", "viewer"] as const) {
    await createLocalAdmin(
      `${role}@example.invalid`,
      "Visual-synthetic-password-29!",
      role,
    );
    const session = await loginAdmin(
      `${role}@example.invalid`,
      "Visual-synthetic-password-29!",
    );
    members[role] = {
      actor: (await actorForSession(session.cookie))!,
      cookie: session.cookie,
    };
  }
  const raw = Buffer.alloc(1944 * 809 * 4);
  for (let i = 0; i < raw.length; i += 4) {
    raw[i] = i % 256;
    raw[i + 1] = 40;
    raw[i + 2] = 120;
    raw[i + 3] = i % 12 ? 255 : 0;
  }
  const bytes = await sharp(raw, {
    raw: { width: 1944, height: 809, channels: 4 },
  })
    .png()
    .toBuffer();
  const result = await storeMedia(
    new File([new Uint8Array(bytes)], "Synthetic panorama.png", {
      type: "image/png",
    }),
    members.admin.actor,
  );
  image = result.url;
  assert.equal(result.width, 1944);
  assert.equal(result.height, 809);
  const decoded = await sharp(await readMedia(image.split("/").pop()!))
    .raw()
    .toBuffer();
  // Transparent RGB can be normalized by codecs. Every visible pixel must be exact.
  for (let i = 0; i < raw.length; i += 4)
    if (raw[i + 3])
      assert.deepEqual(decoded.subarray(i, i + 4), raw.subarray(i, i + 4));
  const metadata = await sharp(
    await readMedia(image.split("/").pop()!),
  ).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.exif, undefined);
  second = (
    await storeMedia(
      new File(
        [
          new Uint8Array(
            await sharp({
              create: {
                width: 200,
                height: 100,
                channels: 4,
                background: "#ffee55",
              },
            })
              .png()
              .toBuffer(),
          ),
        ],
        "Synthetic replacement.png",
        { type: "image/png" },
      ),
      members.admin.actor,
    )
  ).url;
  content.banner = {
    enabled: true,
    desktop: {
      image,
      width: 1944,
      height: 809,
      alt: {
        ro: "Banner sintetic",
        ru: "Тестовый баннер",
        en: "Synthetic banner",
      },
    },
  };
  content.partners = [{ ...screenshotPartnerCandidates()[0], image: second }];
});
test("visual content API retains role authorization, explicit publication and stale-write protection", async () => {
  assert.equal((await PUT(request())).status, 401);
  assert.equal((await PUT(request("viewer"))).status, 403);
  assert.equal((await PUT(request("editor", "publish"))).status, 403);
  const response = await PUT(request("editor"));
  assert.equal(response.status, 200);
  version = (await response.json()).version;
  assert.equal(
    (await PUT(request("admin", "save-draft", version - 1))).status,
    409,
  );
  assert.equal((await store.content()).published, null);
  snapshot = (await contentHistory({ page: 1, pageSize: 10 })).versions[0].id;
});
test("draft banner and partner logos remain private, tracked and protected from archival", async () => {
  for (const url of [image, second]) {
    await assert.rejects(
      () => readPublishedMedia(url.split("/").pop()!),
      notFound,
    );
    await assert.rejects(() => archiveMedia(url, members.admin.actor));
  }
  const page = await inventory(mediaQuerySchema.parse({}));
  assert.ok(
    page.assets
      .find((a) => a.url === image)
      ?.uses.some((u) => u.section === "banner" && u.state === "draft"),
  );
  assert.ok(
    page.assets
      .find((a) => a.url === second)
      ?.uses.some((u) => u.section === "partners" && u.state === "draft"),
  );
  assert.ok(contentAssets(content).some((r) => r.image === second));
});
test("publication grants only enabled banner and approved published partner bytes", async () => {
  version = await store.saveContent(
    content,
    true,
    members.admin.actor,
    version,
  );
  assert.ok((await readPublishedMedia(image.split("/").pop()!)).length);
  await assert.rejects(
    () => readPublishedMedia(second.split("/").pop()!),
    notFound,
  );
  const p = content.partners![0];
  Object.assign(p, {
    identity: "confirmed",
    relationshipConfirmed: true,
    status: "published",
    rights: "owner-authorized",
    provenance: "Synthetic test permission",
  });
  version = await store.saveContent(
    content,
    true,
    members.admin.actor,
    version,
  );
  assert.ok((await readPublishedMedia(second.split("/").pop()!)).length);
  p.status = "hidden";
  content.banner!.enabled = false;
  assert.ok(!publishedImageUrls(content).includes(second));
  assert.ok(!publishedImageUrls(content).includes(image));
  version = await store.saveContent(
    content,
    true,
    members.admin.actor,
    version,
  );
  await assert.rejects(
    () => readPublishedMedia(image.split("/").pop()!),
    notFound,
  );
  await assert.rejects(
    () => readPublishedMedia(second.split("/").pop()!),
    notFound,
  );
});
test("Media Studio replacements create a draft, update banner dimensions and reset new logo permissions", async () => {
  const replaced = await replaceDraftMedia(
    image,
    second,
    version,
    members.admin.actor,
  );
  version = replaced.version;
  let state = await store.content();
  assert.equal(state.draft!.banner!.desktop.width, 200);
  assert.equal(state.draft!.banner!.desktop.height, 100);
  assert.equal(state.published!.banner!.desktop.image, image);
  const logo = await replaceDraftMedia(
    second,
    image,
    version,
    members.admin.actor,
  );
  version = logo.version;
  state = await store.content();
  assert.equal(state.draft!.partners![0].rights, "unverified");
  assert.equal(state.draft!.partners![0].provenance, "");
  assert.equal(state.published!.partners![0].image, second);
});
test("immutable visual snapshots restore into a new draft and refuse unavailable or archived images", async () => {
  const previous = (await store.content()).published;
  version = await restoreContent(snapshot, version, members.admin.actor);
  assert.deepEqual((await store.content()).published, previous);
  assert.equal((await store.content()).draft!.banner!.desktop.image, image);
  await unlink(join(directory, "media", image.split("/").pop()!));
  await assert.rejects(() =>
    restoreContent(snapshot, version, members.admin.actor),
  );
  localDatabase()
    .prepare("UPDATE media_assets SET archived_at=? WHERE url=?")
    .run(new Date().toISOString(), second);
  await assert.rejects(() =>
    store.saveContent(content, false, members.admin.actor, version),
  );
  assert.equal((await store.content()).version, version);
});
test("PostgreSQL additive document guard rejects unconfirmed publication and leaves old JSON documents unchanged", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readFile } = await import("node:fs/promises");
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create table public.site_content(id integer primary key,published jsonb,draft jsonb);insert into public.site_content values(1,null,null);",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/202610160002_homepage_visuals.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const update = (value: object) =>
      db.query("update public.site_content set draft=$1 where id=1", [
        JSON.stringify(value),
      ]);
    await update({ services: [] });
    const initial = (
      await db.query<{ draft: unknown }>(
        "select draft from public.site_content",
      )
    ).rows[0];
    assert.deepEqual(initial.draft, { services: [] });
    const p = screenshotPartnerCandidates()[0];
    for (const partners of [
      [{ ...p, status: "published" }],
      [p, p],
      [
        {
          ...p,
          status: "published",
          identity: "confirmed",
          relationshipConfirmed: true,
          image: "/api/media/example.webp",
        },
      ],
    ])
      await assert.rejects(() => update({ partners }));
    await update({
      partners: [
        {
          ...p,
          status: "published",
          identity: "confirmed",
          relationshipConfirmed: true,
        },
      ],
    });
    await update({
      partners: [
        {
          ...p,
          status: "published",
          identity: "confirmed",
          relationshipConfirmed: true,
          image: "/api/media/example.webp",
          rights: "official-permission",
          provenance: "Synthetic permission",
          sourceUrl: "https://company.example/press",
        },
      ],
    });
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from information_schema.role_routine_grants where routine_name='guard_homepage_visuals' and grantee in ('anon','authenticated','service_role','PUBLIC')",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
