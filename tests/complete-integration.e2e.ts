import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from "./browser-fixtures";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { resolve, join } from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { syntheticVideo } from "./fixtures/synthetic-video";
import {
  candidateEquipment,
  equipmentCandidates,
} from "../src/lib/content/equipment-candidates";
import { screenshotPartnerCandidates } from "../src/lib/content/partner-candidates";
import type { SiteContent } from "../src/lib/content/types";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname))
  throw new Error("Integration tests require synthetic loopback storage.");
const directory = resolve(process.env.ARTMASTER_DATA_DIR || ".data/e2e"),
  email = `complete-${randomUUID().slice(0, 8)}@example.invalid`,
  password = randomBytes(24).toString("base64url");
let api: APIRequestContext,
  cookie: string,
  original: { published: string | null; draft: string | null };
let combined: SiteContent, panorama: string, background: string, video: string;
async function state() {
  return (await api.get("/api/admin/content")).json() as Promise<{
    published: SiteContent;
    draft: SiteContent | null;
    version: number;
  }>;
}
async function save(content: SiteContent, action = "save-draft") {
  const s = await state();
  const response = await api.put("/api/admin/content", {
    data: { content, action, version: s.version },
  });
  expect(response.status()).toBe(200);
}
async function signed(page: Page) {
  await page.context().addCookies([
    {
      name: "artmaster_admin",
      value: cookie,
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
      secure: false,
    },
  ]);
}
async function capture(page: Page, name: string) {
  if (process.env.ARTMASTER_COMPLETE_SCREENSHOTS !== "1") return;
  await mkdir("docs/screenshots/complete-integration", { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/complete-integration/${name}.png`,
    animations: "disabled",
  });
}
test.describe
  .serial("one complete cabinet with SEO, banner, partners and equipment", () => {
  test.beforeAll(async () => {
    const ready = await playwrightRequest.newContext({ baseURL });
    await ready.get("/api/quote-token");
    await ready.dispose();
    const db = new DatabaseSync(join(directory, "artmaster.sqlite"));
    original = db
      .prepare("select published,draft from content where id=1")
      .get() as typeof original;
    db.close();
    const result = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/create-admin.ts"],
      {
        env: {
          ...process.env,
          ARTMASTER_STORAGE: "local",
          ARTMASTER_ALLOW_LOCAL_PRODUCTION: "true",
          ARTMASTER_DATA_DIR: directory,
          ADMIN_EMAIL: email,
          ADMIN_ROLE: "admin",
          ADMIN_PASSWORD: "",
        },
        input: password + "\n",
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);
    api = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL, "x-real-ip": "198.18.9.50" },
    });
    const login = await api.post("/api/admin/login", {
      data: { email, password },
    });
    expect(login.status()).toBe(200);
    const cookieHeader=login.headers()["set-cookie"];
    cookie=cookieHeader.match(/^artmaster_admin=([^;]+)/)![1];
  });
  test.afterAll(async () => {
    if (original) {
      const db = new DatabaseSync(join(directory, "artmaster.sqlite"));
      db.prepare("update content set published=?,draft=? where id=1").run(
        original.published,
        original.draft,
      );
      db.prepare(
        "delete from sessions where admin_id in (select id from admins where email=?)",
      ).run(email);
      db.prepare("delete from admins where email=?").run(email);
      db.close();
    }
    await api?.dispose();
  });
  test("all ten modules and banner/partner tabs coexist; SEO reports real unconnected state", async ({
    page,
  }) => {
    await signed(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin#seo");
    const nav = page.getByRole("navigation", { name: "Navigare administrare" });
    for (const name of [
      "Prezentare",
      "Mesaje clienți",
      "Portofoliu",
      "Bibliotecă media",
      "Echipamente",
      "SEO & Analytics",
      "Conținut",
      "Setări website",
      "Echipă",
      "Securitate",
    ])
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "SEO & Analytics Center" }),
    ).toBeVisible();
    const seo = await (await api.get("/api/admin/seo")).json();
    expect(seo.google.ga4.state).toBe("unconnected");
    expect(seo.google.ga4.users).toBeNull();
    expect(seo.google.search.clicks).toBeNull();
    await capture(page, "all-modules-seo-desktop");
    await nav.getByRole("link", { name: "Conținut", exact: true }).click();
    await page
      .getByRole("button", { name: "Banner Acasă", exact: true })
      .click();
    await expect(
      page.getByLabel("Încarcă banner desktop", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Parteneri", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Importă candidații din captură" }),
    ).toBeEnabled();
    await nav.getByRole("link", { name: "Echipamente", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Equipment Studio", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Candidați ARTMASTER · verificare obligatorie", {
        exact: true,
      }),
    ).toBeVisible();
  });
  test("combined drafts publish one selected hero mode and never expose inactive video or draft equipment", async ({
    page,
    request,
  }) => {
    const assets = [];
    for (const [name, color] of [
      ["panorama", "#e7d18a"],
      ["background", "#455c7d"],
      ["partner", "#5e9c8a"],
      ["equipment", "#8a697e"],
    ]) {
      const response = await api.post("/api/admin/media", {
        multipart: {
          file: {
            name: `SYNTHETIC ${name}.png`,
            mimeType: "image/png",
            buffer: await sharp({
              create: {
                width: 800,
                height: 333,
                channels: 4,
                background: color,
              },
            })
              .png()
              .toBuffer(),
          },
          purpose: "artwork",
        },
      });
      expect(response.status()).toBe(201);
      assets.push((await response.json()).url);
    }
    [panorama, background] = assets;
    const clip = await api.post("/api/admin/hero", {
      multipart: {
        file: {
          name: "synthetic.mp4",
          mimeType: "video/mp4",
          buffer: syntheticVideo,
        },
        rightsConfirmed: "true",
      },
    });
    expect(clip.status()).toBe(201);
    video = (await clip.json()).url;
    combined = structuredClone((await state()).published);
    combined.heroMedia = { desktop: { image: background, video } };
    combined.banner = {
      enabled: true,
      desktop: {
        image: panorama,
        width: 800,
        height: 333,
        alt: {
          ro: "Panoramă sintetică pentru testarea integrării",
          ru: "Тестовая панорама интеграции",
          en: "Synthetic integration panorama",
        },
      },
    };
    combined.partners = [
      {
        ...screenshotPartnerCandidates()[0],
        name: "SYNTHETIC INTEGRATION PARTNER",
        image: assets[2],
        identity: "confirmed",
        relationshipConfirmed: true,
        rights: "owner-authorized",
        provenance: "Synthetic fixture only",
        status: "published",
      },
    ];
    combined.equipment.push({
      ...candidateEquipment(equipmentCandidates[0], 50),
      image: assets[3],
    });
    await save(combined);
    for (const url of [...assets, video])
      expect((await request.get(url)).status()).toBe(404);
    await signed(page);
    await page.goto("/admin#content");
    await page
      .getByRole("button", { name: "Acasă și Despre noi", exact: true })
      .click();
    await expect(
      page
        .getByRole("note")
        .filter({ hasText: "Bannerul panoramic este activ" }),
    ).toBeVisible();
    await page.goto("/admin-preview/ro?canvas=1");
    await expect(page.locator("[data-homepage-banner] img")).toHaveAttribute(
      "src",
      panorama.replace("/api/media/", "/api/admin/media/"),
    );
    await expect(page.locator(".hero-video")).toHaveCount(0);
    await expect(
      page.locator("[data-partners-section]").getByRole("link"),
    ).toHaveCount(0);
    await save(combined, "publish");
    await page.goto("/ro");
    await expect(page.locator("[data-homepage-banner] img")).toHaveJSProperty(
      "naturalWidth",
      800,
    );
    for (const url of [panorama, assets[2]])
      expect((await request.get(url)).status()).toBe(200);
    for (const url of [background, video, assets[3]])
      expect((await request.get(url)).status()).toBe(404);
    const next = structuredClone(combined);
    next.banner!.enabled = false;
    await save(next);
    expect((await request.get(video)).status()).toBe(404);
    await save(next, "publish");
    expect((await request.get(video)).status()).toBe(200);
    expect((await request.get(panorama)).status()).toBe(404);
    await page.goto("/ro");
    await expect(page.locator("[data-homepage-banner]")).toHaveCount(0);
    await expect(page.locator(".hero-background").first()).toHaveAttribute(
      "src",
      background,
    );
    await expect(page.locator("[data-partners-section] img")).toHaveCount(1);
  });
  test("actual public form reaches CRM and increases the same-day SEO conversion count", async ({
    page,
  }) => {
    const day = new Date().toISOString().slice(0, 10),
      path = `/api/admin/seo?start=${day}&end=${day}`,
      before = (await (await api.get(path)).json()).submissions;
    await page.goto("/ro/contact");
    const form = page.locator("main form");
    await form.locator("[name=name]").fill("Synthetic complete integration");
    await form.locator("[name=email]").fill(email);
    await form.locator("[name=phone]").fill("+37360010400");
    await form.locator("[name=service]").selectOption({ index: 1 });
    await form
      .locator("[name=message]")
      .fill(
        "Synthetic integration request linking CRM and SEO conversion statistics.",
      );
    await form.locator("[name=consent]").check();
    await page.waitForTimeout(1300);
    const pending = page.waitForResponse(
      (r) => r.url().endsWith("/api/quotes") && r.request().method() === "POST",
    );
    await form.locator("button[type=submit]").click();
    const accepted = await pending;
    expect(accepted.status()).toBe(201);
    const receipt = await accepted.json();
    const detail = await api.get(`/api/admin/quotes/${receipt.id}`);
    expect(detail.status()).toBe(200);
    expect((await detail.json()).quote.email).toBe(email);
    const after = await (await api.get(path)).json();
    expect(after.submissions).toBe(before + 1);
    expect(after.google.ga4.users).toBeNull();
    await signed(page);
    await page.goto("/admin#seo");
    await page.getByLabel("De la · dată").fill(day);
    await page.getByLabel("Până la · dată").fill(day);
    await page.getByRole("button", { name: "Aplică perioada" }).click();
    await expect(
      page.getByRole("heading", { name: "SEO & Analytics Center" }),
    ).toBeVisible();
    await expect(
      page
        .locator("article")
        .filter({ hasText: "Cereri salvate în CRM" })
        .locator("strong"),
    ).toHaveText(new Intl.NumberFormat("ro").format(after.submissions));
    await capture(page, "integrated-seo-conversions");
  });
});
