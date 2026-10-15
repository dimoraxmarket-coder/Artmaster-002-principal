import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type BrowserContext,
} from "./browser-fixtures";
import { randomUUID, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname))
  throw new Error(
    "Security browser tests require isolated loopback local storage.",
  );
const directory = resolve(process.env.ARTMASTER_DATA_DIR || ".data/e2e"),
  nonce = randomUUID().slice(0, 8);
const members = (["admin", "manager", "editor", "viewer"] as const).map(
  (kind) => ({
    kind,
    email: `security-${kind}-${nonce}@example.invalid`,
    role: kind === "manager" ? "admin" : kind,
    password: randomBytes(24).toString("base64url"),
    id: "",
    cookie: "",
  }),
);
const admin = members[0],
  manager = members[1],
  editor = members[2],
  viewer = members[3];
let administrator: APIRequestContext,
  editorClient: APIRequestContext,
  managerClient: APIRequestContext,
  otherAdminCookie: string;
function db() {
  const value = new DatabaseSync(join(directory, "artmaster.sqlite"));
  value.exec("PRAGMA foreign_keys=ON");
  return value;
}
async function signIn(member: (typeof members)[number]) {
  const bootstrap = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: baseURL, "x-real-ip": "198.18.5.50" },
  });
  const result = await bootstrap.post("/api/admin/login", {
    data: { email: member.email, password: member.password },
  });
  expect(result.status()).toBe(200);
  expect(result.headers()["set-cookie"]).toMatch(/HttpOnly.*SameSite=Strict/);
  const headers = result.headers();
  const cookie = headers["set-cookie"].match(/^artmaster_admin=([^;]+)/)![1];
  await bootstrap.dispose();
  const api = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: {
      Origin: baseURL,
      "x-real-ip": "198.18.5.50",
      Cookie: `artmaster_admin=${cookie}`,
    },
  });
  return { cookie, api };
}
async function session(context: BrowserContext, cookie: string) {
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
}
async function capture(page: import("@playwright/test").Page, name: string) {
  if (process.env.ARTMASTER_ADMIN_SCREENSHOTS === "1") {
    await mkdir("docs/screenshots/admin-phase5", { recursive: true });
    await page.evaluate(() =>
      window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
    );
    await page.screenshot({
      path: `docs/screenshots/admin-phase5/${name}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
}

test.describe.serial("real Security Center and team management", () => {
  test.beforeAll(async () => {
    const ready = await playwrightRequest.newContext({ baseURL });
    expect((await ready.get("/api/quote-token")).status()).toBe(200);
    await ready.dispose();
    for (const member of members) {
      const result = spawnSync(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", "scripts/create-admin.ts"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            ARTMASTER_STORAGE: "local",
            ARTMASTER_DATA_DIR: directory,
            ARTMASTER_ALLOW_LOCAL_PRODUCTION: "true",
            ADMIN_EMAIL: member.email,
            ADMIN_ROLE: member.role,
            ADMIN_PASSWORD: "",
          },
          input: member.password + "\n",
          encoding: "utf8",
        },
      );
      expect(result.status).toBe(0);
      const login = await signIn(member);
      member.cookie = login.cookie;
      if (member.kind === "admin") administrator = login.api;
      else if (member.kind === "manager") managerClient = login.api;
      else if (member.kind === "editor") editorClient = login.api;
      else await login.api.dispose();
    }
    const database = db();
    for (const member of members)
      member.id = (
        database
          .prepare("SELECT id FROM admins WHERE email=?")
          .get(member.email) as { id: string }
      ).id;
    database.close();
    const other = await signIn(admin);
    otherAdminCookie = other.cookie;
    await other.api.dispose();
  });
  test.afterAll(async () => {
    await administrator?.dispose();
    await editorClient?.dispose();
    await managerClient?.dispose();
    const database = db();
    for (const member of members)
      database.prepare("DELETE FROM sessions WHERE admin_id=?").run(member.id);
    database.close(); /* Keep append-only security evidence in the isolated synthetic database. */
  });

  test("actual sessions show times, protect current access and revoke only the selected other session", async ({
    page,
    request,
  }) => {
    await session(page.context(), admin.cookie);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto("/admin#security");
    const section = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Sesiunile tale active",
        exact: true,
      }),
    });
    await expect(section.getByRole("article")).toHaveCount(2);
    await expect(
      section.getByRole("button", { name: "Sesiune curentă", exact: true }),
    ).toBeDisabled();
    await expect(
      section.getByText("Ultima activitate", { exact: true }),
    ).toHaveCount(2);
    expect(await page.content()).not.toContain(admin.cookie);
    expect(await page.content()).not.toContain(otherAdminCookie);
    await capture(page, "security-sessions-desktop");
    await section
      .getByRole("button", { name: "Revocă sesiunea", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Confirmă revocarea",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await capture(page, "revoke-session-confirmation");
    await dialog
      .getByRole("button", { name: "Confirmă revocarea", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(section.getByRole("article")).toHaveCount(1);
    await expect(
      section.getByRole("status").filter({ hasText: "1 sesiuni revocate" }),
    ).toBeVisible();
    expect(
      (
        await request.get("/api/admin/content", {
          headers: { Cookie: `artmaster_admin=${otherAdminCookie}` },
        })
      ).status(),
    ).toBe(401);
    expect((await administrator.get("/api/admin/content")).status()).toBe(200);
  });

  test("team role change revokes old sessions; stale edits preserve the newer role", async ({
    page,
  }) => {
    await session(page.context(), admin.cookie);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin#team");
    await expect(
      page.getByRole("row").filter({ hasText: admin.email }),
    ).toBeVisible();
    await capture(page, "team-directory-all-desktop");
    await page.getByLabel("Caută în echipă").fill(editor.email);
    const row = page.getByRole("row").filter({ hasText: editor.email });
    await expect(row).toBeVisible();
    await capture(page, "team-directory-desktop");
    await row
      .getByRole("button", { name: "Gestionează accesul", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Gestionează accesul",
      exact: true,
    });
    await dialog
      .getByLabel("Rol administrativ", { exact: true })
      .selectOption("viewer");
    await dialog
      .getByLabel("Confirm modificarea accesului și revocarea sesiunilor")
      .check();
    await expect(
      dialog.getByRole("button", { name: "Confirmă modificarea", exact: true }),
    ).toBeEnabled();
    await capture(page, "team-role-confirmation");
    await page.setViewportSize({ width: 390, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    const modalAccessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      modalAccessibility.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      ),
    ).toEqual([]);
    await capture(page, "team-role-confirmation-mobile");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await dialog
      .getByRole("button", { name: "Confirmă modificarea", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(row).toContainText("Vizualizare");
    expect((await editorClient.get("/api/admin/content")).status()).toBe(401);
    await row
      .getByRole("button", { name: "Gestionează accesul", exact: true })
      .click();
    const changed = await administrator.patch(
      `/api/admin/security/accounts/${editor.id}`,
      {
        data: {
          role: "editor",
          enabled: true,
          expectedVersion: 1,
          confirm: true,
        },
      },
    );
    expect(changed.status()).toBe(200);
    await dialog
      .getByLabel("Rol administrativ", { exact: true })
      .selectOption("admin");
    await dialog
      .getByLabel("Confirm modificarea accesului și revocarea sesiunilor")
      .check();
    await dialog
      .getByRole("button", { name: "Confirmă modificarea", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "modificate între timp",
    );
    const database = db();
    expect(
      (
        database
          .prepare("SELECT role FROM admins WHERE id=?")
          .get(editor.id) as { role: string }
      ).role,
    ).toBe("editor");
    database.close();
    await dialog.getByRole("button", { name: "Renunță", exact: true }).click();
  });

  test("administrator disabling revokes account sessions and preserves the last enabled administrator", async ({
    page,
  }) => {
    await session(page.context(), admin.cookie);
    await page.goto("/admin#team");
    await page.getByLabel("Caută în echipă").fill(manager.email);
    const row = page.getByRole("row").filter({ hasText: manager.email });
    await row.getByRole("button", { name: "Sesiuni", exact: true }).click();
    const sessions = page.getByRole("dialog", {
      name: `Sesiuni · ${manager.email}`,
      exact: true,
    });
    await expect(sessions.getByRole("article")).toHaveCount(1);
    await sessions
      .getByRole("button", { name: "Închide dialogul", exact: true })
      .click();
    await row
      .getByRole("button", { name: "Gestionează accesul", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Gestionează accesul",
      exact: true,
    });
    await dialog.getByLabel("Acces activ la cabinet").uncheck();
    await dialog
      .getByLabel("Confirm modificarea accesului și revocarea sesiunilor")
      .check();
    await dialog
      .getByRole("button", { name: "Confirmă modificarea", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(row).toContainText("Suspendat");
    expect((await managerClient.get("/api/admin/content")).status()).toBe(401);
    const deny = await administrator.patch(
      `/api/admin/security/accounts/${admin.id}`,
      {
        data: {
          role: "viewer",
          enabled: true,
          expectedVersion: 0,
          confirm: true,
        },
      },
    );
    expect(deny.status()).toBe(409);
    expect((await deny.json()).code).toBe("last_admin");
    await page.getByLabel("Caută în echipă").fill(admin.email);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: admin.email })
        .getByRole("button", { name: "Gestionează accesul", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Invită un coleg", exact: true }),
    ).toBeDisabled();
  });

  test("real audit history supports pagination, filters, safe context and mobile layouts", async ({
    page,
  }) => {
    const failed = await playwrightRequest.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL, "x-real-ip": "198.18.5.51" },
    });
    for (let i = 0; i < 4; i++)
      expect(
        (
          await failed.post("/api/admin/login", {
            data: {
              email: `unknown-${nonce}-${i}@example.invalid`,
              password: "synthetic-invalid-password",
            },
          })
        ).status(),
      ).toBe(401);
    await failed.dispose();
    await session(page.context(), admin.cookie);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto("/admin#security");
    const section = page.locator("section").filter({
      has: page.getByRole("heading", {
        name: "Jurnal de securitate",
        exact: true,
      }),
    });
    await expect(section.getByRole("table")).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Înainte", exact: true }),
    ).toBeEnabled();
    await section.getByRole("button", { name: "Înainte", exact: true }).click();
    await expect(section.getByText(/^2 \/ /)).toBeVisible();
    await section.getByRole("button", { name: "Înapoi", exact: true }).click();
    await section
      .getByLabel("Filtrează evenimentele de securitate")
      .selectOption("security.team.change");
    await expect(
      section
        .getByRole("cell", {
          name: "Accesul unui coleg modificat",
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await expect(
      section.getByRole("cell", {
        name: "Autentificare confirmată",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(section).toContainText(editor.email);
    await capture(page, "security-audit-desktop");
    await section.getByLabel("Evenimente de la").fill("2099-01-01");
    await expect(
      section.getByRole("heading", {
        name: "Niciun eveniment în acest interval",
      }),
    ).toBeVisible();
    await section.getByLabel("Evenimente de la").fill("");
    await expect(section.getByRole("table")).toBeVisible();
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      accessibility.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      ),
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await capture(page, "security-center-mobile");
  });

  test("read-only users see only their sessions; stale verification requires actual reauthentication", async ({
    page,
  }) => {
    await session(page.context(), viewer.cookie);
    await page.goto("/admin#security");
    await expect(
      page.getByText(
        "Accesul la istoricul echipei este rezervat administratorilor.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await page
      .getByText("Vezi procedura de recuperare", { exact: true })
      .click();
    await expect(
      page.getByText("Parola sau un mesaj e-mail nu sunt suficiente.", {
        exact: false,
      }),
    ).toBeVisible();
    await page.goto("/admin#team");
    await page.getByLabel("Caută în echipă").fill(viewer.email);
    await expect(
      page
        .getByRole("row")
        .filter({ hasText: viewer.email })
        .getByRole("button", { name: "Gestionează accesul", exact: true }),
    ).toBeDisabled();
    const other = await signIn(admin);
    await other.api.dispose();
    const database = db();
    database
      .prepare("UPDATE sessions SET verified_at=? WHERE admin_id=?")
      .run(Date.now() - 6 * 60000, admin.id);
    database.close();
    await session(page.context(), admin.cookie);
    await page.goto("/admin#security");
    await expect(
      page.getByRole("button", {
        name: "Revocă celelalte sesiuni",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Reautentifică-te", exact: true }),
    ).toBeVisible();
    const deny = await administrator.delete("/api/admin/security/sessions", {
      data: { allOthers: true, confirm: true },
    });
    expect(deny.status()).toBe(403);
    expect((await deny.json()).code).toBe("reauth_required");
    await page
      .getByRole("button", { name: "Reautentifică-te", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bine ai revenit.", exact: true }),
    ).toBeVisible();
    expect((await administrator.get("/api/admin/content")).status()).toBe(401);
  });
});
