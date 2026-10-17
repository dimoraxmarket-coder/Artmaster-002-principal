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
import { join, resolve } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import sharp from "sharp";
import AxeBuilder from "@axe-core/playwright";
import type { SiteContent } from "../src/lib/content/types";
import { syntheticVideo } from "./fixtures/synthetic-video";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
if (!["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname))
  throw Error("Growth tests require isolated synthetic loopback storage");
const directory = resolve(process.env.ARTMASTER_DATA_DIR || ".data/e2e"),
  nonce = randomUUID().slice(0, 8),
  password = randomBytes(24).toString("base64url");
const users = (["admin", "editor", "viewer"] as const).map((role) => ({
  role,
  email: `growth-${role}-${nonce}@example.invalid`,
  cookie: "",
  api: null as APIRequestContext | null,
}));
const assets: string[] = [];
let original: { published: string | null; draft: string | null };
const admin = () => users[0].api!;
const state = async () =>
  (await admin().get("/api/admin/content")).json() as Promise<{
    published: SiteContent;
    draft: SiteContent | null;
    version: number;
  }>;
async function signed(page: Page, index = 0) {
  await page.context().addCookies([
    {
      name: "artmaster_admin",
      value: users[index].cookie,
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
      secure: false,
    },
  ]);
}
async function content(page: Page) {
  await page.goto("/admin#content");
  await page
    .getByRole("button", { name: "Acasă și Despre noi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Banner · imagine sau video" }),
  ).toBeVisible();
}
async function save(page: Page, publish = false) {
  if (publish) page.once("dialog", (d) => d.accept());
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/content") && r.request().method() === "PUT",
  );
  await page
    .getByRole("button", {
      name: publish ? "Publică această versiune" : "Salvează ciorna",
      exact: true,
    })
    .click();
  expect((await saved).status()).toBe(200);
}
async function capture(page: Page, name: string) {
  if (process.env.ARTMASTER_GROWTH_SCREENSHOTS !== "1") return;
  await mkdir("docs/screenshots/seo-hero-equipment", { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/seo-hero-equipment/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}
test.describe.serial("SEO, hero and equipment integrated workflows", () => {
  test.beforeAll(async () => {
    const ready = await playwrightRequest.newContext({ baseURL });
    expect((await ready.get("/api/quote-token")).status()).toBe(200);
    await ready.dispose();
    const db = new DatabaseSync(join(directory, "artmaster.sqlite"));
    original = db
      .prepare("SELECT published,draft FROM content WHERE id=1")
      .get() as typeof original;
    db.close();
    for (const user of users) {
      const bootstrap = spawnSync(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", "scripts/create-admin.ts"],
        {
          env: {
            ...process.env,
            ARTMASTER_DATA_DIR: directory,
            ARTMASTER_STORAGE: "local",
            ARTMASTER_ALLOW_LOCAL_PRODUCTION: "true",
            ADMIN_EMAIL: user.email,
            ADMIN_ROLE: user.role,
            ADMIN_PASSWORD: "",
          },
          input: password + "\n",
          encoding: "utf8",
        },
      );
      expect(bootstrap.status).toBe(0);
      const auth = await playwrightRequest.newContext({
        baseURL,
        extraHTTPHeaders: { Origin: baseURL, "x-real-ip": "198.18.7.60" },
      });
      const login = await auth.post("/api/admin/login", {
        data: { email: user.email, password },
      });
      expect(login.status()).toBe(200);
      const cookieHeader = login.headers()["set-cookie"];
      user.cookie = cookieHeader.match(/^artmaster_admin=([^;]+)/)![1];
      await auth.dispose();
      user.api = await playwrightRequest.newContext({
        baseURL,
        extraHTTPHeaders: {
          Origin: baseURL,
          Cookie: `artmaster_admin=${user.cookie}`,
          "x-real-ip": "198.18.7.60",
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
      for (const user of users) {
        db.prepare(
          "DELETE FROM sessions WHERE admin_id IN (SELECT id FROM admins WHERE email=?)",
        ).run(user.email);
        db.prepare("DELETE FROM admins WHERE email=?").run(user.email);
      }
      for (const url of assets)
        db.prepare("DELETE FROM media_assets WHERE url=?").run(url);
      db.close();
      for (const url of assets)
        await rm(join(directory, "media", url.split("/").pop()!), {
          force: true,
        });
    }
    for (const user of users) await user.api?.dispose();
  });
  test("unconnected metrics are null and dashboard/date filters use real CRM aggregates", async ({
    page,
  }) => {
    const response = await admin().get("/api/admin/seo");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.google.ga4.users).toBeNull();
    expect(data.google.search.clicks).toBeNull();
    expect(data.google.ga4.state).toBe("unconnected");
    expect(data.submissions).toBe(
      data.days.reduce((n: number, d: { count: number }) => n + d.count, 0),
    );
    expect(JSON.stringify(data)).not.toContain("PRIVATE KEY");
    await signed(page);
    await page.goto("/admin#seo");
    await expect(
      page.getByRole("heading", { name: "SEO & Analytics Center" }),
    ).toBeVisible();
    await expect(
      page.getByText("Vizitatori · GA4", { exact: true }).locator(".."),
    ).toContainText("—");
    await page.getByLabel("De la · dată").fill("2026-01-01");
    await page.getByLabel("Până la · dată").fill("2026-01-02");
    const filtered = page.waitForResponse((r) =>
      r.url().includes("/api/admin/seo?"),
    );
    await page.getByRole("button", { name: "Aplică perioada" }).click();
    expect((await filtered).status()).toBe(200);
    await capture(page, "seo-dashboard-desktop");
  });
  for (const locale of ["ro", "ru", "en"])
    test(`actual ${locale} HTML audit returns weighted checks without fetching external/private URLs`, async () => {
      const response = await admin().post("/api/admin/seo/audit", {
        data: { path: `/${locale}` },
      });
      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.checks).toHaveLength(14);
      expect(data.score).toBe(
        data.checks.reduce(
          (n: number, c: { status: string; weight: number }) =>
            n + (c.status === "pass" ? c.weight : 0),
          0,
        ),
      );
      expect(
        data.checks.find((c: { id: string }) => c.id === "canonical").status,
      ).toBe("pass");
      expect(
        data.checks.find((c: { id: string }) => c.id === "hreflang").status,
      ).toBe("pass");
      expect(
        data.checks.find((c: { id: string }) => c.id === "indexing").status,
      ).toBe("fail");
      expect(response.headers()["cache-control"]).toContain("no-store");
    });
  test("audit UI, mobile layout and accessibility expose actionable real results", async ({
    page,
  }) => {
    await signed(page);
    await page.goto("/admin#seo");
    await expect(
      page.getByRole("button", { name: "Verifică pagina" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Verifică pagina" }).click();
    await expect(
      page.getByRole("cell", { name: "Canonical", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Rulează PageSpeed mobil" }),
    ).toBeDisabled();
    await capture(page, "seo-audit-desktop");
    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(
      axe.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact || ""),
      ),
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await capture(page, "seo-audit-mobile");
  });
  test("hero UI uploads and crops separate desktop/mobile images into a private draft", async ({
    page,
  }) => {
    await signed(page);
    await content(page);
    for (const [name, width, height] of [
      ["Desktop", 640, 360],
      ["Mobil", 360, 640],
    ] as const) {
      const bytes = await sharp({
        create: {
          width,
          height,
          channels: 3,
          background: name === "Desktop" ? "#2d333c" : "#353b43",
        },
      })
        .png()
        .toBuffer();
      await page.getByLabel(`Fișier nou · ${name}`).setInputFiles({
        name: `Synthetic hero ${name}.png`,
        mimeType: "image/png",
        buffer: bytes,
      });
      await expect(page.getByLabel(`Zoom decupare · ${name}`)).toBeVisible();
      if (name === "Desktop")
        await page.getByLabel(`Zoom decupare · ${name}`).press("End");
      await page
        .getByLabel(
          `Confirm dreptul de utilizare pentru acest fișier · ${name}`,
        )
        .check();
      const pending = page.waitForResponse((r) =>
        r.url().endsWith("/api/admin/hero"),
      );
      await page
        .getByRole("button", {
          name: `Decupează și încarcă privat · ${name}`,
          exact: true,
        })
        .click();
      const result = await pending;
      expect(result.status()).toBe(201);
      const asset = await result.json();
      assets.push(asset.url);
      if (name === "Desktop") expect(asset.width).toBeLessThan(640);
    }
    await save(page);
    const saved = await state();
    expect(saved.draft?.heroMedia?.desktop.image).toBe(assets[0]);
    expect(saved.draft?.heroMedia?.mobile?.image).toBe(assets[1]);
    for (const url of assets)
      expect((await admin().get(url)).status()).toBe(404);
    await capture(page, "hero-editor-desktop");
  });
  test("video UI uploads a real silent MP4 and private preview supports authorized byte ranges", async ({
    page,
  }) => {
    await signed(page);
    await content(page);
    await page.getByLabel("Fișier nou · Desktop").setInputFiles({
      name: "Synthetic silent hero.mp4",
      mimeType: "video/mp4",
      buffer: syntheticVideo,
    });
    await page
      .getByLabel("Confirm dreptul de utilizare pentru acest fișier · Desktop")
      .check();
    const pending = page.waitForResponse((r) =>
      r.url().endsWith("/api/admin/hero"),
    );
    await page
      .getByRole("button", { name: "Încarcă video privat · Desktop" })
      .click();
    const response = await pending;
    expect(response.status()).toBe(201);
    const asset = await response.json();
    assets.push(asset.url);
    await save(page);
    expect((await admin().get(asset.url)).status()).toBe(404);
    const privateURL = asset.url.replace("/api/media/", "/api/admin/media/");
    const partial = await admin().get(privateURL, {
      headers: { Range: "bytes=0-15" },
    });
    expect(partial.status()).toBe(206);
    expect((await partial.body()).length).toBe(16);
    const anon = await playwrightRequest.newContext({ baseURL });
    expect((await anon.get(privateURL)).status()).toBe(401);
    await anon.dispose();
    await page.goto("/admin-preview/ro?canvas=1");
    await expect(page.locator("video.hero-video")).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator("video.hero-video")
          .evaluate((v: HTMLVideoElement) => v.readyState),
      )
      .toBeGreaterThanOrEqual(2);
    expect((await page.request.get(asset.url)).status()).toBe(404);
    await capture(page, "hero-private-preview");
  });
  test("hero publication updates actual multilingual homepages while mobile uses its own poster", async ({
    page,
  }) => {
    await signed(page);
    await content(page);
    await save(page, true);
    for (const l of ["ro", "ru", "en"]) {
      await page.goto("/" + l);
      await expect(page.locator(".home-hero video")).toHaveAttribute(
        "src",
        assets[2],
      );
      expect(
        (
          await page.request.get(assets[2], { headers: { Range: "bytes=0-7" } })
        ).status(),
      ).toBe(206);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en");
    expect(
      await page
        .locator(".home-hero img")
        .evaluate((img: HTMLImageElement) => img.currentSrc),
    ).toContain(assets[1]);
    await expect(page.locator(".home-hero video")).toHaveCount(0);
    await capture(page, "hero-public-mobile");
  });
  test("equipment candidates create real multilingual drafts; metadata and photo selection persist", async ({
    page,
  }) => {
    await signed(page);
    await page.goto("/admin#equipment");
    await expect(
      page.getByRole("heading", { name: "Equipment Studio", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Adaugă candidat în ciornă · Roland VS-640",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Verificarea modelului")
      .selectOption("owner_confirmed");
    await page.getByLabel("Drepturile imaginii").selectOption("owner");
    await page
      .getByLabel("Dovada / nota drepturilor")
      .fill(
        "Synthetic self-created test image; no real equipment photograph is distributed.",
      );
    const bytes = await sharp({
      create: { width: 640, height: 480, channels: 3, background: "#303742" },
    })
      .png()
      .toBuffer();
    const pending = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/media") && r.request().method() === "POST",
    );
    await page
      .getByLabel("Încarcă fotografie PNG / JPEG, maximum 5 MB")
      .setInputFiles({
        name: "Synthetic equipment test.png",
        mimeType: "image/png",
        buffer: bytes,
      });
    const upload = await pending;
    expect(upload.status()).toBe(201);
    assets.push((await upload.json()).url);
    await page
      .getByRole("button", { name: "Adaugă specificație", exact: true })
      .click();
    for (const [locale, label] of [
      ["ro", "Română"],
      ["ru", "Rusă"],
      ["en", "Engleză"],
    ] as const) {
      await page
        .getByRole("button", {
          name: `${locale.toUpperCase()} · ${label}`,
          exact: true,
        })
        .click();
      await page
        .getByLabel("Parametru 1", { exact: true })
        .fill(`Synthetic parameter ${locale}`);
      await page
        .getByLabel("Valoare 1", { exact: true })
        .fill(`Synthetic value ${locale}`);
    }
    await save(page);
    const saved = await state(),
      entry = saved.draft!.equipment.find((e) => e.slug === "roland-vs-640")!;
    expect(entry.catalog?.specs[0].value.en).toBe("Synthetic value en");
    expect(entry.catalog?.published).toBe(false);
    expect((await admin().get("/en/echipamente/roland-vs-640")).status()).toBe(
      404,
    );
    expect((await admin().get(assets[3])).status()).toBe(404);
    await capture(page, "equipment-editor-desktop");
    await page.goto("/admin-preview/en/echipamente/roland-vs-640?canvas=1");
    await expect(
      page.getByText("Synthetic value en", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("main img").first()).toHaveAttribute(
      "src",
      assets[3].replace("/api/media/", "/api/admin/media/"),
    );
  });
  test("catalog publication is guarded by confirmed model/image rights and administrator role", async () => {
    const saved = await state(),
      value = structuredClone(saved.draft!),
      entry = value.equipment.find((e) => e.slug === "roland-vs-640")!;
    entry.catalog!.published = true;
    entry.catalog!.imageRights = "pending";
    expect(
      (
        await admin().put("/api/admin/content", {
          data: { content: value, version: saved.version, action: "publish" },
        })
      ).status(),
    ).toBe(400);
    entry.catalog!.imageRights = "owner";
    expect(
      (
        await users[1].api!.put("/api/admin/content", {
          data: { content: value, version: saved.version, action: "publish" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await admin().post("/api/admin/seo/audit", {
          data: { path: "http://169.254.169.254/" },
        })
      ).status(),
    ).toBe(400);
  });
  test("equipment publication updates real gallery/detail/sitemap, preserves private candidates and mobile layout", async ({
    page,
  }) => {
    await signed(page);
    await page.goto("/admin#equipment");
    await page
      .getByLabel("Alege elementul de editat")
      .selectOption({ label: "Roland VS-640" });
    await page
      .getByLabel("Include după publicarea explicită a documentului")
      .check();
    await save(page, true);
    for (const l of ["ro", "ru", "en"]) {
      await page.goto(`/${l}/echipamente/roland-vs-640`);
      await expect(
        page.getByText(`Synthetic value ${l}`, { exact: true }),
      ).toBeVisible();
    }
    expect(await (await admin().get("/sitemap.xml")).text()).toContain(
      "/en/echipamente/roland-vs-640",
    );
    expect((await admin().get(assets[3])).status()).toBe(200);
    await page.goto("/en/echipamente");
    const pictures = page.locator(".equipment-catalog img");
    await expect(pictures).toHaveCount(6);
    for (const picture of await pictures.all()) {
      await picture.scrollIntoViewIfNeeded();
      await expect(picture).toBeVisible();
      await expect
        .poll(() =>
          picture.evaluate((img: HTMLImageElement) => img.naturalWidth),
        )
        .toBeGreaterThan(0);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await capture(page, "equipment-gallery-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await capture(page, "equipment-gallery-mobile");
  });
  test("new APIs recheck expired/revoked sessions and viewer role restrictions", async () => {
    expect(
      (
        await users[2].api!.post("/api/admin/hero", {
          multipart: {
            file: {
              name: "test.png",
              mimeType: "image/png",
              buffer: Buffer.from("synthetic"),
            },
            rightsConfirmed: "true",
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await users[2].api!.post("/api/admin/seo/pagespeed", {
          data: { path: "/ro" },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await users[1].api!.post("/api/admin/seo/pagespeed", {
          data: { path: "/ro" },
        })
      ).status(),
    ).toBe(409);
    expect(
      (await users[1].api!.post("/api/admin/logout", { data: {} })).status(),
    ).toBe(200);
    expect((await users[1].api!.get("/api/admin/seo")).status()).toBe(401);
    expect(
      (
        await users[1].api!.post("/api/admin/seo/audit", {
          data: { path: "/ro" },
        })
      ).status(),
    ).toBe(401);
  });
});
