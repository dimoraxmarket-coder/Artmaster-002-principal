import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { validateUploads } from "../src/lib/server/uploads";
import { rasterWork } from "../src/lib/server/raster-work";
import { dataDirectory, BackendError } from "../src/lib/server/config";
import { structuredIssues } from "../src/lib/structured-data";
import { auditHTML, SEO_WEIGHTS } from "../src/lib/seo-audit";
import {
  publishedFingerprint,
  recordSeoAudit,
  seoHistory,
  seoFingerprint,
} from "../src/lib/server/seo-history";
import {
  createLocalAdmin,
  loginAdmin,
  logoutAdmin,
} from "../src/lib/server/auth";
import { LocalStorage, localDatabase } from "../src/lib/server/local";
import { defaultContent } from "../src/lib/content/defaults";
import { GET as posture } from "../src/app/api/admin/security/posture/route";
import { GET as historyRoute } from "../src/app/api/admin/seo/history/route";
import {
  requestGoogleReports,
  pageSpeed,
} from "../src/lib/server/google-reporting";
import type { Actor, Quote } from "../src/lib/server/types";
import { issueFormToken } from "../src/lib/server/guards";
import { quotePayloadHash } from '../src/lib/server/quote-identity';
import {
  analyticsLocation,
  analyticsReferrer,
  analyticsCookieNames,
} from "../src/lib/analytics-privacy";
const root = awaitDirectory();
test("analytics redacts query strings, credentials and fragments and only selects GA cookies for deletion", () => {
  assert.equal(
    analyticsLocation(
      "https://user:secret@artmaster.md/ro/contact?email=private#message",
    ),
    "https://artmaster.md/ro/contact",
  );
  assert.equal(
    analyticsReferrer("https://source.invalid/private?token=secret"),
    "https://source.invalid",
  );
  assert.equal(analyticsLocation("javascript:alert(1)"), "");
  assert.deepEqual(
    analyticsCookieNames(
      "_ga=123; artmaster_admin=secret; _ga_TEST=456; other=1",
    ),
    ["_ga", "_ga_TEST"],
  );
});
function awaitDirectory() {
  return mkdtemp(join(tmpdir(), "artmaster-ultimate-"));
}
after(async () => rm(await root, { recursive: true, force: true }));
const code = (name: string) => (e: unknown) =>
  e instanceof BackendError && e.code === name;
async function setup() {
  Object.assign(process.env, {
    ARTMASTER_STORAGE: "local",
    ARTMASTER_DATA_DIR: await root,
    SITE_URL: "http://localhost:3000",
  });
}
function report() {
  return auditHTML({
    path: "/ro",
    origin: "http://localhost:3000",
    html: '<html lang="ro"><head><title>ARTMASTER test published content</title></head><body><h1>ARTMASTER</h1></body></html>',
    sitemap: "",
    robots: "",
    paths: ["/ro"],
    assetExists: () => false,
    indexable: false,
  });
}
test("raster attachments are re-encoded without EXIF, scripts or harmless trailing polyglot markers", async () => {
  for (const format of ["png", "jpeg"] as const) {
    const original = await sharp({
      create: { width: 25, height: 12, channels: 3, background: "#ffca05" },
    })
      .withExif({ IFD0: { Artist: "Synthetic private metadata" } })
      .toFormat(format)
      .toBuffer();
    const input = Buffer.concat([
      original,
      Buffer.from("<script>HARMLESS_SYNTHETIC_MARKER</script>"),
    ]);
    const [clean] = await validateUploads([
      new File([Uint8Array.from(input)], `logo.${format}`, {
        type: `image/${format}`,
      }),
    ]);
    assert.equal(
      clean.bytes.includes(Buffer.from("HARMLESS_SYNTHETIC_MARKER")),
      false,
    );
    const meta = await sharp(clean.bytes).metadata();
    assert.equal(meta.width, 25);
    assert.equal(meta.height, 12);
    assert.equal(meta.exif, undefined);
    assert.equal(meta.format, format);
  }
});
test("raster validation rejects spoofing, extreme dimensions and executable extensions", async () => {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  const thin = await sharp({
    create: { width: 10001, height: 1, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  for (const [bytes, name, type] of [
    [png, "a.jpg", "image/jpeg"],
    [png, "a.svg.png", "image/png"],
    [thin, "wide.png", "image/png"],
    [Buffer.from("<svg/>"), "a.png", "image/png"],
  ] as const)
    await assert.rejects(
      () =>
        validateUploads([new File([Uint8Array.from(bytes)], name, { type })]),
      code("invalid_file"),
    );
});
test("pre-sanitization input identity survives raster cleanup without changing an existing attachment", async () => {
  await setup();
  const token = await issueFormToken(Date.now() - 2000),
    store = new LocalStorage();
  const png = await sharp({
    create: { width: 20, height: 10, channels: 3, background: "#ffca05" },
  })
    .png()
    .toBuffer();
  const bytes = Buffer.concat([png, Buffer.from("HARMLESS_LEGACY_TRAILER")]);
  const fields = {
    locale: "ro" as const,
    service: defaultContent.services[0].slug,
    name: "Synthetic legacy retry",
    email: "legacy@example.invalid",
    phone: "+37360010400",
    message: "Synthetic retry of a previously stored request.",
    company: "",
    dimensions: "",
    quantity: "",
    deadline: "",
    sourcePath: "/ro/contact",
  };
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        ...fields,
        files: [
          {
            name: "legacy.png",
            mime: "image/png",
            hash: createHash("sha256").update(bytes).digest("hex"),
          },
        ],
      }),
    )
    .digest("hex");
  const file = {
    id: randomUUID(),
    name: "legacy.png",
    mime: "image/png",
    size: bytes.length,
    path: randomUUID(),
  };
  const quote: Quote = {
    id: randomUUID(),
    ...fields,
    createdAt: new Date().toISOString(),
    status: "new",
    notification: "not_configured",
    files: [file],
    payloadHash,
    idempotencyKey: token.idempotencyKey,
  };
  await store.createQuote(quote, [{ name: file.name, mime: file.mime, bytes }]);
  const form = new FormData();
  for (const [key, value] of Object.entries({
    ...fields,
    consent: "true",
    website: "",
    ...token,
  }))
    form.set(key, value);
  form.set(
    "files",
    new File([Uint8Array.from(bytes)], file.name, { type: file.mime }),
  );
  const clean=await validateUploads(form.getAll('files'));
  assert.equal(quotePayloadHash(fields,clean),payloadHash);
  assert.equal((await store.findQuote(token.idempotencyKey))?.id,quote.id);
  assert.deepEqual(await store.readFile(file), bytes);
});
test("image workload admits two processors plus four waiters and recovers after failures", async () => {
  let active = 0,
    max = 0;
  const jobs = Array.from({ length: 6 }, () =>
    rasterWork(async () => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 12));
      active--;
    }),
  );
  await assert.rejects(
    () => rasterWork(async () => undefined),
    code("upload_busy"),
  );
  await Promise.all(jobs);
  assert.equal(max, 2);
  await assert.rejects(() =>
    rasterWork(async () => {
      throw Error("synthetic");
    }),
  );
  assert.equal(await rasterWork(async () => 42), 42);
});
test("private data configuration rejects direct public paths and symlinked ancestors before writing", async () => {
  await setup();
  const safe = process.env.ARTMASTER_DATA_DIR;
  const link = join(await root, "public-alias");
  await symlink(resolve("public"), link, "dir");
  try {
    for (const path of [
      resolve("public/private-test"),
      resolve(".next/static/private-test"),
      join(link, "not-created"),
    ]) {
      process.env.ARTMASTER_DATA_DIR = path;
      assert.throws(() => dataDirectory(), code("unavailable"));
    }
  } finally {
    process.env.ARTMASTER_DATA_DIR = safe;
  }
  assert.equal(dataDirectory(), await root);
});
test("structured checks reject empty graphs, invalid Service and malformed breadcrumb positions", () => {
  const wrap = (v: unknown) =>
    JSON.stringify({ "@context": "https://schema.org", ...(v as object) });
  for (const v of [
    { "@graph": [] },
    { "@graph": [{}] },
    { "@type": "Service", name: "Actual service" },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 8, name: "Home", item: "https://artmaster.md/ro" },
      ],
    },
  ])
    assert.ok(structuredIssues([wrap(v)], "https://artmaster.md").length);
  assert.deepEqual(
    structuredIssues(
      [
        wrap({
          "@type": "Organization",
          name: "ARTMASTER",
          url: "https://artmaster.md",
        }),
      ],
      "https://artmaster.md",
    ),
    [],
  );
  assert.equal(
    Object.values(SEO_WEIGHTS).reduce((n, v) => n + v, 0),
    100,
  );
});
test("SEO coverage fingerprints invalidate a new release without modifying published business content", async () => {
  await setup();
  assert.notEqual(
    seoFingerprint(defaultContent, "release-one"),
    seoFingerprint(defaultContent, "release-two"),
  );
  const previous = process.env.SITE_INDEXABLE;
  try {
    process.env.SITE_INDEXABLE = "false";
    const before = seoFingerprint(defaultContent, "same-release");
    process.env.SITE_INDEXABLE = "true";
    assert.notEqual(before, seoFingerprint(defaultContent, "same-release"));
  } finally {
    if (previous === undefined) delete process.env.SITE_INDEXABLE;
    else process.env.SITE_INDEXABLE = previous;
  }
});
test("durable SEO history survives reload, ignores drafts and invalidates coverage after publication", async () => {
  await setup();
  const actor: Actor = {
    id: createLocalAdmin(
      "audit-owner@example.invalid",
      "Synthetic-owner-only-password",
    ),
    email: "audit-owner@example.invalid",
    role: "admin",
    aal: "aal1",
  };
  const fingerprint = await publishedFingerprint();
  await recordSeoAudit(report(), actor, fingerprint);
  await recordSeoAudit({ ...report(), score: 42 }, actor, fingerprint);
  const before = await seoHistory("/ro");
  assert.equal(before.history.length, 2);
  assert.equal(before.history[0].report.score, 42);
  assert.equal(before.checkedPages, 1);
  assert.equal(before.overallScore, null);
  const store = new LocalStorage(),
    draft = structuredClone(defaultContent);
  draft.contact.companyName += " Synthetic draft";
  let version = await store.saveContent(draft, false, actor, 0);
  assert.equal((await seoHistory("/ro")).checkedPages, 1);
  version = await store.saveContent(draft, true, actor, version);
  assert.ok(version > 0);
  const after = await seoHistory("/ro");
  assert.equal(after.checkedPages, 0);
  assert.equal(after.history[0].currentContent, false);
  await assert.rejects(
    () => recordSeoAudit(report(), actor, fingerprint),
    code("version_conflict"),
  );
  await assert.rejects(() => seoHistory("/admin"), code("invalid_input"));
});
test("readiness diagnostics require live admin authorization; viewers, editors, disabled and revoked sessions are denied", async () => {
  await setup();
  const query = (cookie?: string) =>
    new Request("http://localhost:3000/api/admin/security/posture", {
      headers: cookie ? { Cookie: `artmaster_admin=${cookie}` } : {},
    });
  assert.equal((await posture(query())).status, 401);
  assert.equal((await historyRoute(query())).status, 401);
  for (const role of ["viewer", "editor", "admin"] as const) {
    const email = `posture-${role}@example.invalid`,
      password = "Synthetic-role-only-password";
    createLocalAdmin(email, password, role);
    const { cookie } = await loginAdmin(email, password);
    const response = await posture(query(cookie));
    assert.equal(response.status, role === "admin" ? 200 : 403);
    if (role === "admin") {
      const text = await response.text();
      assert.match(text, /not_tested/);
      assert.ok(!text.includes(await root));
      assert.ok(!text.includes(password));
      assert.match(response.headers.get("cache-control")!, /no-store/);
      localDatabase()
        .prepare("UPDATE admins SET enabled=0 WHERE email=?")
        .run(email);
      assert.equal((await posture(query(cookie))).status, 401);
    }
    await logoutAdmin(cookie);
    assert.equal((await posture(query(cookie))).status, 401);
  }
});
test("Google reporting derives real CTR and impression-weighted position only from a successful provider response", async () => {
  const data = await requestGoogleReports(
    {
      email: "",
      key: "",
      property: "",
      site: "https://artmaster.md/",
      ga4: false,
      search: true,
      pagespeed: false,
    },
    { start: "2026-01-01", end: "2026-01-02" },
    async () =>
      Response.json({
        rows: [
          { keys: ["2026-01-01"], clicks: 2, impressions: 10, position: 2 },
          { keys: ["2026-01-02"], clicks: 3, impressions: 30, position: 10 },
        ],
      }),
    async () => "synthetic-token",
  );
  assert.equal(data.search.ctr, 0.125);
  assert.equal(data.search.averagePosition, 8);
  assert.equal(data.ga4.users, null);
});
test("PageSpeed desktop adapter returns separate bounded lab categories and absent field data, without exposing credentials", async () => {
  await setup();
  const previous = { ...process.env },
    original = globalThis.fetch;
  const requests: URL[] = [];
  try {
    Object.assign(process.env, {
      SITE_URL: "https://staging.artmaster.md",
      ARTMASTER_PAGESPEED_ENABLED: "true",
      PAGESPEED_API_KEY: "SYNTHETIC-DO-NOT-EXPOSE",
    });
    globalThis.fetch = async (input) => {
      requests.push(new URL(String(input)));
      return Response.json({
        lighthouseResult: {
          categories: {
            performance: { score: 0.9 },
            accessibility: { score: 1 },
            "best-practices": { score: 1 },
            seo: { score: 1 },
          },
        },
      });
    };
    const result = await pageSpeed("/ro", "desktop");
    assert.equal(requests[0].searchParams.get("strategy"), "desktop");
    assert.equal(result.labCategories.performance, 90);
    assert.equal(result.field.inp, null);
    assert.ok(!JSON.stringify(result).includes("SYNTHETIC-DO-NOT-EXPOSE"));
  } finally {
    globalThis.fetch = original;
    for (const key of [
      "SITE_URL",
      "ARTMASTER_PAGESPEED_ENABLED",
      "PAGESPEED_API_KEY",
    ])
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
  }
});
test("PostgreSQL history migration has no anon/authenticated grants and rejects disabled writers and malformed audits", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const actor = randomUUID();
  try {
    await db.exec(
      "create role anon;create role authenticated;create role service_role;create table public.admin_roles(user_id uuid primary key,enabled boolean,role text);",
    );
    await db.exec(
      await readFile(
        "supabase/migrations/202610170001_seo_audit_history.sql",
        "utf8",
      ),
    );
    await db.query("insert into admin_roles values($1,true,$2)", [
      actor,
      "admin",
    ]);
    const record = (r: unknown) =>
      db.query("select record_seo_audit($1,$2,$3::jsonb,$4,$5)", [
        "https://artmaster.md",
        "/ro",
        JSON.stringify(r),
        actor,
        "a".repeat(64),
      ]);
    await assert.rejects(() => record({}));
    await record(report());
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from seo_audit_history",
        )
      ).rows[0].n,
      1,
    );
    await db.exec("set role anon");
    await assert.rejects(() => db.query("select * from seo_audit_history"));
    await assert.rejects(() => record(report()));
    await db.exec("reset role");
    await db.exec("set role authenticated");
    await assert.rejects(() => db.query("select * from seo_audit_history"));
    await db.exec("reset role");
    await db.query("update admin_roles set enabled=false where user_id=$1", [
      actor,
    ]);
    await assert.rejects(() => record(report()));
    const grants = await db.query<{ n: number }>(
      "select count(*)::int n from information_schema.role_routine_grants where routine_name='record_seo_audit' and grantee in ('anon','authenticated','PUBLIC')",
    );
    assert.equal(grants.rows[0].n, 0);
  } finally {
    await db.close();
  }
});
