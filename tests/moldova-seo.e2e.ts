import { test, expect, request as playwrightRequest, type APIRequestContext, type Page } from "./browser-fixtures";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import * as cheerio from "cheerio";
import AxeBuilder from "@axe-core/playwright";
import type { SiteContent } from "../src/lib/content/types";
import { seedPageSeo } from "../src/lib/content/seo";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname)) throw Error("Use isolated synthetic loopback storage only");
const directory = resolve(process.env.ARTMASTER_DATA_DIR || ".data/e2e"), tag = randomUUID().slice(0, 8);
const members = (["admin", "editor", "viewer"] as const).map((role) => ({ role, email: `moldova-${role}-${tag}@example.invalid`, password: randomBytes(24).toString("base64url"), cookie: "", api: null as APIRequestContext | null }));
let original: { published: string | null; draft: string | null }, initial: SiteContent;
const admin = () => members[0].api!;
async function state() { return (await admin().get("/api/admin/content")).json() as Promise<{ published: SiteContent; draft: SiteContent | null; version: number }>; }
async function save(content: SiteContent, action = "save-draft", api = admin()) {
  const current = await state();
  return api.put("/api/admin/content", { data: { content, action, version: current.version } });
}
function head(html: string) {
  const $ = cheerio.load(html);
  return { title: $("head>title").text(), description: $('meta[name="description"]').attr("content"), canonical: $('link[rel="canonical"]').attr("href"), og: $('meta[property="og:title"]').attr("content"), robots: $('meta[name="robots"]').map((_, e) => $(e).attr("content")).get().join(" ") };
}
async function signed(page: Page, index = 0) {
  await page.context().addCookies([{ name: "artmaster_admin", value: members[index].cookie, domain: new URL(baseURL).hostname, path: "/", httpOnly: true, sameSite: "Strict", secure: false }]);
}
async function capture(page: Page, name: string) {
  if (process.env.ARTMASTER_MOLDOVA_SCREENSHOTS !== "1") return;
  await mkdir("docs/screenshots/moldova-growth", { recursive: true });
  await page.screenshot({ path: `docs/screenshots/moldova-growth/${name}.png`, animations: "disabled" });
}

test.describe.serial("Moldova SEO uses protected real content workflows", () => {
  test.beforeAll(async () => {
    const ready = await playwrightRequest.newContext({ baseURL });
    expect((await ready.get("/api/quote-token")).status()).toBe(200); await ready.dispose();
    const db = new DatabaseSync(join(directory, "artmaster.sqlite"));
    original = db.prepare("select published,draft from content where id=1").get() as typeof original; db.close();
    for (const [index, member] of members.entries()) {
      const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/create-admin.ts"], {
        env: { ...process.env, ARTMASTER_STORAGE: "local", ARTMASTER_ALLOW_LOCAL_PRODUCTION: "true", ARTMASTER_DATA_DIR: directory, ADMIN_EMAIL: member.email, ADMIN_ROLE: member.role, ADMIN_PASSWORD: "" }, input: member.password + "\n", encoding: "utf8",
      });
      expect(result.status).toBe(0);
      member.api = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL, "x-real-ip": `198.18.40.${index + 1}` } });
      const login = await member.api.post("/api/admin/login", { data: { email: member.email, password: member.password } });
      expect(login.status()).toBe(200); member.cookie = login.headers()["set-cookie"].match(/^artmaster_admin=([^;]+)/)![1];
    }
    initial = (await state()).published;
  });
  test.afterAll(async () => {
    if (original) { const db = new DatabaseSync(join(directory, "artmaster.sqlite")); db.prepare("update content set published=?,draft=? where id=1").run(original.published, original.draft); db.close(); }
    for (const member of members) if (member.api) { await member.api.post("/api/admin/logout"); await member.api.dispose(); }
    // Remove only accounts created by this fixture in its loopback synthetic database.
    const db = new DatabaseSync(join(directory, "artmaster.sqlite"));
    db.exec("PRAGMA foreign_keys=ON");
    for (const member of members) {
      const row = db.prepare("SELECT id FROM admins WHERE email=?").get(member.email) as { id: string } | undefined;
      if (row) { db.prepare("DELETE FROM sessions WHERE admin_id=?").run(row.id); db.prepare("DELETE FROM admins WHERE id=?").run(row.id); }
    }
    db.close();
  });

  test("RO/RU/EN metadata remains private until publication and restoration creates a separate draft", async ({ request }) => {
    expect((await save(initial)).status()).toBe(200);
    const originalHistory = await (await admin().get("/api/admin/content/history?pageSize=1")).json();
    const sourceId = originalHistory.versions[0].id;
    const draft = structuredClone(initial), seo = seedPageSeo(draft, "servicii/print-uv");
    seo.title = { ro: `TEST UV Moldova ${tag} | ARTMASTER`, ru: `ТЕСТ УФ-печать Молдова ${tag} | ARTMASTER`, en: `TEST UV printing Moldova ${tag} | ARTMASTER` };
    seo.description = { ro: "Descriere SEO sintetică pentru verificarea ciornei, publicării și restaurării; nu reprezintă o ofertă comercială.", ru: "Синтетическое SEO-описание для проверки черновика, публикации и восстановления; не является коммерческим предложением.", en: "Synthetic SEO description used only to verify draft isolation, publication and restoration; this is not a commercial offer." };
    draft.seo = [...(draft.seo || []).filter((entry) => entry.path !== seo.path), seo];
    expect((await save(draft, "save-draft", members[2].api!)).status()).toBe(403);
    expect((await save(draft, "save-draft", members[1].api!)).status()).toBe(200);
    expect((await save(draft, "publish", members[1].api!)).status()).toBe(403);
    const before = head(await (await request.get("/en/servicii/print-uv")).text());
    expect(before.title).not.toBe(seo.title.en);
    const preview = await admin().get("/admin-preview/en/servicii/print-uv?canvas=1");
    expect(preview.status()).toBe(200); expect(preview.headers()["cache-control"]).toContain("no-store");
    const privateHead = head(await preview.text()); expect(privateHead.title).toBe(seo.title.en); expect(privateHead.robots).toContain("noindex");
    const denied = await request.get("/admin-preview/en/servicii/print-uv?canvas=1", { maxRedirects: 0 });
    expect([303, 307]).toContain(denied.status()); expect(await denied.text()).not.toContain(seo.title.en);
    expect((await save(draft, "publish")).status()).toBe(200);
    for (const locale of ["ro", "ru", "en"] as const) {
      const result = head(await (await request.get(`/${locale}/${seo.path}`)).text());
      expect(result.title).toBe(seo.title[locale]); expect(result.description).toBe(seo.description[locale]); expect(result.og).toBe(seo.title[locale]);
      expect(result.canonical).toBe(`${baseURL}/${locale}/${seo.path}`); expect(result.robots).toContain("noindex");
    }
    const published = await state();
    expect((await admin().post(`/api/admin/content/history/${sourceId}`, { data: { version: published.version, confirm: true } })).status()).toBe(200);
    expect(head(await (await request.get("/en/servicii/print-uv")).text()).title).toBe(seo.title.en);
    expect((await state()).draft?.seo).toEqual(initial.seo);
    expect((await save(initial, "publish")).status()).toBe(200);
  });

  test("the real CMS editor saves translated SEO, previews the selected route and publishes with confirmation", async ({ page, request }) => {
    await signed(page); await page.goto("/admin#content");
    await expect(page.getByRole("heading", { name: "Conținut Studio", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Metadate SEO", exact: true }).click();
    const panel = page.getByRole("region", { name: "Metadate SEO editabile" });
    await panel.getByLabel("Pagina SEO").selectOption("servicii/print-uv");
    const title = `TEST — Print UV în Moldova ${tag} | ARTMASTER`;
    await panel.getByLabel("Titlu SEO · RO", { exact: true }).fill(title);
    await expect(page.getByRole("link", { name: "Previzualizează ciorna salvată" })).toHaveAttribute("href", "/admin-preview/ro/servicii/print-uv");
    await page.getByRole("button", { name: "Salvează ciorna", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Ciorna a fost salvată");
    expect((await state()).draft?.seo?.find((entry) => entry.path === "servicii/print-uv")?.title.ro).toBe(title);
    await panel.evaluate((element) => window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 90, behavior: "instant" }));
    await capture(page, "seo-editor-desktop");
    await page.setViewportSize({ width: 375, height: 812 });
    await panel.evaluate((element) => window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 90, behavior: "instant" }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await capture(page, "seo-editor-mobile");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Publică această versiune", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Versiunea a fost publicată");
    expect(head(await (await request.get("/ro/servicii/print-uv")).text()).title).toBe(title);
    expect((await save(initial, "publish")).status()).toBe(200);
  });

  test("SEO rejects arbitrary/private routes, duplicate overrides and unauthorized writes without changing the version", async ({ request }) => {
    const current = await state(), entry = seedPageSeo(current.published, "contact");
    for (const seo of [[{ ...entry, path: "admin" }], [entry, entry], [{ ...entry, canonical: "https://attacker.invalid" }]]) {
      const response = await admin().put("/api/admin/content", { data: { content: { ...current.published, seo }, action: "save-draft", version: current.version } });
      expect(response.status()).toBe(400); expect((await state()).version).toBe(current.version);
    }
    expect((await request.put("/api/admin/content", { headers: { Origin: baseURL }, data: { content: current.published, action: "save-draft", version: current.version } })).status()).toBe(401);
  });

  test("all translated service pages retain quotation preselection, readable CTA and correctly fitted images", async ({ page }) => {
    for (const locale of ["ro", "ru", "en"] as const) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/${locale}/servicii/print-uv`);
      const cta = page.locator('main .prose a.button');
      const contrast = await cta.evaluate((element) => {
        const style = getComputedStyle(element);
        const luminance = (color: string) => {
          const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => {
            const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
          });
          return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
        };
        const a = luminance(style.color), b = luminance(style.backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      expect(await page.locator('.card-grid .card-media img').first().evaluate((element) => getComputedStyle(element).objectFit)).toBe("cover");
      const findings = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(findings.violations.filter((v) => ["serious", "critical"].includes(v.impact || ""))).toEqual([]);
      await cta.click(); await expect(page.locator('select[name="service"]')).toHaveValue("print-uv");
    }
  });

  test("published guides and real projects link back from services while draft resources stay private", async ({ request }) => {
    const content = structuredClone(initial), slug = content.services[0].slug;
    const real = { ...content.projects[0], slug: `synthetic-real-${tag}`, kind: "real" as const, published: false, serviceSlugs: [slug] };
    const guide = { ...content.articles[0], slug: `synthetic-guide-${tag}`, published: false, serviceSlugs: [slug] };
    content.projects.push(real); content.articles.push(guide);
    expect((await save(content, "publish")).status()).toBe(200);
    let html = await (await request.get(`/en/servicii/${slug}`)).text();
    expect(html).not.toContain(real.slug); expect(html).not.toContain(guide.slug);
    expect((await request.get(`/en/portofoliu/${real.slug}`)).status()).toBe(404);
    real.published = true; guide.published = true;
    expect((await save(content, "save-draft")).status()).toBe(200);
    expect(await (await request.get(`/en/servicii/${slug}`)).text()).not.toContain(real.slug);
    expect((await save(content, "publish")).status()).toBe(200);
    for (const locale of ["ro", "ru", "en"]) {
      html = await (await request.get(`/${locale}/servicii/${slug}`)).text();
      const $ = cheerio.load(html);
      expect($(`main a[href="/${locale}/portofoliu/${real.slug}"]`).length).toBe(1);
      expect($(`main a[href="/${locale}/blog/${guide.slug}"]`).length).toBeGreaterThan(0);
      expect((await request.get(`/${locale}/portofoliu/${real.slug}`)).status()).toBe(200);
    }
    expect((await save(initial, "publish")).status()).toBe(200);
  });

  test("SEO Center displays real multilingual editorial data and keeps Google explicitly unconnected", async ({ page, request }) => {
    expect((await request.get("/api/admin/seo/content")).status()).toBe(401);
    await signed(page, 2); await page.goto("/admin#seo");
    const panel = page.getByRole("region", { name: "Conținut și oportunități SEO", exact: true });
    await expect(panel.getByRole("button", { name: "Actualizează inventarul" })).toBeEnabled();
    await expect(panel.locator("tbody tr")).toHaveCount(initial.services.length);
    await panel.getByLabel("Limba raportului").selectOption("en");
    await expect(panel.getByRole("link", { name: initial.services[0].title.en + " ↗", exact: true })).toHaveAttribute("href", `/en/servicii/${initial.services[0].slug}`);
    await panel.getByRole("button", { name: "Actualizează inventarul" }).click();
    await expect(panel.getByRole("button", { name: "Actualizează inventarul" })).toBeEnabled();
    await expect(page.getByText("GA4: Neconectat", { exact: false })).toBeVisible();
    await panel.evaluate((element) => window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 90, behavior: "instant" }));
    await capture(page, "seo-content-insights-desktop");
    await page.setViewportSize({ width: 375, height: 812 });
    await panel.evaluate((element) => window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 90, behavior: "instant" }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await capture(page, "seo-content-insights-mobile");
    const findings = await new AxeBuilder({ page }).include('[aria-label="Conținut și oportunități SEO"]').withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(findings.violations.filter((v) => ["serious", "critical"].includes(v.impact || ""))).toEqual([]);
  });
});
