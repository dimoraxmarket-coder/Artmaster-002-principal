import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { defaultContent } from "../content/defaults";
import { BackendError, dataDirectory, storageMode } from "./config";
import { localDatabase } from "./local";
import { getStorage } from "./storage";
import { supabaseService } from "./supabase";
import { rpcError } from "./crm";
import type { Actor, ContentState } from "./types";
import type { MediaAsset, MediaPage } from "./workflow-types";
import type { SiteContent } from "../content/types";
export const mediaQuerySchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(40).default(12),
  })
  .strict();
export function mediaReferences(state: ContentState) {
  const refs: { url: string; name: string; use: MediaAsset["uses"][number] }[] =
    [];
  for (const [key, content] of [
    ["published", state.published || defaultContent],
    ["draft", state.draft],
  ] as const) {
    if (!content) continue;
    for (const section of ["services", "equipment", "projects"] as const)
      for (const item of content[section])
        refs.push({
          url: item.image,
          name: item.title.ro,
          use: { section, slug: item.slug, title: item.title.ro, state: key },
        });
  }
  return refs;
}
export function contentImageUrls(content: SiteContent) {
  return [...content.services, ...content.equipment, ...content.projects].map(
    (item) => item.image,
  );
}
export async function registerMedia(
  value: {
    url: string;
    name: string;
    bytes: number;
    width: number;
    height: number;
    createdAt: string;
  },
  actor?: Actor,
) {
  if (storageMode() === "local") {
    localDatabase()
      .prepare(
        "INSERT OR IGNORE INTO media_assets(url,name,bytes,width,height,created_at,created_by) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        value.url,
        value.name,
        value.bytes,
        value.width,
        value.height,
        value.createdAt,
        actor?.id || null,
      );
    return;
  }
  const { error } = await supabaseService()
    .from("media_assets")
    .upsert(
      {
        url: value.url,
        name: value.name,
        bytes: value.bytes,
        width: value.width,
        height: value.height,
        created_at: value.createdAt,
        created_by: actor?.id || null,
      },
      { onConflict: "url", ignoreDuplicates: true },
    );
  rpcError(error);
}
async function adoptLocalMedia() {
  if (storageMode() !== "local") return;
  const directory = join(dataDirectory(), "media");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const name of names) {
    if (!/^[a-f0-9-]{36}\.webp$/.test(name)) continue;
    const url = `/api/media/${name}`;
    if (
      localDatabase()
        .prepare("SELECT url FROM media_assets WHERE url=?")
        .get(url)
    )
      continue;
    const path = join(directory, name),
      info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink()) continue;
    const metadata = await sharp(path, {
      limitInputPixels: 30000000,
    }).metadata();
    await registerMedia({
      url,
      name,
      bytes: info.size,
      width: metadata.width || 0,
      height: metadata.height || 0,
      createdAt: info.birthtime.toISOString(),
    });
  }
}
export async function inventory(
  query: z.infer<typeof mediaQuerySchema>,
): Promise<MediaPage> {
  await adoptLocalMedia();
  const state = await getStorage().content(),
    refs = mediaReferences(state);
  let assets: MediaAsset[], total: number;
  if (storageMode() === "supabase") {
    const { data, error } = await supabaseService().rpc("media_inventory", {
      p_refs: refs.map(({ url, name }) => ({ url, name })),
      p_search: query.q,
      p_page: query.page,
      p_size: query.pageSize,
    });
    rpcError(error);
    assets = data.assets;
    total = data.total;
  } else {
    const db = localDatabase(),
      cte = `WITH legacy AS (SELECT json_extract(value,'$.url') url,min(json_extract(value,'$.name')) name FROM json_each(?) GROUP BY 1), all_assets AS (
      SELECT url,name,bytes,width,height,created_at AS createdAt,archived_at AS archivedAt,1 managed FROM media_assets WHERE archived_at IS NULL
      UNION ALL SELECT l.url,l.name,0,0,0,'',NULL,0 FROM legacy l WHERE NOT EXISTS(SELECT 1 FROM media_assets m WHERE m.url=l.url)
    ), matched AS (SELECT * FROM all_assets WHERE instr(unicode_lower(name||' '||url),?)>0)`;
    const args = [
      JSON.stringify(refs.map(({ url, name }) => ({ url, name }))),
      query.q.toLocaleLowerCase(),
    ];
    assets = db
      .prepare(
        `${cte} SELECT * FROM matched ORDER BY createdAt DESC,url LIMIT ? OFFSET ?`,
      )
      .all(
        ...args,
        query.pageSize,
        (query.page - 1) * query.pageSize,
      ) as unknown as MediaAsset[];
    total = (
      db.prepare(`${cte} SELECT count(*) n FROM matched`).get(...args) as {
        n: number;
      }
    ).n;
  }
  return {
    assets: assets.map((asset) => ({
      ...asset,
      managed: !!asset.managed,
      replaceable: contentImageUrls(
        state.draft || state.published || defaultContent,
      ).includes(asset.url),
      uses: refs.filter((ref) => ref.url === asset.url).map((ref) => ref.use),
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    contentVersion: state.version,
  };
}
export async function archiveMedia(url: string, actor: Actor) {
  if (actor.role !== "admin") throw new BackendError("forbidden", 403);
  if (storageMode() === "supabase") {
    const { error } = await supabaseService().rpc("archive_media", {
      p_url: url,
      p_actor: actor.id,
    });
    rpcError(error);
    return;
  }
  const db = localDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const state = db
      .prepare("SELECT published,draft FROM content WHERE id=1")
      .get() as { published: string | null; draft: string | null };
    for (const raw of [state.published, state.draft])
      if (raw && contentImageUrls(JSON.parse(raw)).includes(url))
        throw new BackendError("asset_in_use", 409);
    const result = db
      .prepare(
        "UPDATE media_assets SET archived_at=? WHERE url=? AND archived_at IS NULL",
      )
      .run(new Date().toISOString(), url);
    if (!result.changes) throw new BackendError("not_found", 404);
    db.prepare(
      "INSERT INTO audit(actor,action,target,time) VALUES(?,?,?,?)",
    ).run(actor.id, "media.archive", url, new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export async function replaceDraftMedia(
  url: string,
  replacementUrl: string,
  expectedVersion: number,
  actor: Actor,
) {
  if (actor.role === "viewer") throw new BackendError("forbidden", 403);
  if (url === replacementUrl) throw new BackendError("invalid_input", 400);
  if (storageMode() === "local") {
    if (
      !localDatabase()
        .prepare(
          "SELECT url FROM media_assets WHERE url=? AND archived_at IS NULL",
        )
        .get(replacementUrl)
    )
      throw new BackendError("not_found", 404);
  } else {
    const { data, error } = await supabaseService()
      .from("media_assets")
      .select("url")
      .eq("url", replacementUrl)
      .is("archived_at", null)
      .maybeSingle();
    rpcError(error);
    if (!data) throw new BackendError("not_found", 404);
  }
  const state = await getStorage().content();
  if (state.version !== expectedVersion)
    throw new BackendError("version_conflict", 409);
  const draft = structuredClone(
    state.draft || state.published || defaultContent,
  );
  let changed = 0;
  for (const section of ["services", "equipment", "projects"] as const)
    for (const item of draft[section])
      if (item.image === url) {
        item.image = replacementUrl;
        changed++;
      }
  if (!changed) throw new BackendError("not_found", 404);
  const version = await getStorage().saveContent(
    draft,
    false,
    actor,
    expectedVersion,
  );
  return { version, changed };
}
