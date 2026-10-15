import { z } from "zod";
import { BackendError, storageMode } from "./config";
import { localDatabase } from "./local";
import { supabaseService } from "./supabase";
import { quoteStatusSchema } from "./schema";
import type { Actor } from "./types";
import type {
  QuoteChange,
  QuoteDetail,
  QuotePage,
  QuoteQuery,
  StaffMember,
  CRMQuote,
} from "./workflow-types";

export const quoteQuerySchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    status: z.union([quoteStatusSchema, z.literal("all")]).default("all"),
    assignee: z.union([z.uuid(), z.enum(["all", "unassigned"])]).default("all"),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(8),
  })
  .strict();
export const quoteChangeSchema = z
  .object({
    status: quoteStatusSchema.optional(),
    assignedTo: z.uuid().nullable().optional(),
    note: z.string().trim().min(1).max(4000).optional(),
    expectedVersion: z.number().int().min(0).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.status !== undefined ||
      v.assignedTo !== undefined ||
      v.note !== undefined,
  )
  .refine((v) => v.note === undefined || v.expectedVersion !== undefined);
export function rpcError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  const codes: Record<string, [string, number]> = {
    "40001": ["version_conflict", 409],
    "42501": ["forbidden", 403],
    P0002: ["not_found", 404],
    "22023": ["invalid_input", 400],
    "23503": ["invalid_input", 400],
    "23514": ["asset_in_use", 409],
  };
  const [code, status] = codes[error.code || ""] || ["unavailable", 503];
  throw new BackendError(code, status);
}
function clean(row: Record<string, unknown>): CRMQuote {
  const { payloadHash, idempotencyKey, ...value } = JSON.parse(
    row.data as string,
  );
  void payloadHash;
  void idempotencyKey;
  return {
    ...value,
    notification: row.notification,
    version: row.version,
    assignedTo: row.assigned_to,
  } as CRMQuote;
}
export async function queryQuotes(input: QuoteQuery): Promise<QuotePage> {
  if (storageMode() === "supabase") {
    const { data, error } = await supabaseService().rpc("crm_list", {
      p_query: input,
    });
    rpcError(error);
    return data as QuotePage;
  }
  const db = localDatabase(),
    conditions = ["1=1"],
    args: (string | number)[] = [];
  if (input.q) {
    conditions.push(
      "instr(unicode_lower(coalesce(json_extract(data,'$.name'),'')||' '||coalesce(json_extract(data,'$.email'),'')||' '||coalesce(json_extract(data,'$.phone'),'')||' '||coalesce(json_extract(data,'$.company'),'')||' '||coalesce(json_extract(data,'$.service'),'')||' '||coalesce(json_extract(data,'$.message'),'')),?)>0",
    );
    args.push(input.q.toLocaleLowerCase());
  }
  if (input.status !== "all") {
    conditions.push("json_extract(data,'$.status')=?");
    args.push(input.status);
  }
  if (input.assignee === "unassigned") conditions.push("assigned_to IS NULL");
  else if (input.assignee !== "all") {
    conditions.push("assigned_to=?");
    args.push(input.assignee);
  }
  const where = conditions.join(" AND ");
  // One read transaction keeps count, page and global metrics consistent.
  db.exec("BEGIN");
  try {
    const total = (
      db
        .prepare(`SELECT count(*) n FROM quotes WHERE ${where}`)
        .get(...args) as { n: number }
    ).n;
    const quotes = db
      .prepare(
        `SELECT data,notification,version,assigned_to FROM quotes WHERE ${where} ORDER BY json_extract(data,'$.createdAt') DESC,id DESC LIMIT ? OFFSET ?`,
      )
      .all(...args, input.pageSize, (input.page - 1) * input.pageSize)
      .map(clean);
    const totals: Record<string, number> = {
      total: 0,
      new: 0,
      in_progress: 0,
      completed: 0,
      archived: 0,
    };
    for (const row of db
      .prepare(
        "SELECT json_extract(data,'$.status') status,count(*) n FROM quotes GROUP BY json_extract(data,'$.status')",
      )
      .all() as { status: string; n: number }[]) {
      totals[row.status] = row.n;
      totals.total += row.n;
    }
    db.exec("COMMIT");
    return {
      quotes,
      total,
      page: input.page,
      pageSize: input.pageSize,
      totals,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export async function staffDirectory(): Promise<StaffMember[]> {
  if (storageMode() === "local")
    return localDatabase()
      .prepare("SELECT id,email,role FROM admins ORDER BY email")
      .all() as StaffMember[];
  const { data, error } = await supabaseService().rpc("crm_staff");
  rpcError(error);
  return data || [];
}
export async function quoteDetail(
  id: string,
  before = Number.MAX_SAFE_INTEGER,
): Promise<QuoteDetail> {
  if (storageMode() === "supabase") {
    const { data, error } = await supabaseService().rpc("crm_detail", {
      p_id: id,
      p_before: before,
    });
    rpcError(error);
    return data as QuoteDetail;
  }
  const db = localDatabase();
  db.exec("BEGIN");
  try {
    const row = db
      .prepare(
        "SELECT data,notification,version,assigned_to FROM quotes WHERE id=?",
      )
      .get(id);
    if (!row) throw new BackendError("not_found", 404);
    const events = db
      .prepare(
        "SELECT id,actor,kind,body,created_at AS createdAt FROM quote_events WHERE quote_id=? AND id<? ORDER BY id DESC LIMIT 51",
      )
      .all(id, before) as QuoteDetail["events"];
    db.exec("COMMIT");
    return {
      quote: clean(row),
      events: events.slice(0, 50),
      hasMore: events.length > 50,
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export async function changeQuote(
  id: string,
  input: QuoteChange,
  actor: Actor,
) {
  if (actor.role === "viewer") throw new BackendError("forbidden", 403);
  if (storageMode() === "supabase") {
    const { error } = await supabaseService().rpc("crm_change", {
      p_id: id,
      p_change: input,
      p_actor: actor.id,
    });
    rpcError(error);
    return;
  }
  const db = localDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT version FROM quotes WHERE id=?").get(id) as
      | { version: number }
      | undefined;
    if (!row) throw new BackendError("not_found", 404);
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== row.version
    )
      throw new BackendError("version_conflict", 409);
    if (
      input.assignedTo &&
      !db
        .prepare(
          "SELECT id FROM admins WHERE id=? AND role IN ('editor','admin')",
        )
        .get(input.assignedTo)
    )
      throw new BackendError("invalid_input", 400);
    const event = (kind: string, body: string) =>
      db
        .prepare(
          "INSERT INTO quote_events(quote_id,actor,kind,body,created_at) VALUES(?,?,?,?,?)",
        )
        .run(id, actor.id, kind, body, new Date().toISOString());
    if (input.status !== undefined) {
      db.prepare(
        "UPDATE quotes SET data=json_set(data,'$.status',?) WHERE id=?",
      ).run(input.status, id);
      event("status", input.status);
    }
    if (input.assignedTo !== undefined) {
      db.prepare("UPDATE quotes SET assigned_to=? WHERE id=?").run(
        input.assignedTo,
        id,
      );
      event("assignment", input.assignedTo || "");
    }
    if (input.note !== undefined) event("note", input.note);
    db.prepare("UPDATE quotes SET version=version+1 WHERE id=?").run(id);
    db.prepare(
      "INSERT INTO audit(actor,action,target,time) VALUES(?,?,?,?)",
    ).run(actor.id, "quote.update", id, new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
