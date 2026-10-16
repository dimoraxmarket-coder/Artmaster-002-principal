import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { BackendError, publicOrigin, storageMode } from "./config";
import { getStorage } from "./storage";
import { defaultContent } from "../content/defaults";
import { publicPaths, auditHTML } from "../seo-audit";
import { localDatabase } from "./local";
import { supabaseService } from "./supabase";
import { rpcError } from "./crm";
import { isIndexable } from "../site";
export const dateRangeSchema = z
  .object({ start: z.iso.date(), end: z.iso.date() })
  .strict()
  .refine((d) => {
    const days = (Date.parse(d.end) - Date.parse(d.start)) / 86400000;
    return (
      days >= 0 && days < 93 && d.end <= new Date().toISOString().slice(0, 10)
    );
  }, "Use a UTC date range of at most 93 days, ending no later than today");
export type DateRange = z.infer<typeof dateRangeSchema>;
export function defaultRange(): DateRange {
  const end = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return {
    start: new Date(Date.parse(end) - 27 * 86400000).toISOString().slice(0, 10),
    end,
  };
}
export async function conversionDays(range: DateRange) {
  let values: { day: string; count: number }[];
  if (storageMode() === "local")
    values = localDatabase()
      .prepare(
        "SELECT substr(json_extract(data,'$.createdAt'),1,10) AS day,count(*) AS count FROM quotes WHERE json_extract(data,'$.createdAt')>=? AND json_extract(data,'$.createdAt')<? GROUP BY 1 ORDER BY 1",
      )
      .all(
        range.start,
        new Date(Date.parse(range.end) + 86400000).toISOString().slice(0, 10),
      ) as typeof values;
  else {
    const result = await supabaseService().rpc("seo_conversion_days", {
      p_start: range.start,
      p_end: range.end,
    });
    rpcError(result.error);
    values = result.data || [];
  }
  const days: typeof values = [];
  for (
    let time = Date.parse(range.start);
    time <= Date.parse(range.end);
    time += 86400000
  ) {
    const day = new Date(time).toISOString().slice(0, 10);
    days.push({
      day,
      count: Number(values.find((v) => v.day === day)?.count || 0),
    });
  }
  return days;
}
export async function seoPages() {
  const c = (await getStorage().content()).published || defaultContent;
  return publicPaths(c);
}
async function text(url: string) {
  const r = await fetch(url, {
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "ARTMASTER-Local-SEO-Audit" },
  });
  if (!r.ok || !r.body) throw new BackendError("audit_unavailable", 503);
  const reader = r.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const v = await reader.read();
      if (v.done) break;
      bytes += v.value.length;
      if (bytes > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new BackendError("audit_too_large", 413);
      }
      chunks.push(v.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function auditPage(path: string) {
  const paths = await seoPages();
  if (!paths.includes(path)) throw new BackendError("invalid_input", 400);
  const origin = publicOrigin();
  const [html, sitemap, robots] = await Promise.all([
    text(origin + path),
    text(origin + "/sitemap.xml"),
    text(origin + "/robots.txt"),
  ]);
  return auditHTML({
    path,
    origin,
    html,
    sitemap,
    robots,
    paths,
    indexable: isIndexable,
    assetExists: (p) => {
      if (
        !/^\/(?:branding|images|media|fonts)\/[a-zA-Z0-9/_.-]+$/.test(p) ||
        p.split("/").includes("..")
      )
        return false;
      try {
        const file = lstatSync(resolve("public", p.slice(1)));
        return file.isFile() && !file.isSymbolicLink();
      } catch {
        return false;
      }
    },
  });
}
