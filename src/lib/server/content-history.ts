import { z } from "zod";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { BackendError, storageMode } from "./config";
import { localDatabase } from "./local";
import { supabaseService } from "./supabase";
import { rpcError } from "./crm";
import { contentSchema } from "./schema";
import { getStorage } from "./storage";
import { readMedia } from "./media";
import { contentImageUrls } from "./media-inventory";
import {
  HISTORY_LIMIT_BYTES,
  HISTORY_LIMIT_VERSIONS,
  type ContentVersion,
  type ContentHistoryPage,
  type ContentSnapshot,
} from "../content/history-types";
import type { Actor } from "./types";
export const historyQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(30).default(10),
  })
  .strict();
const columns = "id,version,action,actor,created_at,source_id,bytes";
function summary(row: Record<string, unknown>): ContentVersion {
  return {
    id: Number(row.id),
    version: Number(row.version),
    action: row.action as ContentVersion["action"],
    actor: row.actor as string | null,
    createdAt: row.created_at as string,
    sourceId: row.source_id ? Number(row.source_id) : null,
    bytes: Number(row.bytes),
  };
}
export async function contentHistory(
  query: z.infer<typeof historyQuerySchema>,
): Promise<ContentHistoryPage> {
  let rows: Record<string, unknown>[], total: number, bytes: number;
  if (storageMode() === "local") {
    const db = localDatabase();
    rows = db
      .prepare(
        `SELECT ${columns} FROM content_versions ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(query.pageSize, (query.page - 1) * query.pageSize);
    const usage = db
      .prepare(
        "SELECT count(*) n,coalesce(sum(bytes),0) bytes FROM content_versions",
      )
      .get() as { n: number; bytes: number };
    total = usage.n;
    bytes = usage.bytes;
  } else {
    const client = supabaseService(),
      result = await client
        .from("content_versions")
        .select(columns, { count: "exact" })
        .order("id", { ascending: false })
        .range(
          (query.page - 1) * query.pageSize,
          query.page * query.pageSize - 1,
        );
    rpcError(result.error);
    rows = result.data || [];
    total = result.count || 0;
    // A server-only aggregate avoids fetching snapshot bodies or a truncated REST row set.
    const usage = await client.rpc("content_history_usage");
    rpcError(usage.error);
    bytes = Number(usage.data);
  }
  return {
    versions: rows.map(summary),
    total,
    page: query.page,
    pageSize: query.pageSize,
    bytes,
    limitBytes: HISTORY_LIMIT_BYTES,
    limitVersions: HISTORY_LIMIT_VERSIONS,
  };
}
export async function contentSnapshot(id: number): Promise<ContentSnapshot> {
  let row: Record<string, unknown> | undefined;
  if (storageMode() === "local")
    row = localDatabase()
      .prepare(`SELECT ${columns},content FROM content_versions WHERE id=?`)
      .get(id);
  else {
    const result = await supabaseService()
      .from("content_versions")
      .select(`${columns},content`)
      .eq("id", id)
      .maybeSingle();
    rpcError(result.error);
    row = result.data || undefined;
  }
  if (!row) throw new BackendError("not_found", 404);
  return {
    ...summary(row),
    content: contentSchema.parse(
      typeof row.content === "string" ? JSON.parse(row.content) : row.content,
    ),
  };
}
export async function restoreContent(
  id: number,
  expectedVersion: number,
  actor: Actor,
  request?: Request,
) {
  if (actor.role === "viewer") throw new BackendError("forbidden", 403);
  const snapshot = await contentSnapshot(id);
  // Check bytes as well as registry state; SQL rechecks private object metadata under the content lock.
  for (const url of new Set(contentImageUrls(snapshot.content))) {
    if (url.startsWith("/api/media/")) {
      if (
        storageMode() === "local" &&
        !localDatabase()
          .prepare(
            "SELECT url FROM media_assets WHERE url=? AND archived_at IS NULL",
          )
          .get(url)
      )
        throw new BackendError("asset_unavailable", 409);
      try {
        await readMedia(url.slice("/api/media/".length));
      } catch {
        throw new BackendError("asset_unavailable", 409);
      }
    } else if (url.startsWith("/")) {
      try {
        const file = await lstat(resolve("public", url.slice(1)));
        if (!file.isFile() || file.isSymbolicLink()) throw new Error("missing");
      } catch {
        throw new BackendError("asset_unavailable", 409);
      }
    } else {
      // Legacy public URLs are not confidential and have no managed availability guarantee.
      // Require the operator to replace them with managed assets before restoring this version.
      throw new BackendError("asset_unavailable", 409);
    }
  }
  // Byte checks may involve remote storage; recheck the live session afterwards.
  if (request)
    actor = await (await import("./auth")).requireActor(request, "editor");
  return getStorage().saveContent(
    snapshot.content,
    false,
    actor,
    expectedVersion,
    id,
  );
}
