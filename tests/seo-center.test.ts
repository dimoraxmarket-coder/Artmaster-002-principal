import { isPublicPageSpeedOrigin } from "../src/lib/server/google-reporting";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { auditHTML, publicPaths } from "../src/lib/seo-audit";
import { defaultContent } from "../src/lib/content/defaults";
import {
  candidateEquipment,
  equipmentCandidates,
} from "../src/lib/content/equipment-candidates";
import { contentSchema } from "../src/lib/server/schema";
import { publicContent } from "../src/lib/content/assets";
import {
  dateRangeSchema,
  conversionDays,
  auditPage,
} from "../src/lib/server/seo-center";
import {
  emptyGoogleReports,
  requestGoogleReports,
} from "../src/lib/server/google-reporting";
import { localDatabase } from "../src/lib/server/local";
const directory = mkdtempSync(join(tmpdir(), "artmaster-seo-test-"));
before(() =>
  Object.assign(process.env, {
    ARTMASTER_STORAGE: "local",
    ARTMASTER_DATA_DIR: directory,
    SITE_URL: "http://localhost:3000",
  }),
);
after(() => rm(directory, { recursive: true, force: true }));
function fixture() {
  return {
    path: "/ro",
    origin: "https://staging.example.invalid",
    html: `<html lang="ro"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta property="og:title" content="ARTMASTER"><meta property="og:description" content="Synthetic description"><meta property="og:url" content="https://staging.example.invalid/ro"><meta property="og:image" content="https://staging.example.invalid/share.jpg"><meta name="twitter:card" content="summary_large_image"><title>ARTMASTER — producție publicitară</title><meta name="description" content="Producție publicitară și proiecte vizuale pentru companii. Consultă serviciile noastre specializate."><link rel="canonical" href="https://staging.example.invalid/ro">${["ro", "ru", "en", "x-default"].map((l) => `<link rel="alternate" hreflang="${l}" href="https://staging.example.invalid/${l === "x-default" ? "ro" : l}">`).join("")}<meta name="robots" content="index, follow"></head><body><h1>ARTMASTER</h1><a href="/ru">RU</a><a href="https://external.invalid/never-fetch">External</a><img src="/media/decorative.webp" alt=""><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"ARTMASTER"}</script></body></html>`,
    sitemap:
      "<urlset><url><loc>https://staging.example.invalid/ro</loc></url></urlset>",
    robots: "User-agent: *\nAllow: /\nDisallow: /admin",
    paths: ["/ro", "/ru", "/en"],
    assetExists: () => false,
    indexable: true,
  };
}
test("transparent SEO v2 formula totals 100 weighted points", () => {
  const report = auditHTML(fixture());
  assert.equal(report.score, 100);
  assert.equal(report.checks.length, 14);
  assert.equal(
    report.checks.reduce((n, c) => n + c.weight, 0),
    100,
  );
  assert.equal(report.externalLinksUnchecked, 1);
});
test("SEO issues identify missing alt, broken internal links and invalid JSON-LD without certifying external URLs", () => {
  const input = fixture();
  input.html = input.html
    .replace('alt=""', "")
    .replace(
      '{"@context":"https://schema.org","@type":"Organization","name":"ARTMASTER"}',
      "{invalid",
    )
    .replace("</body>", '<a href="/ro/not-there">Broken</a></body>');
  const report = auditHTML(input);
  assert.equal(report.score, 76);
  assert.deepEqual(report.brokenLinks, ["/ro/not-there"]);
  for (const id of ["alt", "structured", "links"])
    assert.equal(report.checks.find((c) => c.id === id)?.status, "fail");
});
test("local/staging noindex and blocked robots are honest readiness failures", () => {
  const input = fixture();
  input.indexable = false;
  input.robots = "User-agent: *\nDisallow: /";
  const report = auditHTML(input);
  assert.equal(report.score, 86);
  assert.equal(report.checks.find((c) => c.id === "indexing")?.status, "fail");
});
test("bad titles, description, canonical, hreflang and missing sitemap lose only their documented weights", () => {
  const input = fixture();
  input.html = input.html
    .replace(
      "<title>ARTMASTER — producție publicitară</title>",
      "<title>X</title>",
    )
    .replace(/<meta name="description"[^>]+>/, "")
    .replace(/<link[^>]+>/g, "");
  input.sitemap = "<urlset/>";
  assert.equal(auditHTML(input).score, 56);
});
test("public route inventory excludes private catalog entries in every locale and preserves legacy equipment", () => {
  const value = structuredClone(defaultContent),
    entry = candidateEquipment(equipmentCandidates[0], 0);
  value.equipment.push(entry);
  const paths = publicPaths(value);
  for (const l of ["ro", "ru", "en"])
    assert.ok(!paths.includes(`/${l}/echipamente/${entry.slug}`));
  assert.equal(
    publicContent(value).equipment.length,
    defaultContent.equipment.length,
  );
  assert.equal(contentSchema.safeParse(value).success, true);
  entry.catalog!.published = true;
  assert.equal(contentSchema.safeParse(value).success, false);
  entry.catalog!.verification = "owner_confirmed";
  entry.catalog!.imageRights = "owner";
  entry.catalog!.licenseNote = "Synthetic owner authorization";
  assert.equal(contentSchema.safeParse(value).success, true);
});
test("catalog rejects unsafe source URLs, arbitrary HTML fields and incomplete multilingual specifications", () => {
  const value = structuredClone(defaultContent),
    entry = candidateEquipment(equipmentCandidates[1], 1);
  value.equipment.push(entry);
  entry.catalog!.sourceUrl = "javascript:alert(1)";
  assert.equal(contentSchema.safeParse(value).success, false);
  entry.catalog!.sourceUrl = "";
  entry.catalog!.specs = [
    {
      label: { ro: "Lățime", ru: "", en: "Width" },
      value: { ro: "Test", ru: "Тест", en: "Test" },
    },
  ];
  assert.equal(contentSchema.safeParse(value).success, false);
});
test("date filters enforce actual UTC dates and bounded inclusive ranges", () => {
  assert.equal(
    dateRangeSchema.safeParse({ start: "2026-01-01", end: "2026-04-03" })
      .success,
    true,
  );
  for (const range of [
    { start: "2026-02-30", end: "2026-03-01" },
    { start: "2026-01-01", end: "2026-04-04" },
    { start: "2026-03-01", end: "2026-02-01" },
    { start: "2099-01-01", end: "2099-01-01" },
  ])
    assert.equal(dateRangeSchema.safeParse(range).success, false);
});
test("conversion totals use persistent dates, include zero-count days and never return customer details", async () => {
  const db = localDatabase();
  for (const createdAt of [
    "2026-01-01T23:59:59Z",
    "2026-01-01T12:00:00Z",
    "2026-01-03T00:00:00Z",
    "2026-01-04T00:00:00Z",
  ])
    db.prepare(
      "INSERT INTO quotes(id,idempotency_key,payload_hash,data,notification) VALUES(?,?,?,?,?)",
    ).run(
      randomUUID(),
      randomUUID(),
      "hash",
      JSON.stringify({ createdAt, email: "synthetic-private@example.invalid" }),
      "not_configured",
    );
  const days = await conversionDays({ start: "2026-01-01", end: "2026-01-03" });
  assert.deepEqual(days, [
    { day: "2026-01-01", count: 2 },
    { day: "2026-01-02", count: 0 },
    { day: "2026-01-03", count: 1 },
  ]);
  assert.ok(!JSON.stringify(days).includes("private"));
});
test("SEO audit rejects arbitrary origins, draft, API, encoded paths and queries before fetching", async () => {
  for (const path of [
    "https://other.invalid",
    "/admin",
    "/api/admin/content",
    "/admin-preview/ro",
    "/ro?secret=1",
    "/ro/../admin",
    "/ro/%2e%2e/admin",
  ])
    await assert.rejects(
      () => auditPage(path),
      (e) => e instanceof Error && e.message === "invalid_input",
    );
});
test("unconnected Google reporting never fetches or invents zero analytics", async () => {
  const config = {
    email: "",
    key: "",
    property: "",
    site: "",
    ga4: false,
    search: false,
    pagespeed: false,
  };
  const data = await requestGoogleReports(
    config,
    { start: "2026-01-01", end: "2026-01-02" },
    async () => {
      throw Error("must not fetch");
    },
  );
  assert.deepEqual(data, emptyGoogleReports());
  assert.equal(data.ga4.users, null);
  assert.equal(data.search.clicks, null);
});
test("Google read-only adapters use fixed APIs, real aggregate user totals and sanitize provider errors", async () => {
  const config = {
      email: "synthetic@example.invalid",
      key: "synthetic",
      property: "123",
      site: "https://staging.example.invalid/",
      ga4: true,
      search: true,
      pagespeed: false,
    },
    scopes: string[] = [],
    seen: string[] = [];
  const report = await requestGoogleReports(
    config,
    { start: "2026-01-01", end: "2026-01-02" },
    async (input, init) => {
      const url = String(input);
      seen.push(url);
      assert.equal(init?.redirect, "error");
      if (url.includes("analyticsdata.googleapis.com"))
        return Response.json({
          reports: [
            {
              metricHeaders: [
                "totalUsers",
                "sessions",
                "keyEvents",
                "sessionKeyEventRate",
              ].map((name) => ({ name })),
              rows: [
                {
                  dimensionValues: [{ value: "20260101" }],
                  metricValues: [
                    { value: "10" },
                    { value: "15" },
                    { value: "2" },
                    { value: ".1" },
                  ],
                },
                {
                  dimensionValues: [{ value: "20260102" }],
                  metricValues: [
                    { value: "10" },
                    { value: "15" },
                    { value: "1" },
                    { value: ".1" },
                  ],
                },
              ],
            },
            {
              metricHeaders: [
                "totalUsers",
                "sessions",
                "keyEvents",
                "sessionKeyEventRate",
              ].map((name) => ({ name })),
              rows: [
                {
                  metricValues: [
                    { value: "12" },
                    { value: "30" },
                    { value: "3" },
                    { value: ".1" },
                  ],
                },
              ],
            },
            { metricHeaders: [{ name: "sessions" }], rows: [] },
            { metricHeaders: [{ name: "screenPageViews" }], rows: [] },
          ],
        });
      return Response.json(
        { error: { message: "synthetic-sensitive-token" } },
        { status: 403 },
      );
    },
    async (scope) => {
      scopes.push(scope);
      return "synthetic-token";
    },
  );
  assert.equal(
    report.ga4.users,
    12,
    "aggregate users must not be summed across days",
  );
  assert.equal(report.ga4.sessions, 30);
  assert.equal(report.search.state, "unavailable");
  assert.equal(report.search.clicks, null);
  assert.ok(!JSON.stringify(report).includes("sensitive"));
  assert.ok(scopes.every((s) => s.endsWith(".readonly")));
  assert.ok(
    seen.every((s) =>
      /^https:\/\/(analyticsdata|searchconsole)\.googleapis\.com\//.test(s),
    ),
  );
});

test("PageSpeed rejects IP literals and reserved/local destinations without sending them to Google", () => {
  for (const origin of [
    "http://artmaster.md",
    "https://localhost",
    "https://localhost.",
    "https://printer.local.",
    "https://2130706433",
    "https://127.0.0.1",
    "https://127.1",
    "https://10.0.0.1",
    "https://192.168.1.2",
    "https://[::1]",
    "https://[fc00::1]",
    "https://printer.local",
    "https://staging.internal",
    "https://example.invalid",
    "https://user:secret@artmaster.md",
    "https://artmaster.md/private",
  ])
    assert.equal(isPublicPageSpeedOrigin(origin), false, origin);
  assert.equal(isPublicPageSpeedOrigin("https://staging.artmaster.md"), true);
});
