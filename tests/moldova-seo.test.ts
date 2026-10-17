import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultContent } from "../src/lib/content/defaults";
import { contentSchema } from "../src/lib/server/schema";
import { contentPaths, renameSeoPath } from "../src/lib/content/routes";
import { publicContent } from "../src/lib/content/assets";
import { seedPageSeo, metadataDescription, serviceMetadata } from "../src/lib/content/seo";
import { pageMetadata } from "../src/lib/seo";
import { publicPaths } from "../src/lib/seo-audit";
import { serviceResources } from "../src/lib/content/service-resources";
import { serviceContentInsights } from "../src/lib/content/seo-insights";

test("old CMS documents remain valid and all existing routes have editable three-language SEO seeds", () => {
  assert.ok(contentSchema.safeParse(defaultContent).success);
  for (const path of contentPaths(defaultContent, { drafts: true })) {
    const copy = structuredClone(defaultContent);
    copy.seo = [seedPageSeo(copy, path)];
    assert.ok(contentSchema.safeParse(copy).success, path || "home");
    for (const locale of ["ro", "ru", "en"] as const) {
      assert.ok(copy.seo[0].title[locale].length <= 70);
      assert.ok(copy.seo[0].description[locale].length >= 50);
    }
  }
});

test("SEO cannot introduce private/arbitrary routes, duplicate entries, script markup or indexing/URL controls", () => {
  const seo = seedPageSeo(defaultContent, "servicii/print-uv");
  for (const path of ["admin", "api/quotes", "admin-preview/ro", "/ro/servicii/print-uv", "https://attacker.invalid", "servicii/nonexistent", "servicii/print-uv?token=secret", "servicii/%2fadmin"]) {
    assert.equal(contentSchema.safeParse({ ...defaultContent, seo: [{ ...seo, path }] }).success, false, path);
  }
  assert.equal(contentSchema.safeParse({ ...defaultContent, seo: [seo, seo] }).success, false);
  for (const extra of [{ canonical: "https://attacker.invalid" }, { robots: { index: true } }, { script: "alert(1)" }])
    assert.equal(contentSchema.safeParse({ ...defaultContent, seo: [{ ...seo, ...extra }] }).success, false);
  for (const value of ["<script>harmless</script>", "A".repeat(71), "Un titlu\u0000invalid", "scurt"]) {
    assert.equal(contentSchema.safeParse({ ...defaultContent, seo: [{ ...seo, title: { ...seo.title, ro: value } }] }).success, false);
  }
  assert.equal(contentSchema.safeParse({ ...defaultContent, seo: [{ ...seo, description: { ro: seo.description.ro, en: seo.description.en } }] }).success, false);
});

test("custom metadata has one complete title, matching social copy, stable alternates and retained noindex", () => {
  const seo = seedPageSeo(defaultContent, "servicii/print-uv");
  const metadata = pageMetadata("ru", seo.path, "Fallback", "Fallback", false, seo);
  assert.deepEqual(metadata.title, { absolute: seo.title.ru });
  assert.equal(metadata.description, seo.description.ru);
  assert.equal(metadata.openGraph?.title, seo.title.ru);
  assert.equal(metadata.twitter?.description, seo.description.ru);
  assert.ok(String(metadata.alternates?.canonical).endsWith("/ru/servicii/print-uv"));
  assert.equal(Object.keys(metadata.alternates!.languages!).length, 4);
  assert.equal((metadata.robots as { index: boolean }).index, false);
});

test("shared inventory excludes drafts and concepts where required and never exposes their metadata", () => {
  const copy = structuredClone(defaultContent);
  copy.projects[0].published = false;
  copy.seo = [seedPageSeo(copy, `portofoliu/${copy.projects[0].slug}`)];
  assert.ok(contentSchema.safeParse(copy).success);
  assert.equal(publicContent(copy).seo?.length, 0);
  assert.ok(contentPaths(copy, { drafts: true }).includes(copy.seo[0].path));
  assert.ok(!contentPaths(copy).includes(copy.seo[0].path));
  assert.ok(!contentPaths(defaultContent, { concepts: false }).some((path) => defaultContent.projects.some((p) => p.kind === "concept" && path === `portofoliu/${p.slug}`)));
  assert.deepEqual(publicPaths(copy), contentPaths(copy).flatMap((path) => ["ro", "ru", "en"].map((locale) => `/${locale}${path ? "/" + path : ""}`)));
});

test("renaming a CMS entity moves its SEO draft reference without touching unrelated pages", () => {
  const copy = structuredClone(defaultContent);
  copy.seo = [seedPageSeo(copy, "servicii/print-uv"), seedPageSeo(copy, "contact")];
  renameSeoPath(copy, "servicii/print-uv", "servicii/print-uv-nou");
  assert.deepEqual(copy.seo.map((entry) => entry.path), ["servicii/print-uv-nou", "contact"]);
  copy.services[0].slug = "print-uv-nou";
  for (const service of copy.services) service.relatedSlugs = service.relatedSlugs.map((s) => s === "print-uv" ? "print-uv-nou" : s);
  for (const item of [...copy.projects, ...copy.equipment, ...copy.articles]) item.serviceSlugs = item.serviceSlugs.map((s) => s === "print-uv" ? "print-uv-nou" : s);
  assert.ok(contentSchema.safeParse(copy).success);
});

test("service insights use the same description fallback and custom title as public metadata", () => {
  const copy = structuredClone(defaultContent), service = copy.services[0];
  service.summary.en = "Short summary";
  const plain = serviceMetadata(copy, service.slug, "en");
  assert.equal(plain.description, metadataDescription(service.summary.en, service.description.en));
  copy.seo = [seedPageSeo(copy, `servicii/${service.slug}`)];
  copy.seo[0].title.en = "UV printing for your business in Moldova | ARTMASTER";
  assert.equal(serviceMetadata(copy, service.slug, "en").title, copy.seo[0].title.en);
});

test("service resource links include published related guides and real projects only, even for raw saved drafts", () => {
  const content = structuredClone(defaultContent), slug = content.services[0].slug;
  content.projects = [
    { ...content.projects[0], slug: "private-real", kind: "real", published: false, serviceSlugs: [slug] },
    { ...content.projects[0], slug: "published-concept", kind: "concept", published: true, serviceSlugs: [slug] },
    { ...content.projects[0], slug: "published-real", kind: "real", published: true, serviceSlugs: [slug] },
    { ...content.projects[0], slug: "unrelated", kind: "real", published: true, serviceSlugs: [] },
  ];
  content.articles = [
    { ...content.articles[0], slug: "private-guide", published: false, serviceSlugs: [slug] },
    { ...content.articles[0], slug: "published-guide", published: true, serviceSlugs: [slug] },
  ];
  assert.deepEqual(serviceResources(content, slug).projects.map((p) => p.slug), ["published-real"]);
  assert.deepEqual(serviceResources(content, slug).articles.map((p) => p.slug), ["published-guide"]);
  assert.equal(serviceResources(content, "nonexistent").projects.length, 0);
});

test("editorial report measures multilingual content, metadata duplicates and genuine published evidence without a ranking score", () => {
  const content = structuredClone(defaultContent);
  content.seo = content.services.slice(0, 2).map((service) => seedPageSeo(content, `servicii/${service.slug}`));
  content.seo[1].title.en = content.seo[0].title.en;
  content.seo[1].description.en = content.seo[0].description.en;
  const rows = serviceContentInsights(content);
  assert.equal(rows.length, content.services.length * 3);
  assert.equal(rows.filter((row) => row.issues.some((issue) => issue.id === "duplicate-title")).length, 2);
  assert.equal(rows.filter((row) => row.issues.some((issue) => issue.id === "duplicate-description")).length, 2);
  for (const row of rows) {
    assert.ok(row.words > 0);
    assert.equal(row.projects, 0, "concept projects cannot be counted as real work");
    assert.equal("score" in row, false);
    assert.equal("ranking" in row, false);
    assert.ok(!JSON.stringify(row).includes("admin-preview"));
  }
  const service = content.services[0];
  service.description.en = "One word"; service.summary.en = "Short";
  service.applications.en = []; service.quoteHints.en = []; service.faqs = [];
  const row = serviceContentInsights(content).find((r) => r.path === `/en/servicii/${service.slug}`)!;
  assert.ok(row.issues.some((issue) => issue.id === "content-review"));
  assert.ok(row.issues.some((issue) => issue.id === "faq"));
});
