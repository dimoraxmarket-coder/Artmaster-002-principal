import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "./browser-fixtures";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import type { SiteContent } from "../src/lib/content/types";
import { websiteCopy } from "../src/lib/content/page-copy";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname))
  throw new Error("Content browser tests require synthetic loopback storage.");
const directory = resolve(process.env.ARTMASTER_DATA_DIR || ".data/e2e"),
  nonce = randomUUID().slice(0, 8);
const members = (["admin", "editor", "viewer"] as const).map((role) => ({
  role,
  email: `content-${role}-${nonce}@example.invalid`,
  password: randomBytes(24).toString("base64url"),
  cookie: "",
  api: null as APIRequestContext | null,
}));
let original: { published: string | null; draft: string | null },
  published: SiteContent,
  draft: SiteContent,
  sourceId: number,
  imageUrl: string;
const privateSlug = `studio-private-${nonce}`;
const titles = {
  ro: "Idei private în studio.",
  ru: "Приватные идеи в студии.",
  en: "Private ideas in the studio.",
};
function db() {
  return new DatabaseSync(join(directory, "artmaster.sqlite"));
}
function admin() {
  return members[0].api!;
}
async function state() {
  return (await admin().get("/api/admin/content")).json() as Promise<{
    published: SiteContent;
    draft: SiteContent | null;
    version: number;
  }>;
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
async function studio(page: Page) {
  await page.goto("/admin");
  await page.getByRole("link", { name: "Conținut", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Conținut Studio", exact: true }),
  ).toBeVisible();
}
async function capture(page: Page, name: string) {
  if (process.env.ARTMASTER_CONTENT_SCREENSHOTS !== "1") return;
  await mkdir("docs/screenshots/admin-phase6", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `docs/screenshots/admin-phase6/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
test.describe
  .serial("protected content studio against real local production server", () => {
  test.beforeAll(async () => {
    const ready = await playwrightRequest.newContext({ baseURL });
    expect((await ready.get("/api/quote-token")).status()).toBe(200);
    await ready.dispose();
    const data = db();
    original = data
      .prepare("SELECT published,draft FROM content WHERE id=1")
      .get() as typeof original;
    data.close();
    for (const member of members) {
      const result = spawnSync(
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
      expect(result.status).toBe(0);
      const bootstrap = await playwrightRequest.newContext({
        baseURL,
        extraHTTPHeaders: { Origin: baseURL, "x-real-ip": "198.18.6.60" },
      });
      const response = await bootstrap.post("/api/admin/login", {
        data: { email: member.email, password: member.password },
      });
      expect(response.status()).toBe(200);
      const cookieHeader = response.headers()["set-cookie"];
      member.cookie = cookieHeader.match(/^artmaster_admin=([^;]+)/)![1];
      await bootstrap.dispose();
      member.api = await playwrightRequest.newContext({
        baseURL,
        extraHTTPHeaders: {
          Origin: baseURL,
          Cookie: `artmaster_admin=${member.cookie}`,
        },
      });
    }
    const current = await state();
    published = current.published;
    draft = structuredClone(published);
    draft.copy = websiteCopy(draft);
    draft.copy.hero.title = titles;
    draft.copy.about.heading = titles;
    const bytes = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "#c9ad4a" },
    })
      .png()
      .toBuffer();
    const image = await admin().post("/api/admin/media", {
      multipart: {
        file: {
          name: "Synthetic content studio image.png",
          mimeType: "image/png",
          buffer: bytes,
        },
      },
    });
    expect(image.status()).toBe(201);
    imageUrl = (await image.json()).url;
    draft.services[0].image = imageUrl;
    draft.projects.push({
      ...draft.projects[0],
      slug: privateSlug,
      title: titles,
      image: imageUrl,
      published: false,
    });
    expect(
      (
        await admin().put("/api/admin/content", {
          data: {
            content: draft,
            action: "save-draft",
            version: current.version,
          },
        })
      ).status(),
    ).toBe(200);
    sourceId = (
      await (await admin().get("/api/admin/content/history?pageSize=1")).json()
    ).versions[0].id;
  });
  test.afterAll(async () => {
    if (original) {
      const data = db();
      data
        .prepare("UPDATE content SET published=?,draft=? WHERE id=1")
        .run(original.published, original.draft);
      // Remove only this fixture's synthetic accounts. Immutable history/audit remain.
      // Leaving an enabled administrator changes the following last-admin safety scenario.
      for (const member of members) {
        const row = data
          .prepare("SELECT id FROM admins WHERE email=?")
          .get(member.email) as { id: string } | undefined;
        if (row) {
          data.prepare("DELETE FROM sessions WHERE admin_id=?").run(row.id);
          data.prepare("DELETE FROM admins WHERE id=?").run(row.id);
        }
      }
      data.close();
    }
    for (const member of members) await member.api?.dispose();
  });
  test("draft data, history and preview remain inaccessible anonymously including RSC requests and image optimization", async ({
    request,
  }) => {
    expect((await request.get("/api/admin/content/history")).status()).toBe(
      401,
    );
    expect(
      (await request.get(`/api/admin/content/history/${sourceId}`)).status(),
    ).toBe(401);
    for (const path of ["/admin-preview/ro", "/admin-preview/en?canvas=1"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(response.headers()["x-robots-tag"]).toContain("noindex");
      expect(await response.text()).not.toContain(titles.en);
    }
    const rsc = await request.get("/admin-preview/ru?canvas=1", {
      headers: { RSC: "1" },
    });
    expect(await rsc.text()).not.toContain(titles.ru);
    expect((await request.get(imageUrl)).status()).toBe(404);
    expect(
      (
        await request.get(imageUrl.replace("/api/media/", "/api/admin/media/"))
      ).status(),
    ).toBe(401);
    const optimized = await request.get(
      `/_next/image?url=${encodeURIComponent(imageUrl.replace("/api/media/", "/api/admin/media/"))}&w=640&q=75`,
    );
    expect(optimized.status()).not.toBe(200);
    const publicPage = await request.get("/ro");
    expect(await publicPage.text()).not.toContain(titles.ro);
  });
  test("actual public layouts preview saved drafts in RO/RU/EN with private images and real mobile viewport", async ({
    page,
    context,
  }) => {
    await session(context);
    const response = await page.goto("/admin-preview/ro");
    expect(response!.headers()["cache-control"]).toContain("no-store");
    expect(response!.headers()["x-robots-tag"]).toContain("noindex");
    const canvas = page.frameLocator("iframe");
    await expect(
      canvas.getByRole("heading", { name: titles.ro, exact: false }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("note").filter({ hasText: "DRAFT" }),
    ).toBeVisible();
    const image = canvas
      .locator(
        `img[src="${imageUrl.replace("/api/media/", "/api/admin/media/")}"]`,
      )
      .first();
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(
      canvas.locator('a[href="/admin-preview/ro/servicii?canvas=1"]').first(),
    ).toBeVisible();
    await expect(
      canvas.getByText("Preview · enquiries are disabled.", { exact: false }),
    ).toBeVisible();
    await canvas.locator("html").evaluate(() => window.scrollTo(0, 0));
    await capture(page, "preview-ro-desktop");
    await page.getByLabel("Limba", { exact: true }).selectOption("ru");
    await expect(
      canvas.getByRole("heading", { name: titles.ru, exact: false }),
    ).toBeVisible();
    await capture(page, "preview-ru-desktop");
    await page.getByLabel("Limba", { exact: true }).selectOption("en");
    await expect(
      canvas.getByRole("heading", { name: titles.en, exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mobil · 390px" }).click();
    await expect
      .poll(() => canvas.locator("html").evaluate(() => innerWidth))
      .toBe(390);
    await expect
      .poll(() =>
        canvas
          .locator("html")
          .evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
      )
      .toBe(true);
    await capture(page, "preview-en-mobile");
    await page.getByLabel("Pagina", { exact: true }).selectOption("despre-noi");
    await expect(
      canvas.getByRole("heading", { name: titles.en, exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Pagina", { exact: true })
      .selectOption("portofoliu/" + privateSlug);
    await expect(
      canvas.getByRole("heading", { name: titles.en, exact: true }),
    ).toBeVisible();
    expect((await admin().get("/en/portofoliu/" + privateSlug)).status()).toBe(
      404,
    );
    const frameResponse = await admin().get(
      "/admin-preview/en/servicii?canvas=1",
    );
    expect(frameResponse.headers()["cache-control"]).toContain("no-store");
    expect(frameResponse.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'self'",
    );
    expect(frameResponse.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  });
  test("structured editor preserves unsaved changes and selects existing Media Studio assets", async ({
    page,
    context,
  }) => {
    await session(context);
    await studio(page);
    await page
      .getByRole("button", { name: "Acasă și Despre noi", exact: true })
      .click();
    await expect(
      page.getByLabel("Titlu — Română", { exact: true }).first(),
    ).toHaveValue(titles.ro);
    await page
      .getByLabel("Titlu — Română", { exact: true })
      .first()
      .fill("Titlu local nesalvat");
    await expect(
      page.getByRole("note").filter({ hasText: "ultima ciornă salvată" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Servicii", exact: true }).click();
    await page
      .getByRole("button", { name: "Alege din Media Studio", exact: true })
      .click();
    await page
      .getByRole("searchbox", { name: "Caută imagini" })
      .fill("Synthetic content studio image");
    await page
      .getByRole("button", {
        name: /Synthetic content studio image.*Selectează/,
      })
      .click();
    await expect(
      page.getByLabel("Adresa imaginii", { exact: true }),
    ).toHaveValue(imageUrl);
    await page
      .locator("summary")
      .filter({ hasText: "Istoric și restaurare" })
      .click();
    await page
      .getByRole("button", { name: `Compară #${sourceId}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Restaurează într-o ciornă nouă" }),
    ).toBeDisabled();
    await capture(page, "content-editor-unsaved");
  });
  test("history comparison restores into a new draft, enforces CAS and leaves publication unchanged", async ({
    page,
    context,
  }) => {
    const latest = await state(),
      newer = structuredClone(draft);
    newer.copy!.hero.title.ro = "O ciornă mai nouă";
    expect(
      (
        await admin().put("/api/admin/content", {
          data: {
            content: newer,
            action: "save-draft",
            version: latest.version,
          },
        })
      ).status(),
    ).toBe(200);
    await session(context);
    await studio(page);
    await page
      .locator("summary")
      .filter({ hasText: "Istoric și restaurare" })
      .click();
    await page
      .getByRole("button", { name: `Compară #${sourceId}`, exact: true })
      .click();
    await expect(
      page.getByText("copy.hero.title.ro", { exact: true }),
    ).toBeVisible();
    const compareAccessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      compareAccessibility.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await capture(page, "content-history-desktop");
    page.once("dialog", (dialog) => dialog.accept());
    const restored = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/admin/content/history/${sourceId}`) &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Restaurează într-o ciornă nouă" })
      .click();
    expect((await restored).status()).toBe(200);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "restaurată într-o ciornă nouă" }),
    ).toBeVisible();
    const now = await state();
    expect(now.draft!.copy!.hero.title.ro).toBe(titles.ro);
    expect(now.published).toEqual(published);
    expect(
      (
        await admin().post(`/api/admin/content/history/${sourceId}`, {
          data: { version: latest.version, confirm: true },
        })
      ).status(),
    ).toBe(409);
    const latestVersion = (
      await (await admin().get("/api/admin/content/history?pageSize=1")).json()
    ).versions[0];
    expect(latestVersion.action).toBe("restore");
    expect(latestVersion.sourceId).toBe(sourceId);
    await page
      .getByRole("button", { name: "Acasă și Despre noi", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await capture(page, "content-editor-mobile");
  });
  test("explicit admin publication renders saved RO/RU/EN copy and only published private media becomes public", async ({
    request,
  }) => {
    const current = await state();
    const saved = current.draft!;
    let response = await admin().put("/api/admin/content", {
      data: { content: saved, action: "publish", version: current.version },
    });
    expect(response.status()).toBe(200);
    for (const locale of ["ro", "ru", "en"] as const) {
      const page = await request.get("/" + locale);
      expect(page.status()).toBe(200);
      expect(await page.text()).toContain(titles[locale]);
    }
    expect((await request.get(imageUrl)).status()).toBe(200);
    expect((await request.get("/ro/portofoliu/" + privateSlug)).status()).toBe(
      404,
    );
    const publishedVersion = (await response.json()).version;
    response = await admin().put("/api/admin/content", {
      data: {
        content: published,
        action: "publish",
        version: publishedVersion,
      },
    });
    expect(response.status()).toBe(200);
    const restoredVersion = (await response.json()).version;
    expect(
      (
        await admin().put("/api/admin/content", {
          data: {
            content: saved,
            action: "save-draft",
            version: restoredVersion,
          },
        })
      ).status(),
    ).toBe(200);
    expect((await request.get(imageUrl)).status()).toBe(404);
    expect(await (await request.get("/ro")).text()).not.toContain(titles.ro);
  });
  test("viewer preview works but restoration and publication require the appropriate live role", async ({
    page,
    context,
  }) => {
    const viewer = members[2].api!,
      editor = members[1].api!,
      current = await state();
    expect(
      (
        await viewer.post(`/api/admin/content/history/${sourceId}`, {
          data: { version: current.version, confirm: true },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await editor.put("/api/admin/content", {
          data: { content: draft, action: "publish", version: current.version },
        })
      ).status(),
    ).toBe(403);
    await session(context, 2);
    await page.goto("/admin-preview/ro?canvas=1");
    await expect(
      page.getByRole("heading", { name: titles.ro, exact: false }),
    ).toBeVisible();
    expect(
      (await viewer.post("/api/admin/logout", { data: {} })).status(),
    ).toBe(200);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Bine ai revenit" }),
    ).toBeVisible();
    expect((await viewer.get("/api/admin/content/history")).status()).toBe(401);
  });
  test("Content Studio and preview toolbar pass serious/critical accessibility checks", async ({
    page,
    context,
  }) => {
    await session(context);
    await studio(page);
    await page
      .getByRole("button", { name: "Acasă și Despre noi", exact: true })
      .click();
    const studioResult = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      studioResult.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await capture(page, "content-editor-desktop");
    await page.goto("/admin-preview/en");
    await expect(
      page
        .frameLocator("iframe")
        .getByRole("heading", { name: titles.en, exact: false }),
    ).toBeVisible();
    const previewResult = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      previewResult.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
  });
});
