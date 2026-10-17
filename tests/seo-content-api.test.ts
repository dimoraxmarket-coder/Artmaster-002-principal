import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalAdmin, loginAdmin, actorForSession, logoutAdmin } from "../src/lib/server/auth";
import { LocalStorage } from "../src/lib/server/local";
import { GET } from "../src/app/api/admin/seo/content/route";
import { defaultContent } from "../src/lib/content/defaults";
import { savedDraftPreview } from "../src/lib/server/content-preview";
const directory = mkdtempSync(join(tmpdir(), "artmaster-seo-content-"));
Object.assign(process.env, { ARTMASTER_STORAGE: "local", ARTMASTER_DATA_DIR: directory, SITE_URL: "http://localhost:3000" });
after(() => rm(directory, { recursive: true, force: true }));
function request(cookie = "", query = "") { return new Request(`http://localhost:3000/api/admin/seo/content${query}`, { headers: { Cookie: `artmaster_admin=${cookie}` } }); }

test("editorial API requires a live session, reads published content only and returns no private records", async () => {
  assert.equal((await GET(request())).status, 401);
  const store = new LocalStorage();
  for (const role of ["admin", "editor", "viewer"] as const) {
    await createLocalAdmin(`${role}@example.invalid`, "Synthetic-only-password-29!", role);
    const auth = await loginAdmin(`${role}@example.invalid`, "Synthetic-only-password-29!");
    if (role === "admin") {
      const actor = (await actorForSession(auth.cookie))!;
      await store.saveContent(defaultContent, true, actor, 0);
      const draft = structuredClone(defaultContent);
      draft.services[0].title.en = "PRIVATE DRAFT NEVER IN EDITORIAL REPORT";
      await store.saveContent(draft, false, actor, 1);
    }
    const response = await GET(request(auth.cookie));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control")!, /private.*no-store/);
    const body = await response.json();
    assert.equal(body.source, "published");
    assert.equal(body.rows.length, defaultContent.services.length * 3);
    for (const forbidden of ["PRIVATE DRAFT", "password", "cookie", "sessionId", "contact.email", "token"]) assert.ok(!JSON.stringify(body).includes(forbidden), forbidden);
    assert.equal((await GET(request(auth.cookie, "?draft=true"))).status, 400);
    await logoutAdmin(auth.cookie);
    assert.equal((await GET(request(auth.cookie))).status, 401);
  }
});

test("revocation during an asynchronous content read blocks both editorial reports and private previews", async () => {
  const original = LocalStorage.prototype.content;
  for (const action of ["report", "preview"] as const) {
    const login = await loginAdmin("viewer@example.invalid", "Synthetic-only-password-29!");
    LocalStorage.prototype.content = async function () {
      const result = await original.call(this);
      await logoutAdmin(login.cookie);
      return result;
    };
    try {
      if (action === "report") assert.equal((await GET(request(login.cookie))).status, 401);
      else await assert.rejects(() => savedDraftPreview(request(login.cookie)), { code: "unauthorized" });
    } finally { LocalStorage.prototype.content = original; }
  }
});
