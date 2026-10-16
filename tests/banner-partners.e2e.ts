import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
  type BrowserContext,
} from "./browser-fixtures";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { resolve, join } from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import type { SiteContent } from "../src/lib/content/types";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname))
  throw new Error("Synthetic browser tests require loopback.");
const directory = resolve(process.env.ARTMASTER_DATA_DIR || ".data/e2e"),
  nonce = randomUUID().slice(0, 8);
const members = (["admin", "editor", "viewer"] as const).map((role) => ({
  role,
  email: `visual-${role}-${nonce}@example.invalid`,
  password: randomBytes(24).toString("base64url"),
  cookie: "",
  api: null as APIRequestContext | null,
}));
let original: { published: string | null; draft: string | null };
let imageUrl: string;
let historyId: number;
const admin = () => members[0].api!;
async function state() {
  return (await admin().get("/api/admin/content")).json() as Promise<{
    published: SiteContent;
    draft: SiteContent | null;
    version: number;
  }>;
}
async function save(content: SiteContent, action = "save-draft") {
  const current = await state();
  return admin().put("/api/admin/content", {
    data: { content, action, version: current.version },
  });
}
async function session(context: BrowserContext, index = 0) {
  await context.addCookies([
    {
      name: "artmaster_admin",
      value: members[index].cookie,
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
      secure: false,
    },
  ]);
}
async function studio(page: Page, section = "Parteneri") {
  await page.goto("/admin");
  await page.getByRole("link", { name: "Conținut", exact: true }).click();
  await page.getByRole("button", { name: section, exact: true }).click();
}
async function capture(page: Page, name: string, fullPage = false) {
  if (process.env.ARTMASTER_VISUAL_SCREENSHOTS !== "1") return;
  await mkdir("docs/screenshots/banner-partners", { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/banner-partners/${name}.png`,
    fullPage,
    animations: "disabled",
  });
}
const syntheticBanner = () =>
  sharp(
    Buffer.from(
      '<svg width="1944" height="809" xmlns="http://www.w3.org/2000/svg"><rect width="1944" height="809" fill="#eceeef"/><rect x="6" y="6" width="1932" height="797" fill="none" stroke="#cf0000" stroke-width="12"/><text x="90" y="180" font-family="sans-serif" font-size="74" fill="#111">SYNTHETIC TEST — NOT THE OWNER BANNER</text><text x="90" y="320" font-family="sans-serif" font-size="92" fill="#cf0000">0 600 10 400 · ARTMASTER</text><text x="90" y="440" font-family="sans-serif" font-size="44" fill="#333">Original attachment is still required for import.</text><rect y="650" width="1944" height="159" fill="#101316"/><text x="70" y="750" font-family="sans-serif" font-size="42" fill="#fff">1 DESIGN · 2 PRODUCTION · 3 EQUIPMENT · 4 LOGISTICS · 5 CUSTOM</text></svg>',
    ),
  )
    .png()
    .toBuffer();
test.describe
  .serial("homepage visual content with synthetic loopback data only", () => {
  test.beforeAll(async () => {
    const ready = await playwrightRequest.newContext({ baseURL });
    expect((await ready.get("/api/quote-token")).status()).toBe(200);
    await ready.dispose();
    const db = new DatabaseSync(join(directory, "artmaster.sqlite"));
    original = db
      .prepare("SELECT published,draft FROM content WHERE id=1")
      .get() as typeof original;
    db.close();
    for (const member of members) {
      const bootstrap = spawnSync(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", "scripts/create-admin.ts"],
        {
          env: {
            ...process.env,
            ARTMASTER_STORAGE: "local",
            ARTMASTER_ALLOW_LOCAL_PRODUCTION: "true",
            ARTMASTER_DATA_DIR: directory,
            ADMIN_EMAIL: member.email,
            ADMIN_ROLE: member.role,
            ADMIN_PASSWORD: "",
          },
          input: member.password + "\n",
          encoding: "utf8",
        },
      );
      expect(bootstrap.status).toBe(0);
      const api = await playwrightRequest.newContext({
        baseURL,
        extraHTTPHeaders: { Origin: baseURL, "x-real-ip": "198.18.8.50" },
      });
      const login = await api.post("/api/admin/login", {
        data: { email: member.email, password: member.password },
      });
      expect(login.status()).toBe(200);
      const cookieHeader=login.headers()["set-cookie"];
      member.cookie = cookieHeader.match(/^artmaster_admin=([^;]+)/)![1];
      await api.dispose();
      member.api = await playwrightRequest.newContext({
        baseURL,
        extraHTTPHeaders: {
          Origin: baseURL,
          Cookie: `artmaster_admin=${member.cookie}`,
        },
      });
    }
  });
  test.afterAll(async () => {
    if (original) {
      const db = new DatabaseSync(join(directory, "artmaster.sqlite"));
      db.prepare("UPDATE content SET published=?,draft=? WHERE id=1").run(
        original.published,
        original.draft,
      );
      for (const member of members) {
        const account = db
          .prepare("SELECT id FROM admins WHERE email=?")
          .get(member.email) as { id: string } | undefined;
        if (account) {
          db.prepare("DELETE FROM sessions WHERE admin_id=?").run(account.id);
          db.prepare("DELETE FROM admins WHERE id=?").run(account.id);
        }
      }
      db.close();
    }
    for (const member of members) await member.api?.dispose();
  });
  test("anonymous and viewer mutations fail; editors cannot publish", async ({
    request,
  }) => {
    const current = await state(),
      data = {
        content: current.published,
        action: "save-draft",
        version: current.version,
      };
    expect(
      (
        await request.put("/api/admin/content", {
          headers: { Origin: baseURL },
          data,
        })
      ).status(),
    ).toBe(401);
    expect(
      (await members[2].api!.put("/api/admin/content", { data })).status(),
    ).toBe(403);
    expect(
      (
        await members[1].api!.put("/api/admin/content", {
          data: { ...data, action: "publish" },
        })
      ).status(),
    ).toBe(403);
  });
  test("admin imports 15 candidates as a saved draft without claiming public partnerships", async ({
    page,
  }) => {
    await session(page.context());
    await studio(page);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Importă candidații din captură" })
      .click();
    await expect(page.getByLabel("Nume partener", { exact: true })).toHaveCount(
      15,
    );
    await expect(
      page.getByRole("button", { name: "Importă candidații din captură" }),
    ).toBeDisabled();
    await capture(page, "admin-candidates-needing-confirmation");
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Ciorna a fost salvată",
    );
    const current = await state();
    expect(current.draft!.partners).toHaveLength(15);
    expect(current.published.partners).toBeUndefined();
  });
  test("admin uploads full panorama through the actual editor and saves without publishing", async ({
    page,
  }) => {
    await session(page.context());
    await studio(page, "Banner Acasă");
    await page
      .getByLabel("Încarcă banner desktop", { exact: true })
      .setInputFiles({
        name: "SYNTHETIC-banner-test.png",
        mimeType: "image/png",
        buffer: await syntheticBanner(),
      });
    await expect(page.getByRole("status")).toContainText("Imagine încărcată");
    await page
      .getByLabel("Afișează bannerul după publicarea versiunii")
      .check();
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Ciorna a fost salvată",
    );
    const current = await state();
    imageUrl = current.draft!.banner!.desktop.image;
    expect(current.draft!.banner!.desktop.width).toBe(1944);
    expect(current.draft!.banner!.desktop.height).toBe(809);
    expect(current.published.banner).toBeUndefined();
    historyId = (
      await (await admin().get("/api/admin/content/history?pageSize=1")).json()
    ).versions[0].id;
    await capture(page, "admin-banner-synthetic-test");
  });
  test("draft assets deny anonymous bytes, optimizer access and protected previews", async ({
    request,
  }) => {
    expect((await request.get(imageUrl)).status()).toBe(404);
    expect(
      (
        await request.get(imageUrl.replace("/api/media/", "/api/admin/media/"))
      ).status(),
    ).toBe(401);
    const optimizer = await request.get(
      `/_next/image?url=${encodeURIComponent(imageUrl)}&w=1920&q=75`,
    );
    expect(optimizer.status()).toBeGreaterThanOrEqual(400);
    const preview = await request.get("/admin-preview/ro?canvas=1", {
      maxRedirects: 0,
    });
    expect([303, 307, 308]).toContain(preview.status());
  });
  for (const locale of ["ro", "ru", "en"] as const)
    test(`${locale}: protected real-layout preview contains full banner and text candidates, with no overflow`, async ({
      page,
    }) => {
      await session(page.context());
      await page.goto(`/admin-preview/${locale}?canvas=1`);
      const response = await admin().get(`/admin-preview/${locale}?canvas=1`);
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["x-robots-tag"]).toContain("noindex");
      const img = page.locator("[data-homepage-banner] img");
      await expect(page.locator('[data-homepage-banner] a, [data-homepage-banner] button')).toHaveCount(0);
      await expect(img).toHaveAttribute(
        "src",
        imageUrl.replace("/api/media/", "/api/admin/media/"),
      );
      await expect(img).toHaveJSProperty("naturalWidth", 1944);
      await expect(page.locator("[data-partners-section]")).toContainText(
        "ARGUS-S",
      );
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(img).toBeVisible();
        const dimensions = await img.evaluate((el) => ({
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
          fit: getComputedStyle(el).objectFit,
        }));
        expect(dimensions.fit).toBe("contain");
        expect(
          Math.abs(dimensions.width / dimensions.height - 1944 / 809),
        ).toBeLessThan(0.01);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBeLessThanOrEqual(1);
      }
      if (locale === "ro") {
        await capture(page, "private-preview-desktop-synthetic-test");
        await page.setViewportSize({width:390,height:844});
        await capture(page, "private-preview-mobile-synthetic-test");
      }
    });
  test("new partner, logo permission, reordering and explicit publication use persistent backend data", async ({
    page,
  }) => {
    await session(page.context());
    await studio(page);
    await page
      .getByRole("button", { name: "Adaugă partener", exact: true })
      .click();
    const card = page.getByRole("region", {
      name: "Partener Partener nou",
      exact: true,
    });
    await card
      .getByLabel("Nume partener", { exact: true })
      .fill("SYNTHETIC TEST PARTNER");
    const edited = page.getByRole("region", {
      name: "Partener SYNTHETIC TEST PARTNER",
      exact: true,
    });
    await edited.getByLabel("Identitatea companiei este confirmată").check();
    await edited
      .getByLabel("Confirm relația ARTMASTER cu acest partener")
      .check();
    await edited
      .getByLabel("Website opțional · HTTPS")
      .fill("https://example.invalid");
    await edited.getByLabel("Încarcă logo PNG / JPEG").setInputFiles({
      name: "SYNTHETIC-logo-test.png",
      mimeType: "image/png",
      buffer: await sharp({
        create: { width: 240, height: 120, channels: 4, background: "#f7cf47" },
      })
        .png()
        .toBuffer(),
    });
    await expect(page.getByRole("status")).toContainText("Imagine încărcată");
    await edited
      .getByLabel("Drept de utilizare logo", { exact: true })
      .selectOption("owner-authorized");
    await edited
      .getByLabel("Proveniență și condiții de utilizare")
      .fill("Synthetic test fixture; not a real partner endorsement.");
    await edited
      .getByLabel("Vizibilitate după publicarea versiunii")
      .selectOption("published");
    for (let i = 0; i < 15; i++)
      await edited
        .getByRole("button", { name: "Mută SYNTHETIC TEST PARTNER în sus" })
        .click();
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Ciorna a fost salvată",
    );
    expect((await state()).draft!.partners![0].name).toBe(
      "SYNTHETIC TEST PARTNER",
    );
    const before = await page.request.get("/ro");
    expect(await before.text()).not.toContain("SYNTHETIC TEST PARTNER");
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Publică această versiune", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("publicat");
    const current = await state();
    expect(current.published.partners![0].name).toBe("SYNTHETIC TEST PARTNER");
  });
  test("published banner and approved partner render RO/RU/EN, preserve colors, links, aspect and private metadata", async ({
    page,
    request,
  }) => {
    const current = await state(),
      logo = current.published.partners![0].image!;
    for (const locale of ["ro", "ru", "en"]) {
      await page.goto(`/${locale}`);
      await expect(page.locator("[data-homepage-banner] img")).toHaveJSProperty(
        "naturalWidth",
        1944,
      );
      const partners = page.locator("[data-partners-section]");
      await expect(partners.getByRole("link", {name:"SYNTHETIC TEST PARTNER",exact:true})).toBeVisible();
      expect(await partners.locator("li").count()).toBe(1);
      const img = partners.locator("img");
      await img.scrollIntoViewIfNeeded();
      await expect(img).toHaveJSProperty("naturalWidth", 240);
      expect(await img.evaluate((el) => getComputedStyle(el).filter)).toBe(
        "none",
      );
      await expect(partners.getByRole("link")).toHaveAttribute(
        "href",
        "https://example.invalid/",
      );
      const html = await (await request.get(`/${locale}`)).text();
      expect(html).not.toContain(
        "Synthetic test fixture; not a real partner endorsement.",
      );
      expect(html).not.toContain("captura-15");
    }
    for (const url of [imageUrl, logo]) {
      const r = await request.get(url);
      expect(r.status()).toBe(200);
      expect(r.headers()["cache-control"]).toContain("no-store");
      expect(r.headers()["content-type"]).toBe("image/webp");
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/ro");
    await capture(page, "public-published-synthetic-test");
  });
  test("hide/archive, alternate mobile image and restoration preserve publication boundaries", async ({
    page,
    request,
  }) => {
    const current = await state(),
      content = structuredClone(current.published),
      logo = content.partners![0].image!;
    content.partners![0].status = "hidden";
    content.banner!.mobile = {
      image: logo,
      width: 240,
      height: 120,
      alt: content.banner!.desktop.alt,
    };
    expect((await save(content)).status()).toBe(200);
    expect((await request.get(logo)).status()).toBe(200);
    await session(page.context());
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin-preview/ro?canvas=1");
    expect(
      await page
        .locator("[data-homepage-banner] img")
        .evaluate((img) => (img as HTMLImageElement).currentSrc),
    ).toContain("/api/admin/media/");
    await expect(page.locator("[data-homepage-banner] img")).toHaveJSProperty(
      "naturalWidth",
      240,
    );
    content.partners![0].status = "archived";
    content.banner!.enabled = false;
    expect((await save(content, "publish")).status()).toBe(200);
    expect((await request.get(logo)).status()).toBe(404);
    expect((await request.get(imageUrl)).status()).toBe(404);
    const latest = await state();
    const restored = await admin().post(
      `/api/admin/content/history/${historyId}`,
      { data: { version: latest.version, confirm: true } },
    );
    expect(restored.status()).toBe(200);
    const after = await state();
    expect(after.draft!.banner!.enabled).toBe(true);
    expect(after.published.banner!.enabled).toBe(false);
  });
  test("viewer UI is read only; unconfirmed publication and stale writes retain existing content", async ({
    page,
  }) => {
    await session(page.context(), 2);
    await studio(page);
    await expect(
      page.getByRole("button", { name: "Adaugă partener", exact: true }),
    ).toBeDisabled();
    const current = await state();
    expect(
      (
        await admin().put("/api/admin/content", {
          data: {
            content: current.draft,
            action: "save-draft",
            version: current.version - 1,
          },
        })
      ).status(),
    ).toBe(409);
    const invalid = structuredClone(current.draft!);
    invalid.partners![0].status = "published";
    expect((await save(invalid)).status()).toBe(400);
    expect((await state()).version).toBe(current.version);
  });
});
