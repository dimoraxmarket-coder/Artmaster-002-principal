import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SiteContent } from "../content/types";
import type { Actor } from "./types";
import type { PageAudit } from "../seo-audit";
import { SEO_FORMULA_VERSION } from "../seo-audit";
import { getStorage } from "./storage";
import { defaultContent } from "../content/defaults";
import { localDatabase } from "./local";
import { BackendError, publicOrigin, storageMode } from "./config";
import { supabaseService } from "./supabase";
import { rpcError } from "./crm";
import { seoPages } from "./seo-center";

const runtime = globalThis as typeof globalThis & {
  __artmasterSeoRelease?: string;
};
function runtimeRelease() {
  return (runtime.__artmasterSeoRelease ||= randomUUID());
}
let productionRelease: Promise<string> | undefined;
async function releaseIdentity() {
  if (process.env.NODE_ENV !== "production") return runtimeRelease();
  return (productionRelease ||= readFile(
    join(process.cwd(), ".next", "BUILD_ID"),
    "utf8",
  )
    .then((v) => v.trim() || runtimeRelease())
    .catch(() => runtimeRelease()));
}
export function seoFingerprint(content: SiteContent, release: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        content,
        release,
        SEO_FORMULA_VERSION,
        publicOrigin(),
        process.env.SITE_INDEXABLE === "true",
      ]),
    )
    .digest("hex");
}
export async function publishedFingerprint() {
  const content = (await getStorage().content()).published || defaultContent;
  return seoFingerprint(content, await releaseIdentity());
}
export async function recordSeoAudit(
  report: PageAudit,
  actor: Actor,
  fingerprint: string,
) {
  if ((await publishedFingerprint()) !== fingerprint)
    throw new BackendError("version_conflict", 409);
  const raw = JSON.stringify(report);
  if (Buffer.byteLength(raw) > 65536)
    throw new BackendError("audit_too_large", 413);
  if (storageMode() === "supabase") {
    const { error } = await supabaseService().rpc("record_seo_audit", {
      p_origin: publicOrigin(),
      p_path: report.path,
      p_result: report,
      p_actor: actor.id,
      p_fingerprint: fingerprint,
    });
    rpcError(error);
    return;
  }
  const db = localDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const enabled = db
      .prepare("SELECT 1 FROM admins WHERE id=? AND enabled=1 AND role=?")
      .get(actor.id, actor.role);
    if (!enabled) throw new BackendError("unauthorized", 401);
    db.prepare(
      "INSERT INTO seo_audit_history(origin,path,formula,fingerprint,actor,created_at,result) VALUES(?,?,?,?,?,?,?)",
    ).run(
      publicOrigin(),
      report.path,
      report.formulaVersion,
      fingerprint,
      actor.id,
      report.checkedAt,
      raw,
    );
    // Bounded diagnostic history only. Never touches content versions or audit logs.
    db.prepare(
      "DELETE FROM seo_audit_history WHERE created_at<? OR id NOT IN (SELECT id FROM seo_audit_history ORDER BY id DESC LIMIT 2000)",
    ).run(new Date(Date.now() - 30 * 86400000).toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
type Row = {
  id: number;
  path: string;
  fingerprint: string;
  result: PageAudit | string;
};
export async function seoHistory(path: string) {
  const [fingerprint, paths] = await Promise.all([
    publishedFingerprint(),
    seoPages(),
  ]);
  if (!paths.includes(path)) throw new BackendError("invalid_input", 400);
  let rows: Row[];
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  if (storageMode() === "local")
    rows = localDatabase()
      .prepare(
        "SELECT id,path,fingerprint,result FROM seo_audit_history WHERE origin=? AND formula=? AND created_at>=? ORDER BY id DESC LIMIT 2000",
      )
      .all(publicOrigin(), SEO_FORMULA_VERSION, since) as Row[];
  else {
    const { data, error } = await supabaseService()
      .from("seo_audit_history")
      .select("id,path,fingerprint,result")
      .eq("origin", publicOrigin())
      .eq("formula", SEO_FORMULA_VERSION)
      .gte("created_at", since)
      .order("id", { ascending: false })
      .limit(2000);
    rpcError(error);
    rows = data || [];
  }
  const latest = new Map<string, PageAudit>(),
    history: { id: number; currentContent: boolean; report: PageAudit }[] = [];
  for (const row of rows) {
    if (!paths.includes(row.path)) continue;
    const report: PageAudit =
      typeof row.result === "string" ? JSON.parse(row.result) : row.result;
    if (row.fingerprint === fingerprint && !latest.has(row.path))
      latest.set(row.path, report);
    if (row.path === path && history.length < 10)
      history.push({
        id: Number(row.id),
        currentContent: row.fingerprint === fingerprint,
        report,
      });
  }
  const pages = [...latest.values()].map((r) => ({
    path: r.path,
    score: r.score,
    checkedAt: r.checkedAt,
    passed: r.checks.filter((c) => c.status === "pass").length,
    failed: r.checks.filter((c) => c.status === "fail").length,
  }));
  return {
    path,
    formulaVersion: SEO_FORMULA_VERSION,
    checkedAt: new Date().toISOString(),
    totalPages: paths.length,
    checkedPages: pages.length,
    overallScore:
      pages.length === paths.length && pages.length
        ? Math.round(pages.reduce((n, p) => n + p.score, 0) / pages.length)
        : null,
    pages,
    history,
    retention:
      "30 zile, maximum 2000 verificări globale; maximum 10 versiuni afișate per pagină. Scorul global necesită toate paginile și conținutul publicat actual.",
  };
}
