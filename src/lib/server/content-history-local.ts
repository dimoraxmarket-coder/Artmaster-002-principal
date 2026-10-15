import type { DatabaseSync } from "node:sqlite";
import { contentSchema } from "./schema";
import { BackendError } from "./config";
import {
  HISTORY_LIMIT_BYTES,
  HISTORY_LIMIT_VERSIONS,
  SNAPSHOT_LIMIT_BYTES,
} from "../content/history-types";

export function initializeContentHistory(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS content_versions(
    id INTEGER PRIMARY KEY AUTOINCREMENT,version INTEGER NOT NULL,action TEXT NOT NULL,
    actor TEXT,created_at TEXT NOT NULL,source_id INTEGER REFERENCES content_versions(id),
    bytes INTEGER NOT NULL,content TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS content_history_order ON content_versions(id DESC);
    CREATE TRIGGER IF NOT EXISTS content_history_immutable_update BEFORE UPDATE ON content_versions BEGIN SELECT RAISE(ABORT,'content history is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS content_history_immutable_delete BEFORE DELETE ON content_versions BEGIN SELECT RAISE(ABORT,'content history is immutable'); END;`);
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      !db.prepare("SELECT 1 FROM meta WHERE key=?").get("content-history-v1")
    ) {
      const row = db
        .prepare("SELECT published,draft,version FROM content WHERE id=1")
        .get() as {
        published: string | null;
        draft: string | null;
        version: number;
      };
      for (const [action, raw] of [
        ["baseline-published", row.published],
        ["baseline-draft", row.draft],
      ] as const)
        if (raw)
          db.prepare(
            "INSERT INTO content_versions(version,action,created_at,bytes,content) VALUES(?,?,?,?,?)",
          ).run(
            row.version,
            action,
            new Date().toISOString(),
            Buffer.byteLength(raw),
            raw,
          );
      db.prepare("INSERT INTO meta(key,value) VALUES(?,?)").run(
        "content-history-v1",
        "1",
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function appendContentVersion(
  db: DatabaseSync,
  raw: string,
  version: number,
  publish: boolean,
  actor: string,
  sourceId?: number,
) {
  const bytes = Buffer.byteLength(raw),
    usage = db
      .prepare(
        "SELECT count(*) n,coalesce(sum(bytes),0) bytes FROM content_versions",
      )
      .get() as { n: number; bytes: number };
  if (
    bytes > SNAPSHOT_LIMIT_BYTES ||
    usage.n >= HISTORY_LIMIT_VERSIONS ||
    usage.bytes + bytes > HISTORY_LIMIT_BYTES
  )
    throw new BackendError("history_limit", 409);
  if (sourceId) {
    const row = db
      .prepare("SELECT content FROM content_versions WHERE id=?")
      .get(sourceId) as { content: string } | undefined;
    if (
      publish ||
      !row ||
      JSON.stringify(contentSchema.parse(JSON.parse(row.content))) !== raw
    )
      throw new BackendError("invalid_input", 400);
  }
  db.prepare(
    "INSERT INTO content_versions(version,action,actor,created_at,source_id,bytes,content) VALUES(?,?,?,?,?,?,?)",
  ).run(
    version,
    sourceId ? "restore" : publish ? "publish" : "draft",
    actor,
    new Date().toISOString(),
    sourceId || null,
    bytes,
    raw,
  );
}
