import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  createLocalAdmin,
  loginAdmin,
  logoutAdmin,
} from "../src/lib/server/auth";
import { LocalStorage, localDatabase } from "../src/lib/server/local";
import { defaultContent } from "../src/lib/content/defaults";
import { GET as list } from "../src/app/api/admin/quotes/route";
import {
  GET as detail,
  PATCH as change,
} from "../src/app/api/admin/quotes/[id]/route";
import { GET as team } from "../src/app/api/admin/team/route";
import {
  POST as upload,
  GET as inventory,
} from "../src/app/api/admin/media/route";
import {
  DELETE as archive,
  GET as preview,
} from "../src/app/api/admin/media/[name]/route";
import { POST as replace } from "../src/app/api/admin/media/replace/route";
import { GET as publicImage } from "../src/app/api/media/[name]/route";
import type { Quote } from "../src/lib/server/types";
import { BackendError } from "../src/lib/server/config";

const directory = mkdtempSync(join(tmpdir(), "artmaster-workflows-"));
Object.assign(process.env, {
  ARTMASTER_STORAGE: "local",
  ARTMASTER_DATA_DIR: directory,
  SITE_URL: "http://localhost:3000",
});
after(() => rm(directory, { recursive: true, force: true }));
const store = new LocalStorage(),
  origin = "http://localhost:3000";
const accounts = (["admin", "editor", "viewer"] as const).map((role) => ({
  id: createLocalAdmin(
    `${role}@example.invalid`,
    "synthetic-workflow-password",
    role,
  ),
  email: `${role}@example.invalid`,
  role,
  aal: "aal1" as const,
  cookie: "",
}));
const admin = accounts[0];
function request(
  path: string,
  cookie?: string,
  method = "GET",
  body?: unknown,
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
function context(id: string) {
  return { params: Promise.resolve({ id }) };
}
function imageContext(url: string) {
  return { params: Promise.resolve({ name: url.split("/").pop()! }) };
}
function sample(index: number): Quote {
  return {
    id: randomUUID(),
    idempotencyKey: randomUUID(),
    payloadHash: "synthetic",
    locale: "ro",
    service: defaultContent.services[0].slug,
    name: `Synthetic request ${index}`,
    email: `request${index}@example.invalid`,
    phone: "+37360010400",
    message:
      index === 212 ? "КЛИЕНТ literal %_ search" : "Synthetic request only",
    createdAt: new Date(Date.now() + index).toISOString(),
    status: index % 2 ? "new" : "completed",
    files: [],
    notification: "not_configured",
  };
}
let target: Quote;
test("CRM queries every record, paginates deterministically and counts independently of filters", async () => {
  for (const account of accounts)
    account.cookie = (
      await loginAdmin(account.email, "synthetic-workflow-password")
    ).cookie;
  for (let i = 0; i < 213; i++) {
    const quote = sample(i);
    await store.createQuote(quote, []);
    if (i === 212) target = quote;
  }
  assert.equal((await list(request("/api/admin/quotes"))).status, 401);
  assert.equal(
    (await list(request("/api/admin/quotes?pageSize=100000", admin.cookie)))
      .status,
    400,
  );
  assert.equal(
    (await list(request("/api/admin/quotes?status=unknown", admin.cookie)))
      .status,
    400,
  );
  const first = await (
    await list(request("/api/admin/quotes?pageSize=8", admin.cookie))
  ).json();
  const second = await (
    await list(request("/api/admin/quotes?pageSize=8&page=2", admin.cookie))
  ).json();
  assert.equal(first.quotes.length, 8);
  assert.equal(first.total, 213);
  assert.equal(first.totals.total, 213);
  assert.equal(first.totals.new, 106);
  assert.equal(first.totals.completed, 107);
  assert.equal(
    new Set([...first.quotes, ...second.quotes].map((q) => q.id)).size,
    16,
  );
  assert.equal("payloadHash" in first.quotes[0], false);
  assert.equal("idempotencyKey" in first.quotes[0], false);
  const last = await (
    await list(request("/api/admin/quotes?page=27&pageSize=8", admin.cookie))
  ).json();
  assert.equal(last.quotes.length, 5);
  for (const q of ["клиент", "%_"]) {
    const found = await (
      await list(
        request(`/api/admin/quotes?q=${encodeURIComponent(q)}`, admin.cookie),
      )
    ).json();
    assert.equal(found.total, 1);
    assert.equal(found.quotes[0].id, target.id);
    assert.equal(found.totals.total, 213);
  }
  const filtered = await (
    await list(request("/api/admin/quotes?status=new", admin.cookie))
  ).json();
  assert.equal(filtered.total, 106);
});

test("CRM detail, notes, authorized assignment and status updates are persistent, atomic and versioned", async () => {
  const url = `/api/admin/quotes/${target.id}`,
    editor = accounts[1],
    viewer = accounts[2];
  assert.equal((await detail(request(url), context(target.id))).status, 401);
  const directory = await (
    await team(request("/api/admin/team", viewer.cookie))
  ).json();
  assert.equal(directory.staff.length, 3);
  assert.deepEqual(Object.keys(directory.staff[0]).sort(), [
    "email",
    "id",
    "role",
  ]);
  for (const input of [
    { note: "forbidden", expectedVersion: 0 },
    { assignedTo: editor.id },
    { status: "archived" },
  ])
    assert.equal(
      (
        await change(
          request(url, viewer.cookie, "PATCH", input),
          context(target.id),
        )
      ).status,
      403,
    );
  assert.equal(
    (
      await change(
        request(url, editor.cookie, "PATCH", { note: "no version" }),
        context(target.id),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await change(
        request(url, editor.cookie, "PATCH", {
          status: "in_progress",
          assignedTo: viewer.id,
          expectedVersion: 0,
        }),
        context(target.id),
      )
    ).status,
    400,
  );
  let value = await (
    await detail(request(url, admin.cookie), context(target.id))
  ).json();
  assert.equal(value.quote.version, 0);
  assert.equal(value.events.length, 0);
  assert.equal(value.quote.status, target.status);
  const changed = await change(
    request(url, editor.cookie, "PATCH", {
      status: "in_progress",
      assignedTo: editor.id,
      note: "Internal synthetic note",
      expectedVersion: 0,
    }),
    context(target.id),
  );
  assert.equal(changed.status, 200);
  value = await changed.json();
  assert.equal(value.quote.version, 1);
  assert.equal(value.quote.assignedTo, editor.id);
  assert.equal(value.events.length, 3);
  const stale = await change(
    request(url, admin.cookie, "PATCH", {
      status: "archived",
      note: "must not be saved",
      expectedVersion: 0,
    }),
    context(target.id),
  );
  assert.equal(stale.status, 409);
  assert.equal(
    (
      await (
        await detail(request(url, admin.cookie), context(target.id))
      ).json()
    ).events.length,
    3,
  );
  assert.equal((await store.getQuote(target.id))!.message, target.message);
  assert.equal((await store.getQuote(target.id))!.status, "in_progress");
  const assigned = await (
    await list(request(`/api/admin/quotes?assignee=${editor.id}`, admin.cookie))
  ).json();
  assert.equal(assigned.total, 1);
  assert.equal(assigned.quotes[0].id, target.id);
  // A concurrent stale note cannot silently overwrite another administrator.
  const writes = await Promise.all([
    change(
      request(url, admin.cookie, "PATCH", { note: "one", expectedVersion: 1 }),
      context(target.id),
    ),
    change(
      request(url, editor.cookie, "PATCH", { note: "two", expectedVersion: 1 }),
      context(target.id),
    ),
  ]);
  assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
  for (let i = 0; i < 52; i++)
    await store.updateQuote(target.id, "in_progress", admin);
  const history = await (
    await detail(request(url, viewer.cookie), context(target.id))
  ).json();
  assert.equal(history.events.length, 50);
  assert.equal(history.hasMore, true);
  const older = await (
    await detail(
      request(`${url}?before=${history.events.at(-1).id}`, viewer.cookie),
      context(target.id),
    )
  ).json();
  assert.equal(older.events.length, 6);
  assert.equal(older.hasMore, false);
  assert.equal(
    new Set([...history.events, ...older.events].map((e) => e.id)).size,
    56,
  );
  const forged = new Request(origin + url, {
    method: "PATCH",
    headers: {
      Origin: "https://untrusted.invalid",
      Cookie: `artmaster_admin=${admin.cookie}`,
      "Content-Type": "application/json",
    },
    body: '{"status":"new"}',
  });
  assert.equal((await change(forged, context(target.id))).status, 403);
});

async function uploadImage(name: string) {
  const png = await sharp({
    create: { width: 10, height: 8, channels: 3, background: "#efca26" },
  })
    .withMetadata()
    .png()
    .toBuffer();
  const form = new FormData();
  form.set(
    "file",
    new File([Uint8Array.from(png)], name, { type: "image/png" }),
  );
  const result = await upload(
    new Request(origin + "/api/admin/media", {
      method: "POST",
      headers: { Origin: origin, Cookie: `artmaster_admin=${admin.cookie}` },
      body: form,
    }),
  );
  assert.equal(result.status, 201);
  return (await result.json()).url as string;
}

test("media inventory persists uploads, adopts old originals and preserves draft/public confidentiality", async () => {
  const first = await uploadImage("first-synthetic.png"),
    second = await uploadImage("second-synthetic.png");
  const firstBytes = await readFile(
    join(directory, "media", first.split("/").pop()!),
  );
  const oldName = `${randomUUID()}.webp`;
  await writeFile(join(directory, "media", oldName), firstBytes, {
    mode: 0o600,
  });
  let assets = await (
    await inventory(request("/api/admin/media?q=synthetic", admin.cookie))
  ).json();
  assert.equal(assets.total, 2);
  assert.equal(assets.assets[0].uses.length, 0);
  assert.equal(assets.assets[0].managed, true);
  assert.equal(assets.assets[0].replaceable, false);
  assert.ok(
    (
      await (
        await inventory(request(`/api/admin/media?q=${oldName}`, admin.cookie))
      ).json()
    ).assets.length === 1,
  );
  assert.equal((await inventory(request("/api/admin/media"))).status, 401);
  assert.equal(
    (await publicImage(request(first), imageContext(first))).status,
    404,
  );
  const content = structuredClone(defaultContent);
  content.services[0].image = first;
  let version = await store.saveContent(content, true, admin, 0);
  assert.equal(
    (await publicImage(request(first), imageContext(first))).status,
    200,
  );
  const removing = () =>
    archive(
      request(first, admin.cookie, "DELETE", { confirm: true }),
      imageContext(first),
    );
  assert.equal((await removing()).status, 409);
  const replaceBody = {
    url: first,
    replacementUrl: second,
    expectedVersion: version,
  };
  assert.equal(
    (
      await replace(
        request(
          "/api/admin/media/replace",
          accounts[2].cookie,
          "POST",
          replaceBody,
        ),
      )
    ).status,
    403,
  );
  const replaced = await replace(
    request(
      "/api/admin/media/replace",
      accounts[1].cookie,
      "POST",
      replaceBody,
    ),
  );
  assert.equal(replaced.status, 200);
  version = (await replaced.json()).version;
  assert.equal(
    (
      await replace(
        request("/api/admin/media/replace", admin.cookie, "POST", replaceBody),
      )
    ).status,
    409,
  );
  assert.equal((await store.content()).published!.services[0].image, first);
  assert.equal((await store.content()).draft!.services[0].image, second);
  const oldUsage=await (await inventory(request('/api/admin/media?q=first-synthetic',admin.cookie))).json();assert.equal(oldUsage.assets[0].replaceable,false,'an image referenced only by published content cannot be replaced in the current draft');
  assert.equal(
    (await publicImage(request(first), imageContext(first))).status,
    200,
  );
  assert.equal(
    (await publicImage(request(second), imageContext(second))).status,
    404,
  );
  assert.equal((await removing()).status, 409);
  const latest = (await store.content()).draft!;
  await store.saveContent(latest, true, admin, version++);
  assert.equal(
    (await publicImage(request(second), imageContext(second))).status,
    200,
  );
  assert.equal(
    (await publicImage(request(first), imageContext(first))).status,
    404,
  );
  assert.equal(
    (
      await archive(
        request(first, accounts[1].cookie, "DELETE", { confirm: true }),
        imageContext(first),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await archive(
        request(first, admin.cookie, "DELETE", {}),
        imageContext(first),
      )
    ).status,
    400,
  );
  assert.equal((await removing()).status, 200);
  assert.deepEqual(
    await readFile(join(directory, "media", first.split("/").pop()!)),
    firstBytes,
    "archive retains bytes",
  );
  assert.equal(
    (await preview(request(first, admin.cookie), imageContext(first))).status,
    200,
    "retained originals require authorization",
  );
  assert.equal(
    (
      await (
        await inventory(
          request("/api/admin/media?q=first-synthetic", admin.cookie),
        )
      ).json()
    ).total,
    0,
  );
  await assert.rejects(
    () => store.saveContent(content, false, admin, version),
    (error) => error instanceof BackendError && error.code === "asset_in_use",
  );
  assert.equal((await store.content()).version, version);
  assets = await (
    await inventory(request("/api/admin/media", admin.cookie))
  ).json();
  assert.ok(
    assets.assets.some((a:{managed:boolean}) => !a.managed),
    "legacy public URLs remain discoverable",
  );
  assert.ok(
    (
      localDatabase().prepare("SELECT count(*) n FROM media_assets").get() as {
        n: number;
      }
    ).n >= 3,
  );
});

test("revoked sessions cannot read or mutate new CRM, team and media endpoints", async () => {
  const { cookie } = await loginAdmin(
    admin.email,
    "synthetic-workflow-password",
  );
  await logoutAdmin(cookie);
  for (const response of await Promise.all([
    list(request("/api/admin/quotes", cookie)),
    detail(request("/api/admin/quotes", cookie), context(target.id)),
    team(request("/api/admin/team", cookie)),
    inventory(request("/api/admin/media", cookie)),
    replace(request("/api/admin/media/replace", cookie, "POST", {})),
    archive(
      request("/api/admin/media", cookie, "DELETE", { confirm: true }),
      imageContext(`/api/media/${randomUUID()}.webp`),
    ),
  ]))
    assert.equal(response.status, 401);
});
