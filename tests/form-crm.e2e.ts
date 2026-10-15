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
import { unlink } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import type { QuoteDetail, QuotePage } from "../src/lib/server/workflow-types";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname))
  throw new Error("Form/CRM tests require isolated loopback local storage.");
const directory = resolve(process.env.ARTMASTER_DATA_DIR || ".data/e2e"),
  nonce = randomUUID().slice(0, 8),
  email = `forms-admin-${nonce}@example.invalid`,
  password = randomBytes(24).toString("base64url");
let admin: APIRequestContext,
  cookie: string,
  staffId: string,
  staffEmail: string;
const created = new Map<string, string[]>();
async function find(q: string, extra = "") {
  const result = await admin.get(
    `/api/admin/quotes?q=${encodeURIComponent(q)}&pageSize=1${extra}`,
  );
  expect(result.status()).toBe(200);
  return result.json() as Promise<QuotePage>;
}
async function fill(
  page: Page,
  locale: string,
  path: string,
  tag: string,
  attach = true,
) {
  // Observe FormData for an exact semantic replay. CDP omits native multipart file bodies.
  // The actual browser fetch and submitted FormData remain unchanged.
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (input === "/api/quotes" && init?.body instanceof FormData) {
        const serialized = new Response(init.body);
        (
          window as unknown as {
            __artmasterFormSnapshot: { type: string; bytes: number[] };
          }
        ).__artmasterFormSnapshot = {
          type: serialized.headers.get("content-type")!,
          bytes: Array.from(new Uint8Array(await serialized.arrayBuffer())),
        };
      }
      return original(input, init);
    };
  });
  await page.goto(`/${locale}${path}`);
  const form = page.locator("main form");
  await expect(form).toHaveCount(1);
  await form.locator("button[type=submit]").click();
  for (const field of [
    "name",
    "email",
    "phone",
    "service",
    "message",
    "consent",
  ])
    await expect(form.locator(`[name="${field}"]`)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  await form.locator("[name=name]").fill(`Synthetic form ${tag}`);
  await form.locator("[name=email]").fill(`${tag}@example.invalid`);
  await form.locator("[name=phone]").fill("+37360010400");
  await form.locator("[name=service]").selectOption({ index: 1 });
  await form
    .locator("[name=message]")
    .fill(`Synthetic FORM CRM integration ${tag}`);
  await form.locator("[name=consent]").check();
  const details = form.locator("details.quote-details");
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
  await form.locator("[name=company]").fill(`Synthetic company ${tag}`);
  await form.locator("[name=quantity]").fill("3");
  await form.locator("[name=dimensions]").fill("100 x 200 mm");
  let bytes = Buffer.alloc(0);
  if (attach) {
    const pdf = await PDFDocument.create();
    pdf.addPage([100, 200]);
    bytes = Buffer.from(await pdf.save());
    await form.locator("[name=files]").setInputFiles({
      name: "rejected.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("MZ synthetic"),
    });
    await expect(form.locator("[name=files]")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await form.locator("[name=files]").setInputFiles({
      name: `synthetic-${tag}.pdf`,
      mimeType: "application/pdf",
      buffer: bytes,
    });
  }
  return { form, bytes };
}
async function detail(id: string) {
  const result = await admin.get(`/api/admin/quotes/${id}`);
  expect(result.status()).toBe(200);
  const value: QuoteDetail = await result.json();
  created.set(
    id,
    value.quote.files.map((f) => f.path),
  );
  return value;
}
test.describe
  .serial("each actual public form reaches the persistent admin CRM", () => {
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
    const login = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL, "x-real-ip": "198.18.7.70" },
    });
    const response = await login.post("/api/admin/login", {
      data: { email, password },
    });
    expect(response.status()).toBe(200);
    const cookieHeader = response.headers()["set-cookie"];
    cookie = cookieHeader.match(/^artmaster_admin=([^;]+)/)![1];
    await login.dispose();
    admin = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: {
        Origin: baseURL,
        Cookie: `artmaster_admin=${cookie}`,
      },
    });
    const team = await (await admin.get("/api/admin/team")).json();
    const me = team.staff.find((s: { email: string }) => s.email === email);
    expect(me).toBeTruthy();
    staffId = me.id;
    staffEmail = me.email;
  });
  test.afterAll(async () => {
    const db = new DatabaseSync(join(directory, "artmaster.sqlite"));
    db.exec("PRAGMA foreign_keys=ON");
    for (const id of created.keys()) {
      db.prepare("DELETE FROM quote_events WHERE quote_id=?").run(id);
      db.prepare("DELETE FROM quotes WHERE id=?").run(id);
    }
    db.prepare(
      "DELETE FROM sessions WHERE admin_id IN (SELECT id FROM admins WHERE email=?)",
    ).run(email);
    db.prepare("DELETE FROM admins WHERE email=?").run(email);
    db.close();
    await admin?.dispose();
    for (const paths of created.values())
      for (const path of paths) await unlink(join(directory, "uploads", path));
  });
  for (const locale of ["ro", "ru", "en"])
    for (const path of ["", "/contact", "/solicita-oferta"]) {
      const label = path || "/home";
      test(`${locale}${label}: browser submission, PDF, duplicate, complete CRM details, status, assignment, note and privacy`, async ({
        page,
        context,
        request,
      }) => {
        const tag = `form-${nonce}-${locale}-${path.replaceAll("/", "") || "home"}`,
          before = (await find("")).totals.total;
        const { form, bytes } = await fill(page, locale, path, tag);
        const service = await form.locator("[name=service]").inputValue();
        const accepted = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/quotes") && r.request().method() === "POST",
        );
        await form.locator("button[type=submit]").click();
        const response = await accepted;
        expect(response.status()).toBe(201);
        const receipt = await response.json();
        expect(receipt.notification).toBe("not_configured");
        await expect(form.getByRole("status")).toContainText(receipt.id);
        const value = await detail(receipt.id);
        expect(value.quote).toMatchObject({
          name: `Synthetic form ${tag}`,
          email: `${tag}@example.invalid`,
          phone: "+37360010400",
          company: `Synthetic company ${tag}`,
          quantity: "3",
          dimensions: "100 x 200 mm",
          message: `Synthetic FORM CRM integration ${tag}`,
          locale,
          sourcePath: `/${locale}${path}`,
          service,
          status: "new",
        });
        expect(value.quote.files).toHaveLength(1);
        expect(value.quote.files[0].name).toBe(`synthetic-${tag}.pdf`);
        const replay = await page.evaluate(
          () =>
            (
              window as unknown as {
                __artmasterFormSnapshot: { type: string; bytes: number[] };
              }
            ).__artmasterFormSnapshot,
        );
        expect(replay.bytes.length).toBeGreaterThan(100);
        const payload = Buffer.from(replay.bytes),
          headers = { Origin: baseURL, "Content-Type": replay.type };
        const duplicate = await request.post("/api/quotes", {
          headers,
          data: payload,
        });
        expect(duplicate.status()).toBe(200);
        expect(await duplicate.json()).toMatchObject({
          id: receipt.id,
          duplicate: true,
        });
        const changed = Buffer.from(
          payload
            .toString("latin1")
            .replace(
              `Synthetic FORM CRM integration ${tag}`,
              `Changed FORM CRM integration ${tag}`,
            ),
          "latin1",
        );
        expect(
          (
            await request.post("/api/quotes", { headers, data: changed })
          ).status(),
        ).toBe(409);
        const filtered = await find(`${tag}@example.invalid`);
        expect(filtered.total).toBe(1);
        expect(filtered.quotes[0].id).toBe(receipt.id);
        expect(filtered.totals.total).toBe(before + 1);
        const filePath = `/api/admin/quotes/${receipt.id}/files/${value.quote.files[0].id}`;
        expect((await request.get(filePath)).status()).toBe(401);
        expect(
          (await request.get(`/api/admin/quotes/${receipt.id}`)).status(),
        ).toBe(401);
        const download = await admin.get(filePath);
        expect(download.status()).toBe(200);
        expect(download.headers()["cache-control"]).toContain("no-store");
        expect(await download.body()).toEqual(bytes);
        await context.addCookies([
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
        await page.goto("/admin#inbox");
        await page
          .getByLabel("Caută solicitări")
          .fill(`${tag}@example.invalid`);
        await page
          .getByRole("button", {
            name: `Deschide solicitarea de la Synthetic form ${tag}`,
            exact: true,
          })
          .click();
        const dialog = page.getByRole("dialog", {
          name: `Synthetic form ${tag}`,
          exact: true,
        });
        await expect(dialog).toContainText(
          `Synthetic FORM CRM integration ${tag}`,
        );
        await expect(dialog).toContainText(service.replaceAll("-", " "));
        await expect(
          dialog.getByRole("link", { name: `Descarcă synthetic-${tag}.pdf` }),
        ).toHaveAttribute("href", filePath);
        await dialog
          .getByLabel("Starea solicitării")
          .selectOption("in_progress");
        await expect(dialog.getByLabel("Atribuie solicitarea")).toBeEnabled();
        await dialog
          .getByLabel("Atribuie solicitarea")
          .selectOption({ label: staffEmail });
        await expect(dialog.getByLabel("Notă internă")).toBeEnabled();
        await dialog
          .getByLabel("Notă internă")
          .fill(`Synthetic internal note ${tag}`);
        await dialog.getByRole("button", { name: "Salvează nota" }).click();
        await expect(
          dialog.getByText(`Synthetic internal note ${tag}`, { exact: true }),
        ).toBeVisible();
        const saved = await detail(receipt.id);
        expect(saved.quote.status).toBe("in_progress");
        expect(saved.quote.assignedTo).toBe(staffId);
        expect(saved.events.map((e) => e.kind)).toEqual(
          expect.arrayContaining(["status", "assignment", "note"]),
        );
        expect(
          (await find(tag, "&status=in_progress&assignee=" + staffId)).total,
        ).toBe(1);
        expect((await find(tag, "&status=completed")).total).toBe(0);
      });
      test(`${locale}${label}: backend failure preserves input, creates no record and a real retry reaches CRM`, async ({
        page,
      }) => {
        const tag = `fail-${nonce}-${locale}-${path.replaceAll("/", "") || "home"}`,
          { form } = await fill(page, locale, path, tag, false);
        const database = new DatabaseSync(join(directory, "artmaster.sqlite"));
        expect(`${tag}@example.invalid`).toMatch(
          /^[a-z0-9-]+@example\.invalid$/,
        );
        database.exec(
          `CREATE TRIGGER artmaster_form_failure BEFORE INSERT ON quotes WHEN json_extract(new.data,'$.email')='${tag}@example.invalid' BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END`,
        );
        try {
          const rejected = page.waitForResponse(
            (r) =>
              r.url().endsWith("/api/quotes") &&
              r.request().method() === "POST",
          );
          await form.locator("button[type=submit]").click();
          expect((await rejected).status()).toBe(500);
          await expect(form.getByRole("alert")).toBeVisible();
          expect((await find(tag)).total).toBe(0);
          await expect(form.locator("[name=message]")).toHaveValue(
            `Synthetic FORM CRM integration ${tag}`,
          );
          await expect(form.getByRole("status")).toHaveCount(0);
        } finally {
          database.exec("DROP TRIGGER artmaster_form_failure");
          database.close();
        }
        const accepted = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/quotes") && r.request().method() === "POST",
        );
        await form.locator("button[type=submit]").click();
        const response = await accepted;
        expect(response.status()).toBe(201);
        const receipt = await response.json();
        await detail(receipt.id);
        expect((await find(tag)).total).toBe(1);
        await expect(form.getByRole("status")).toContainText(receipt.id);
      });
    }
});
