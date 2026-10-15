import type {
  ManagedSession,
  SecurityAccount,
  AuditEvent,
} from "../src/lib/server/security-types";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  createLocalAdmin,
  loginAdmin,
  actorForSession,
  logoutAdmin,
  requireSecurityContext,
} from "../src/lib/server/auth";
import {
  localDatabase,
  hashSession,
  LocalStorage,
} from "../src/lib/server/local";
import { changeAccount, listSessions } from "../src/lib/server/security";
import {
  GET as sessions,
  DELETE as revoke,
} from "../src/app/api/admin/security/sessions/route";
import { GET as accounts } from "../src/app/api/admin/security/accounts/route";
import { PATCH as change } from "../src/app/api/admin/security/accounts/[id]/route";
import { GET as audit } from "../src/app/api/admin/security/audit/route";
import { GET as mfa } from "../src/app/api/admin/security/mfa/route";
import { POST as login } from "../src/app/api/admin/login/route";
import { GET as content } from "../src/app/api/admin/content/route";
const directory = mkdtempSync(join(tmpdir(), "artmaster-security-center-"));
Object.assign(process.env, {
  ARTMASTER_STORAGE: "local",
  ARTMASTER_DATA_DIR: directory,
  SITE_URL: "http://localhost:3000",
});
after(() => rm(directory, { recursive: true, force: true }));
const origin = "http://localhost:3000",
  password = "synthetic-security-center-password";
const users = (["admin", "editor", "viewer"] as const).map((role) => ({
  id: createLocalAdmin(`${role}@example.invalid`, password, role),
  role,
  cookies: [] as string[],
}));
const admin = users[0],
  editor = users[1],
  viewer = users[2];
function request(
  cookie?: string,
  method = "GET",
  body?: unknown,
  path = "/api/admin/security",
) {
  return new Request(origin + path, {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: `artmaster_admin=${cookie}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
async function signIn(user: (typeof users)[number]) {
  const result = await loginAdmin(`${user.role}@example.invalid`, password);
  user.cookies.push(result.cookie);
  return result.cookie;
}
async function update(
  target: (typeof users)[number],
  role: "viewer" | "editor" | "admin",
  enabled = true,
  expectedVersion?: number,
  cookie = admin.cookies[0],
) {
  const version =
    expectedVersion ??
    (
      localDatabase()
        .prepare("SELECT version FROM admins WHERE id=?")
        .get(target.id) as { version: number }
    ).version;
  return change(
    request(cookie, "PATCH", {
      role,
      enabled,
      expectedVersion: version,
      confirm: true,
    }),
    ctx(target.id),
  );
}

test("actual session metadata uses separate non-authenticating references and keeps hashes/tokens private", async () => {
  for (const user of users) {
    await signIn(user);
    await signIn(user);
  }
  for (const response of await Promise.all([
    sessions(request()),
    accounts(request()),
    audit(request()),
    mfa(request()),
  ]))
    assert.equal(response.status, 401);
  const result = await sessions(request(admin.cookies[0]));
  assert.equal(result.status, 200);
  assert.match(result.headers.get("cache-control")!, /private.*no-store/);
  const value = await result.json();
  assert.equal(value.total, 2);
  assert.equal(
    value.sessions.filter((s: ManagedSession) => s.current).length,
    1,
  );
  assert.ok(Date.parse(value.freshUntil) > Date.now());
  for (const row of value.sessions) {
    assert.deepEqual(Object.keys(row).sort(), [
      "absoluteExpiresAt",
      "createdAt",
      "current",
      "expiresAt",
      "lastActivityAt",
      "reference",
    ]);
    assert.ok(Date.parse(row.expiresAt) <= Date.parse(row.absoluteExpiresAt));
    assert.ok(Date.parse(row.createdAt) <= Date.parse(row.lastActivityAt));
  }
  const text = JSON.stringify(value);
  for (const cookie of admin.cookies) {
    assert.equal(text.includes(cookie), false);
    assert.equal(text.includes(cookie.split(".")[0]), false);
    assert.equal(text.includes(hashSession(cookie.split(".")[0])), false);
  }
  assert.equal(
    await actorForSession(value.sessions[0].reference),
    null,
    "management reference cannot authenticate",
  );
  const status = await (await mfa(request(admin.cookies[0]))).json();
  assert.deepEqual(
    {
      mode: status.mode,
      aal: status.aal,
      verifiedTotpFactors: status.verifiedTotpFactors,
    },
    { mode: "local", aal: "aal1", verifiedTotpFactors: null },
  );
  assert.equal(
    (
      await sessions(
        request(
          viewer.cookies[0],
          "GET",
          undefined,
          `/api/admin/security/sessions?owner=${admin.id}`,
        ),
      )
    ).status,
    403,
  );
  assert.equal((await audit(request(viewer.cookies[0]))).status, 403);
  assert.equal((await audit(request(editor.cookies[0]))).status, 403);
});

test("users revoke only their other sessions; administrators may revoke managed accounts", async () => {
  const own = await (await sessions(request(viewer.cookies[0]))).json(),
    other = own.sessions.find((s: ManagedSession) => !s.current),
    current = own.sessions.find((s: ManagedSession) => s.current);
  assert.equal(
    (
      await revoke(
        request(viewer.cookies[0], "DELETE", {
          reference: current.reference,
          confirm: true,
        }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await revoke(
        request(viewer.cookies[0], "DELETE", {
          owner: admin.id,
          allOthers: true,
          confirm: true,
        }),
      )
    ).status,
    403,
  );
  const forbiddenReference = (
    await (await sessions(request(admin.cookies[0]))).json()
  ).sessions.find((s: ManagedSession) => !s.current).reference;
  assert.equal(
    (
      await revoke(
        request(viewer.cookies[0], "DELETE", {
          reference: forbiddenReference,
          confirm: true,
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await revoke(
        request(viewer.cookies[0], "DELETE", {
          reference: other.reference,
          confirm: true,
        }),
      )
    ).status,
    200,
  );
  assert.equal(await actorForSession(viewer.cookies[1]), null);
  assert.ok(await actorForSession(viewer.cookies[0]));
  const managed = await revoke(
    request(admin.cookies[0], "DELETE", {
      owner: editor.id,
      allOthers: true,
      confirm: true,
    }),
  );
  assert.equal(managed.status, 200);
  assert.equal((await managed.json()).revoked, 2);
  assert.equal(await actorForSession(editor.cookies[0]), null);
  assert.equal(await actorForSession(editor.cookies[1]), null);
  assert.equal(
    (await revoke(request(admin.cookies[0], "DELETE", { allOthers: true })))
      .status,
    400,
  );
});

test("team changes block escalation, self changes and removal of the last enabled administrator", async () => {
  assert.equal(
    (await update(admin, "viewer")).status,
    409,
    "last enabled admin cannot be demoted",
  );
  assert.equal((await update(admin, "admin", false)).status, 409);
  assert.equal(
    (await update(viewer, "admin", true, undefined, viewer.cookies[0])).status,
    403,
  );
  await signIn(editor);
  assert.equal(
    (await update(viewer, "admin", true, undefined, editor.cookies.at(-1)!))
      .status,
    403,
  );
  assert.equal((await update(editor, "admin")).status, 200);
  assert.equal(await actorForSession(editor.cookies.at(-1)), null);
  assert.equal(
    (await update(admin, "viewer")).status,
    403,
    "self demotion remains forbidden with two admins",
  );
  assert.equal(
    (await update(editor, "viewer", true, 0)).status,
    409,
    "stale version cannot overwrite",
  );
  const row = localDatabase()
    .prepare("SELECT role,version FROM admins WHERE id=?")
    .get(editor.id) as { role: string; version: number };
  assert.deepEqual({ ...row }, { role: "admin", version: 1 });
  assert.equal((await update(editor, "editor")).status, 200);
  assert.equal((await update(viewer, "viewer", false)).status, 200);
  assert.equal(await actorForSession(viewer.cookies[0]), null);
  await assert.rejects(() => loginAdmin("viewer@example.invalid", password));
  assert.equal((await update(viewer, "viewer", true)).status, 200);
  assert.equal(
    await actorForSession(viewer.cookies[0]),
    null,
    "enable must not restore old cookies",
  );
  await signIn(viewer);
  assert.ok(await actorForSession(viewer.cookies.at(-1)));
  const list = await (await accounts(request(admin.cookies[0]))).json();
  assert.equal(list.enabledAdmins, 1);
  assert.equal(
    list.accounts.find((a: SecurityAccount) => a.id === viewer.id).version,
    2,
  );
});

test("expired fresh verification blocks sensitive actions without weakening normal session authorization", async () => {
  const db = localDatabase(),
    cookie = admin.cookies[0],
    hash = hashSession(cookie.split(".")[0]);
  db.prepare("UPDATE sessions SET verified_at=? WHERE hash=?").run(
    Date.now() - 5 * 60000 - 1,
    hash,
  );
  const result = await revoke(
    request(cookie, "DELETE", { allOthers: true, confirm: true }),
  );
  assert.equal(result.status, 403);
  assert.equal((await result.json()).code, "reauth_required");
  assert.equal((await update(editor, "viewer")).status, 403);
  assert.equal((await sessions(request(cookie))).status, 200);
  assert.equal((await content(request(cookie))).status, 200);
  db.prepare("UPDATE sessions SET verified_at=? WHERE hash=?").run(
    Date.now() + 60000,
    hash,
  );
  assert.equal(
    (
      await revoke(
        request(cookie, "DELETE", { allOthers: true, confirm: true }),
      )
    ).status,
    403,
  );
  const fresh = await signIn(admin);
  assert.equal(
    (await revoke(request(fresh, "DELETE", { allOthers: true, confirm: true })))
      .status,
    200,
  );
  assert.equal(await actorForSession(cookie), null);
  admin.cookies[0] = fresh;
});

test("permissions and session generation are re-read inside a sensitive transaction", async () => {
  await update(editor, "admin");
  const editorCookie = await signIn(editor),
    captured = await requireSecurityContext(request(editorCookie));
  await update(editor, "editor");
  await assert.rejects(
    () =>
      changeAccount(captured, viewer.id, {
        role: "admin",
        enabled: true,
        expectedVersion: 2,
        confirm: true,
      }),
    (error) => error instanceof Error && error.message === "unauthorized",
  );
  const valid = await requireSecurityContext(request(admin.cookies[0]));
  await assert.rejects(() =>
    listSessions(
      { ...valid, hash: hashSession(randomUUID()) },
      { page: 1, pageSize: 10 },
    ),
  );
  const secondId = createLocalAdmin("second-admin@example.invalid", password),
    secondCookie = (await loginAdmin("second-admin@example.invalid", password))
      .cookie,
    first = await requireSecurityContext(request(admin.cookies[0])),
    second = await requireSecurityContext(request(secondCookie));
  const results = await Promise.allSettled([
    changeAccount(first, secondId, {
      role: "viewer",
      enabled: true,
      expectedVersion: 0,
      confirm: true,
    }),
    changeAccount(second, admin.id, {
      role: "viewer",
      enabled: true,
      expectedVersion: 0,
      confirm: true,
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (
      localDatabase()
        .prepare(
          "SELECT count(*) n FROM admins WHERE enabled=1 AND role='admin'",
        )
        .get() as { n: number }
    ).n,
    1,
  );
});

test("security audit is paginated, filtered, redacted and append-only", async () => {
  const db = localDatabase(),
    store = new LocalStorage(),
    actor = (await actorForSession(admin.cookies[0]))!;
  for (let i = 0; i < 23; i++)
    await store.audit(actor, "admin.login.failed", "session");
  await store.audit(
    actor,
    "quote.status",
    "private-customer-message-and-filename",
  );
  db.prepare(
    "INSERT INTO audit(actor,action,target,time,context) VALUES(?,?,?,?,?)",
  ).run(
    admin.id,
    "admin.login",
    "secret-cookie-value",
    new Date().toISOString(),
    JSON.stringify({
      token: "secret-token",
      password: "secret-password",
      scope: "secret-seed",
      role: "editor",
      revoked: 2,
    }),
  );
  const response = await audit(
    request(
      admin.cookies[0],
      "GET",
      undefined,
      "/api/admin/security/audit?action=admin.login.failed&pageSize=10&page=2",
    ),
  );
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.events.length, 10);
  assert.ok(value.total >= 23);
  assert.equal(
    value.events.every((e: AuditEvent) => e.action === "admin.login.failed"),
    true,
  );
  const all = await (
      await audit(
        request(
          admin.cookies[0],
          "GET",
          undefined,
          "/api/admin/security/audit?pageSize=50",
        ),
      )
    ).json(),
    text = JSON.stringify(all);
  for (const secret of [
    "secret-cookie-value",
    "secret-token",
    "secret-password",
    "secret-seed",
    "private-customer-message-and-filename",
  ])
    assert.equal(text.includes(secret), false);
  assert.equal(all.events[0].target, "session");
  assert.deepEqual(all.events[0].context, { role: "editor", revoked: 2 });
  assert.equal(
    (
      await audit(
        request(
          admin.cookies[0],
          "GET",
          undefined,
          "/api/admin/security/audit?action=unknown",
        ),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await audit(
        request(
          admin.cookies[0],
          "GET",
          undefined,
          "/api/admin/security/audit?from=2026-12-01T00%3A00%3A00Z&to=2026-01-01T00%3A00%3A00Z",
        ),
      )
    ).status,
    400,
  );
  assert.throws(
    () => db.prepare("UPDATE audit SET action='tampered' WHERE id=1").run(),
    /append only/,
  );
  assert.throws(
    () => db.prepare("DELETE FROM audit WHERE id=1").run(),
    /append only/,
  );
});

test("CSRF, revoked and idle/absolute-expired sessions fail closed on every new endpoint", async () => {
  const cookie = admin.cookies[0];
  const forged = new Request(origin + "/api/admin/security/sessions", {
    method: "DELETE",
    headers: {
      Origin: "https://evil.invalid",
      Cookie: `artmaster_admin=${cookie}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ allOthers: true, confirm: true }),
  });
  assert.equal((await revoke(forged)).status, 403);
  for (const kind of ["revoked", "idle", "absolute"]) {
    const session = await signIn(admin),
      hash = hashSession(session.split(".")[0]);
    if (kind === "revoked") await logoutAdmin(session);
    else
      localDatabase()
        .prepare(
          `UPDATE sessions SET ${kind === "idle" ? "last_seen_at" : "created_at"}=? WHERE hash=?`,
        )
        .run(
          Date.now() - (kind === "idle" ? 15 * 60000 : 8 * 3600000) - 1,
          hash,
        );
    for (const result of await Promise.all([
      sessions(request(session)),
      accounts(request(session)),
      audit(request(session)),
      mfa(request(session)),
      revoke(request(session, "DELETE", { allOthers: true, confirm: true })),
      change(
        request(session, "PATCH", {
          role: "admin",
          enabled: true,
          expectedVersion: 2,
          confirm: true,
        }),
        ctx(viewer.id),
      ),
    ]))
      assert.equal(result.status, 401);
  }
});

test("failed login audit contains no supplied identity, password or browser context", async () => {
  const cookie = await signIn(admin),
    sentinel = "DO-NOT-LOG-this-password";
  assert.equal(
    (
      await login(
        request(undefined, "POST", {
          email: "unknown-person@example.invalid",
          password: sentinel,
        }),
      )
    ).status,
    401,
  );
  const result = await audit(
    request(
      cookie,
      "GET",
      undefined,
      "/api/admin/security/audit?action=admin.login.failed",
    ),
  );
  const text = JSON.stringify(await result.json());
  assert.equal(text.includes(sentinel), false);
  assert.equal(text.includes("unknown-person@example.invalid"), false);
});
