import { z } from "zod";
import { BackendError, storageMode } from "./config";
import { localDatabase } from "./local";
import { supabaseService } from "./supabase";
import { ADMIN_ABSOLUTE_MS, ADMIN_IDLE_MS } from "./session-policy";
import type { SecurityContext } from "./auth";
import type { AccountPage, AuditPage, SessionPage } from "./security-types";
export const FRESH_LOGIN_MS = 5 * 60000;
export const securityActions = [
  "admin.login",
  "admin.login.failed",
  "admin.logout",
  "admin.mfa.enroll",
  "admin.mfa.failed",
  "security.sessions.revoke",
  "security.team.change",
] as const;
const pageFields = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
};
export const sessionQuerySchema = z
  .object({ ...pageFields, owner: z.uuid().optional() })
  .strict();
export const accountQuerySchema = z
  .object({ ...pageFields, q: z.string().trim().max(200).default("") })
  .strict();
export const auditQuerySchema = z
  .object({
    ...pageFields,
    action: z.enum(["all", ...securityActions]).default("all"),
    actor: z.uuid().optional(),
    from: z.iso
      .datetime()
      .transform((value) => new Date(value).toISOString())
      .optional(),
    to: z.iso
      .datetime()
      .transform((value) => new Date(value).toISOString())
      .optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to);
export const revokeSchema = z
  .object({
    reference: z.uuid().optional(),
    owner: z.uuid().optional(),
    allOthers: z.boolean().optional(),
    confirm: z.literal(true),
  })
  .strict()
  .refine((v) =>
    v.reference ? !v.owner && !v.allOthers : v.allOthers === true,
  );
export const accountChangeSchema = z
  .object({
    role: z.enum(["viewer", "editor", "admin"]),
    enabled: z.boolean(),
    expectedVersion: z.number().int().nonnegative(),
    confirm: z.literal(true),
  })
  .strict();
export function securityError(error: { code?: string } | null) {
  if (!error) return;
  const map: Record<string, [string, number]> = {
    P0401: ["unauthorized", 401],
    P0403: ["forbidden", 403],
    P0428: ["reauth_required", 403],
    P0409: ["last_admin", 409],
    P0412: ["self_change", 403],
    P0413: ["current_session", 409],
    P0002: ["not_found", 404],
    "40001": ["version_conflict", 409],
    "22023": ["invalid_input", 400],
  };
  const [code, status] = map[error.code || ""] || ["unavailable", 503];
  throw new BackendError(code, status);
}
const rpcContext = (context: SecurityContext) => ({
  p_hash: context.hash,
  p_actor: context.actor.id,
  p_auth: context.authSessionId,
});
function localContext(context: SecurityContext, fresh = false, admin = false) {
  const db = localDatabase(),
    now = Date.now();
  const row = db
    .prepare(
      `SELECT a.id,a.role,s.verified_at FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.hash=? AND a.id=? AND a.enabled=1 AND a.version=s.role_version AND s.expires>? AND s.created_at>? AND s.last_seen_at>?`,
    )
    .get(
      context.hash,
      context.actor.id,
      now,
      now - ADMIN_ABSOLUTE_MS,
      now - ADMIN_IDLE_MS,
    ) as { id: string; role: string; verified_at: number | null } | undefined;
  if (!row) throw new BackendError("unauthorized", 401);
  if (admin && row.role !== "admin") throw new BackendError("forbidden", 403);
  if (
    fresh &&
    (!row.verified_at ||
      row.verified_at <= now - FRESH_LOGIN_MS ||
      row.verified_at > now)
  )
    throw new BackendError("reauth_required", 403);
  return row;
}
export async function listSessions(
  context: SecurityContext,
  query: z.infer<typeof sessionQuerySchema>,
): Promise<SessionPage> {
  if (storageMode() === "supabase") {
    const { data, error } = await supabaseService().rpc("security_sessions", {
      ...rpcContext(context),
      p_owner: query.owner || context.actor.id,
      p_page: query.page,
      p_size: query.pageSize,
    });
    securityError(error);
    return data;
  }
  const db = localDatabase();
  db.exec("BEGIN");
  try {
    const actor = localContext(context),
      owner = query.owner || actor.id;
    if (owner !== actor.id && actor.role !== "admin")
      throw new BackendError("forbidden", 403);
    const account = db
      .prepare("SELECT id,email FROM admins WHERE id=?")
      .get(owner) as { id: string; email: string } | undefined;
    if (!account) throw new BackendError("not_found", 404);
    const now = Date.now(),
      args = [owner, now, now - ADMIN_ABSOLUTE_MS, now - ADMIN_IDLE_MS],
      where =
        "s.admin_id=? AND a.enabled=1 AND a.version=s.role_version AND s.expires>? AND s.created_at>? AND s.last_seen_at>?";
    const total = (
      db
        .prepare(
          `SELECT count(*) n FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE ${where}`,
        )
        .get(...args) as { n: number }
    ).n;
    const rows = db
      .prepare(
        `SELECT s.* FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE ${where} ORDER BY created_at DESC,reference LIMIT ? OFFSET ?`,
      )
      .all(...args, query.pageSize, (query.page - 1) * query.pageSize) as {
      reference: string;
      hash: string;
      created_at: number;
      last_seen_at: number;
      expires: number;
    }[];
    const iso = (value: number) => new Date(value).toISOString();
    db.exec("COMMIT");
    return {
      sessions: rows.map((row) => ({
        reference: row.reference,
        current: row.hash === context.hash,
        createdAt: iso(row.created_at),
        lastActivityAt: iso(row.last_seen_at),
        expiresAt: iso(
          Math.min(
            row.expires,
            row.created_at + ADMIN_ABSOLUTE_MS,
            row.last_seen_at + ADMIN_IDLE_MS,
          ),
        ),
        absoluteExpiresAt: iso(
          Math.min(row.expires, row.created_at + ADMIN_ABSOLUTE_MS),
        ),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      owner: account,
      freshUntil: actor.verified_at
        ? iso(actor.verified_at + FRESH_LOGIN_MS)
        : null,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export async function revokeSessions(
  context: SecurityContext,
  input: z.infer<typeof revokeSchema>,
) {
  if (storageMode() === "supabase") {
    const { data, error } = await supabaseService().rpc("security_revoke", {
      ...rpcContext(context),
      p_reference: input.reference || null,
      p_owner: input.owner || null,
      p_all: input.allOthers || false,
    });
    securityError(error);
    return { revoked: Number(data) };
  }
  const db = localDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const actor = localContext(context, true),
      target = input.reference
        ? (db
            .prepare("SELECT admin_id,hash FROM sessions WHERE reference=?")
            .get(input.reference) as
            | { admin_id: string; hash: string }
            | undefined)
        : undefined;
    if (input.reference && !target) throw new BackendError("not_found", 404);
    const owner = target?.admin_id || input.owner || actor.id;
    if (owner !== actor.id && actor.role !== "admin")
      throw new BackendError("forbidden", 403);
    if (target?.hash === context.hash)
      throw new BackendError("current_session", 409);
    if (!db.prepare("SELECT id FROM admins WHERE id=?").get(owner))
      throw new BackendError("not_found", 404);
    const result = target
      ? db.prepare("DELETE FROM sessions WHERE hash=?").run(target.hash)
      : db
          .prepare("DELETE FROM sessions WHERE admin_id=? AND hash<>?")
          .run(owner, context.hash);
    db.prepare(
      "INSERT INTO audit(actor,action,target,time,context) VALUES(?,?,?,?,?)",
    ).run(
      actor.id,
      "security.sessions.revoke",
      owner,
      new Date().toISOString(),
      JSON.stringify({
        scope: target ? "single" : "other_sessions",
        revoked: Number(result.changes),
      }),
    );
    db.exec("COMMIT");
    return { revoked: Number(result.changes) };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export async function listAccounts(
  context: SecurityContext,
  query: z.infer<typeof accountQuerySchema>,
): Promise<AccountPage> {
  if (storageMode() === "supabase") {
    const { data, error } = await supabaseService().rpc("security_accounts", {
      ...rpcContext(context),
      p_query: query,
    });
    securityError(error);
    return data;
  }
  const db = localDatabase();
  db.exec("BEGIN");
  try {
    const actor = localContext(context),
      where = `${actor.role === "admin" ? "1=1" : "enabled=1"} AND instr(unicode_lower(email),?)>0`,
      q = query.q.toLocaleLowerCase();
    const rows = db
      .prepare(
        `SELECT id,email,role,enabled,version FROM admins WHERE ${where} ORDER BY email,id LIMIT ? OFFSET ?`,
      )
      .all(q, query.pageSize, (query.page - 1) * query.pageSize) as {
      id: string;
      email: string;
      role: "viewer" | "editor" | "admin";
      enabled: number;
      version: number;
    }[];
    const total = (
        db.prepare(`SELECT count(*) n FROM admins WHERE ${where}`).get(q) as {
          n: number;
        }
      ).n,
      enabledAdmins = (
        db
          .prepare(
            "SELECT count(*) n FROM admins WHERE enabled=1 AND role='admin'",
          )
          .get() as { n: number }
      ).n;
    db.exec("COMMIT");
    return {
      accounts: rows.map((row) => ({ ...row, enabled: row.enabled === 1 })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      enabledAdmins,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export async function changeAccount(
  context: SecurityContext,
  id: string,
  input: z.infer<typeof accountChangeSchema>,
) {
  if (storageMode() === "supabase") {
    const { data, error } = await supabaseService().rpc(
      "security_change_account",
      {
        ...rpcContext(context),
        p_target: id,
        p_role: input.role,
        p_enabled: input.enabled,
        p_expected: input.expectedVersion,
      },
    );
    securityError(error);
    return data;
  }
  const db = localDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const actor = localContext(context, true, true),
      target = db
        .prepare("SELECT role,enabled,version FROM admins WHERE id=?")
        .get(id) as
        | { role: string; enabled: number; version: number }
        | undefined;
    if (!target) throw new BackendError("not_found", 404);
    if (target.version !== input.expectedVersion)
      throw new BackendError("version_conflict", 409);
    if (
      target.role === "admin" &&
      target.enabled === 1 &&
      (input.role !== "admin" || !input.enabled) &&
      (
        db
          .prepare(
            "SELECT count(*) n FROM admins WHERE enabled=1 AND role='admin'",
          )
          .get() as { n: number }
      ).n <= 1
    )
      throw new BackendError("last_admin", 409);
    if (id === actor.id) throw new BackendError("self_change", 403);
    if (target.role === input.role && !!target.enabled === input.enabled)
      throw new BackendError("invalid_input", 400);
    db.prepare(
      "UPDATE admins SET role=?,enabled=?,version=version+1 WHERE id=?",
    ).run(input.role, input.enabled ? 1 : 0, id);
    const revoked = Number(
      db.prepare("DELETE FROM sessions WHERE admin_id=?").run(id).changes,
    );
    db.prepare(
      "INSERT INTO audit(actor,action,target,time,context) VALUES(?,?,?,?,?)",
    ).run(
      actor.id,
      "security.team.change",
      id,
      new Date().toISOString(),
      JSON.stringify({
        previousRole: target.role,
        role: input.role,
        enabled: input.enabled,
        revoked,
      }),
    );
    db.exec("COMMIT");
    return { ok: true, revoked };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
// Only allowlisted security actions and explicit safe context keys are returned.
// Legacy general audit targets (which may include CRM file paths) are not exposed.
export async function listSecurityAudit(
  context: SecurityContext,
  query: z.infer<typeof auditQuerySchema>,
): Promise<AuditPage> {
  if (storageMode() === "supabase") {
    const { data, error } = await supabaseService().rpc("security_audit", {
      ...rpcContext(context),
      p_query: query,
    });
    securityError(error);
    return data;
  }
  const db = localDatabase();
  db.exec("BEGIN");
  try {
    localContext(context, false, true);
    const conditions = [
        `l.action IN (${securityActions.map(() => "?").join(",")})`,
      ],
      args: (string | number)[] = [...securityActions];
    if (query.action !== "all") {
      conditions.push("l.action=?");
      args.push(query.action);
    }
    if (query.actor) {
      conditions.push("l.actor=?");
      args.push(query.actor);
    }
    if (query.from) {
      conditions.push("l.time>=?");
      args.push(query.from);
    }
    if (query.to) {
      conditions.push("l.time<=?");
      args.push(query.to);
    }
    const where = conditions.join(" AND "),
      total = (
        db
          .prepare(`SELECT count(*) n FROM audit l WHERE ${where}`)
          .get(...args) as { n: number }
      ).n;
    const rows = db
      .prepare(
        `SELECT l.id,l.actor,coalesce(a.email,'Operator / cont indisponibil') actorLabel,l.action,l.target,t.email targetLabel,l.time createdAt,l.context FROM audit l LEFT JOIN admins a ON a.id=l.actor LEFT JOIN admins t ON t.id=l.target WHERE ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...args, query.pageSize, (query.page - 1) * query.pageSize) as (Omit<
      AuditPage["events"][number],
      "context"
    > & { context: string })[];
    db.exec("COMMIT");
    return {
      events: rows.map((row) => ({
        ...row,
        target:
          row.action.startsWith("security.") &&
          z.uuid().safeParse(row.target).success
            ? row.target
            : "session",
        context: safeAuditContext(JSON.parse(row.context)),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
function safeAuditContext(value: Record<string, unknown>) {
  const result: Record<string, string | number | boolean> = {};
  for (const key of ["scope", "revoked", "previousRole", "role", "enabled"]) {
    const item = value[key];
    if (
      key === "revoked" &&
      typeof item === "number" &&
      Number.isSafeInteger(item) &&
      item >= 0
    )
      result[key] = item;
    else if (key === "enabled" && typeof item === "boolean") result[key] = item;
    else if (
      (key === "role" || key === "previousRole") &&
      ["viewer", "editor", "admin"].includes(String(item))
    )
      result[key] = String(item);
    else if (
      key === "scope" &&
      ["single", "other_sessions"].includes(String(item))
    )
      result[key] = String(item);
  }
  return result;
}
