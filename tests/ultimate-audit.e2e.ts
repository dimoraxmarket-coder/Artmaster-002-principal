import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from "./browser-fixtures";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { LocalStorage } from "../src/lib/server/local";
import { issueFormToken } from "../src/lib/server/guards";
import type { Quote } from "../src/lib/server/types";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname))
  throw Error("Only synthetic loopback tests are permitted");
const tag = randomUUID().slice(0, 8),
  email = `ultimate-${tag}@example.invalid`,
  password = randomBytes(24).toString("base64url");
let api: APIRequestContext, cookie: string;
async function capture(page: Page, name: string) {
  if (process.env.ARTMASTER_AUDIT_SCREENSHOTS !== "1") return;
  await mkdir("docs/screenshots/ultimate-audit", { recursive: true });
  await page.screenshot({
    path: `docs/screenshots/ultimate-audit/${name}.png`,
    animations: "disabled",
  });
}
test.describe
  .serial("real SEO diagnostics, privacy and secure image submission", () => {
  test.beforeAll(async () => {
    const ready = await playwrightRequest.newContext({ baseURL });
    expect((await ready.get("/api/quote-token")).status()).toBe(200);
    await ready.dispose();
    const result = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/create-admin.ts"],
      {
        env: {
          ...process.env,
          ARTMASTER_STORAGE: "local",
          ARTMASTER_ALLOW_LOCAL_PRODUCTION: "true",
          ARTMASTER_DATA_DIR: resolve(
            process.env.ARTMASTER_DATA_DIR || ".data/e2e",
          ),
          ADMIN_EMAIL: email,
          ADMIN_ROLE: "admin",
          ADMIN_PASSWORD: "",
        },
        input: password + "\n",
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);
    const login = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL, "x-real-ip": "198.18.20.21" },
    });
    const response = await login.post("/api/admin/login", {
      data: { email, password },
    });
    expect(response.status()).toBe(200);
    const headers = response.headers();
    cookie = headers["set-cookie"].match(/^artmaster_admin=([^;]+)/)![1];
    await login.dispose();
    api = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: {
        Origin: baseURL,
        Cookie: `artmaster_admin=${cookie}`,
      },
    });
  });
  test.afterAll(async () => {
    if (api) {
      await api.post("/api/admin/logout");
      await api.dispose();
    }
  });
  test("all-page audit persists actual coverage, reloads history, filters results and shows honest admin-only readiness", async ({
    page,
    request,
  }) => {
    test.setTimeout(180000);
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
    await page.goto("/admin#seo");
    await expect(
      page.getByRole("heading", { name: "SEO & Analytics Center" }),
    ).toBeVisible();
    const first = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/admin/seo/audit") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Verifică pagina", exact: true })
      .click();
    expect((await first).status()).toBe(200);
    await page.reload();
    const panel = page.getByRole("region", {
      name: "Acoperire și istoric SEO",
    });
    await expect(panel).toContainText("Vezi ultima verificare salvată");
    await panel
      .getByRole("button", { name: "Verifică toate paginile publice" })
      .click();
    await expect(
      panel.getByRole("button", { name: "Verifică toate paginile publice" }),
    ).toBeEnabled({ timeout: 140000 });
    await expect
      .poll(async () => {
        const r = await api.get("/api/admin/seo/history?path=/ro");
        expect(r.status()).toBe(200);
        const d = await r.json();
        return d.checkedPages === d.totalPages && d.overallScore !== null;
      })
      .toBe(true);
    await expect(panel).not.toContainText("Scor general necalculat");
    await panel.getByLabel("Filtru rezultate SEO").selectOption("passed");
    await expect(panel).toContainText(
      "Nu există rezultate salvate pentru acest filtru.",
    );
    await panel.getByLabel("Filtru rezultate SEO").selectOption("all");
    await panel.evaluate((e) => {
      window.scrollTo({ top: window.scrollY + e.getBoundingClientRect().top - 90, behavior: "instant" });
    });
    await expect(panel.getByRole("heading", { name: "Scor tehnic general și istoric" })).toBeInViewport();
    await capture(page, "seo-history-desktop");
    await page.setViewportSize({ width: 375, height: 812 });
    await panel.evaluate((e) => {
      window.scrollTo({ top: window.scrollY + e.getBoundingClientRect().top - 90, behavior: "instant" });
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await capture(page, "seo-history-mobile");
    expect((await request.get("/api/admin/security/posture")).status()).toBe(
      401,
    );
    expect((await request.get("/api/admin/seo/history")).status()).toBe(401);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("link", { name: "Securitate", exact: true }).click();
    const posture = page.getByRole("region", {
      name: "Starea verificabilă a protecțiilor",
    });
    await expect(posture).toContainText("Netestat");
    await expect(posture).toContainText("Neconfigurat");
    await posture.evaluate((e) => {
      window.scrollTo({ top: window.scrollY + e.getBoundingClientRect().top - 90, behavior: "instant" });
    });
    await capture(page, "security-readiness-desktop");
    await page.setViewportSize({ width: 375, height: 812 });
    await posture.evaluate((e) => {
      window.scrollTo({ top: window.scrollY + e.getBoundingClientRect().top - 90, behavior: "instant" });
    });
    await capture(page, "security-readiness-mobile");
  });
  test("public PNG submission reaches CRM sanitized while attachment access remains private", async ({
    page,
    request,
  }) => {
    await page.goto("/ro/contact");
    const form = page.locator("main form");
    await form.locator("[name=name]").fill(`Synthetic image audit ${tag}`);
    await form.locator("[name=email]").fill(`image-${tag}@example.invalid`);
    await form.locator("[name=phone]").fill("+37360010400");
    await form.locator("[name=service]").selectOption({ index: 1 });
    await form
      .locator("[name=message]")
      .fill(
        "Synthetic raster sanitization end-to-end check, not a customer request.",
      );
    await form.locator("[name=consent]").check();
    const details = form.locator("details.quote-details");
    if (
      (await details.count()) &&
      (await details.getAttribute("open")) === null
    )
      await details.locator("summary").click();
    const image = await sharp({
      create: { width: 120, height: 60, channels: 3, background: "#ffca05" },
    })
      .withExif({ IFD0: { Artist: "Synthetic private metadata" } })
      .png()
      .toBuffer();
    const original = Buffer.concat([
      image,
      Buffer.from("<script>HARMLESS_TRAILER</script>"),
    ]);
    await form.locator("[name=files]").setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: original,
    });
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/api/quotes") && r.request().method() === "POST",
    );
    await form.locator("button[type=submit]").click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const receipt = await response.json();
    const d = await api.get(`/api/admin/quotes/${receipt.id}`);
    expect(d.status()).toBe(200);
    const data = await d.json(),
      file = data.quote.files[0],
      url = `/api/admin/quotes/${receipt.id}/files/${file.id}`;
    expect((await request.get(url)).status()).toBe(401);
    const download = await api.get(url);
    expect(download.status()).toBe(200);
    const bytes = await download.body();
    expect(bytes.includes(Buffer.from("HARMLESS_TRAILER"))).toBe(false);
    const meta = await sharp(bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(120);
    expect(download.headers()["content-disposition"]).toContain("attachment");
    expect(download.headers()["cache-control"]).toContain("no-store");
  });
  test("managed images bypass the optimizer and cannot remain in a public transform cache after unpublish", async ({
    page,
    request,
  }) => {
    const state = await (await api.get("/api/admin/content")).json();
    const image = await sharp({
      create: { width: 180, height: 90, channels: 3, background: "#ffca05" },
    })
      .png()
      .toBuffer();
    const upload = await api.post("/api/admin/media", {
      multipart: {
        file: {
          name: "synthetic-cache.png",
          mimeType: "image/png",
          buffer: image,
        },
      },
    });
    expect(upload.status()).toBe(201);
    const { url } = await upload.json();
    const content = structuredClone(state.published);
    content.services[0].image = url;
    const save = async (value: unknown, action = "publish") => {
      const current = await (await api.get("/api/admin/content")).json();
      expect(
        (
          await api.put("/api/admin/content", {
            data: { content: value, action, version: current.version },
          })
        ).status(),
      ).toBe(200);
    };
    try {
      await save(content);
      expect((await request.get(url)).status()).toBe(200);
      await page.goto("/ro/servicii/" + content.services[0].slug);
      await expect(page.locator(`img[src="${url}"]`)).toHaveCount(1);
      for (const target of [
        url,
        url.replace("/api/media/", "/api/admin/media/"),
        "/media/../" + url.slice(1),
        "/images/%2e%2e%2f" + url.slice(1),
      ]) {
        const transformed = await request.get(
          "/_next/image?url=" + encodeURIComponent(target) + "&w=640&q=75",
        );
        expect([400, 404]).toContain(transformed.status());
      }
      await save(state.published);
      expect((await request.get(url)).status()).toBe(404);
      expect(
        (
          await request.get(
            "/_next/image?url=" + encodeURIComponent(url) + "&w=640&q=75",
          )
        ).status(),
      ).toBe(400);
    } finally {
      await save(state.published);
      if (state.draft) await save(state.draft, "save-draft");
    }
  });
  test("a real retry of a legacy raster request returns its existing receipt and never overwrites its private attachment", async () => {
    const token = await issueFormToken(Date.now() - 2000),
      store = new LocalStorage();
    const image = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#ffca05" },
    })
      .png()
      .toBuffer();
    const bytes = Buffer.concat([
      image,
      Buffer.from("HARMLESS_LEGACY_TRAILER"),
    ]);
    const fields = {
      locale: "ro",
      service: "print-uv",
      name: "Synthetic legacy retry",
      email: "legacy-retry@example.invalid",
      phone: "+37360010400",
      message:
        "Synthetic legacy submission used only for compatibility testing.",
      company: "",
      dimensions: "",
      quantity: "",
      deadline: "",
      sourcePath: "/ro/contact",
    };
    const file = {
      id: randomUUID(),
      path: randomUUID(),
      name: "legacy.png",
      mime: "image/png",
      size: bytes.length,
    };
    const payloadHash = createHash("sha256")
      .update(
        JSON.stringify({
          ...fields,
          files: [
            {
              name: file.name,
              mime: file.mime,
              hash: createHash("sha256").update(bytes).digest("hex"),
            },
          ],
        }),
      )
      .digest("hex");
    const quote: Quote = {
      ...fields,
      id: randomUUID(),
      idempotencyKey: token.idempotencyKey,
      payloadHash,
      createdAt: new Date().toISOString(),
      status: "new",
      notification: "not_configured",
      files: [file],
    };
    await store.createQuote(quote, [
      { name: file.name, mime: file.mime, bytes },
    ]);
    const response = await api.post("/api/quotes", {
      multipart: {
        ...fields,
        ...token,
        consent: "true",
        website: "",
        files: { name: file.name, mimeType: file.mime, buffer: bytes },
      },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      id: quote.id,
      duplicate: true,
    });
    const saved = await api.get(
      `/api/admin/quotes/${quote.id}/files/${file.id}`,
    );
    expect(saved.status()).toBe(200);
    expect(await saved.body()).toEqual(bytes);
  });
  test("analytics is absent when unconfigured; configured consent has real opt-in, redacted SPA page views and cookie withdrawal", async ({
    page,
    context,
  }) => {
    let scriptRequests = 0;
    await page.route("**/www.googletagmanager.com/**", (route) => {
      scriptRequests++;
      return route.fulfill({
        contentType: "application/javascript",
        body: "window.__syntheticGoogleScriptLoaded=true;",
      });
    });
    await page.route("**/*google-analytics.com/**", (route) => route.abort());
    await page.goto(
      "/ro/contact?email=synthetic-private@example.invalid#private",
    );
    const accept = page.getByRole("button", {
      name: "Accept analiza",
      exact: true,
    });
    if (!(await accept.count())) {
      expect(process.env.ARTMASTER_EXPECT_ANALYTICS).not.toBe("1");
      expect(scriptRequests).toBe(0);
      return;
    }
    expect(scriptRequests).toBe(0);
    await context.addCookies([
      { name: "_ga", value: "synthetic", url: baseURL },
      { name: "artmaster_test_preference", value: "keep", url: baseURL },
    ]);
    await accept.click();
    await expect.poll(() => scriptRequests).toBe(1);
    await page.waitForFunction(() =>
      Array.from(
        (window as unknown as { dataLayer: unknown[][] }).dataLayer || [],
      ).some((v) => v[0] === "event" && v[1] === "page_view"),
    );
    const views = () =>
      page.evaluate(() =>
        Array.from(
          (window as unknown as { dataLayer: unknown[][] }).dataLayer || [],
        )
          .filter((v) => v[0] === "event" && v[1] === "page_view")
          .map((v) => v[2] as { page_location: string }),
      );
    expect((await views())[0].page_location).toBe(baseURL + "/ro/contact");
    await page.evaluate(() =>
      window.dispatchEvent(new Event("artmaster:quote-saved")),
    );
    const commands = await page.evaluate(() =>
      Array.from((window as unknown as { dataLayer: unknown[][] }).dataLayer || []),
    );
    for (const kind of ["config", "set", "generate_lead"]) {
      const command = commands.find((v) =>
        kind === "generate_lead" ? v[0] === "event" && v[1] === kind : v[0] === kind,
      );
      expect(command).toBeTruthy();
      const params = command![kind === "set" ? 1 : 2] as { page_location: string };
      expect(params.page_location).toBe(baseURL + "/ro/contact");
      expect(JSON.stringify(params)).not.toContain("synthetic-private");
    }
    await page.locator('footer a[href="/ro/cookies"]').click();
    await expect.poll(async () => (await views()).length).toBe(2);
    await page
      .getByRole("button", { name: "Modifică preferințele de analiză" })
      .click();
    await page.getByRole("button", { name: "Refuz", exact: true }).click();
    expect((await context.cookies()).some((c) => c.name === "_ga")).toBe(false);
    expect(
      (await context.cookies()).some(
        (c) => c.name === "artmaster_test_preference",
      ),
    ).toBe(true);
    await page.locator("header .brand-link").click();
    expect((await views()).length).toBe(2);
    expect(scriptRequests).toBe(1);
  });
});
