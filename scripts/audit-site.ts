import { writeFile, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { load } from "cheerio";
import { auditHTML } from "../src/lib/seo-audit";

// Deliberately limited to a local test server. Never crawl production or third parties.
const origin = new URL(process.argv[2] || "http://127.0.0.1:3100");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) ||
  origin.protocol !== "http:" ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash
)
  throw Error("Audit only an explicit HTTP loopback origin.");
async function read(path: string) {
  const start = performance.now();
  const r = await fetch(origin.origin + path, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length > 2 * 1024 * 1024)
    throw Error("Local response exceeds audit limit");
  return {
    status: r.status,
    html: Buffer.from(bytes).toString(),
    ms: performance.now() - start,
    bytes: bytes.length,
  };
}
async function main() {
  const sitemap = await read("/sitemap.xml"),
    robots = await read("/robots.txt");
  if (sitemap.status !== 200 || robots.status !== 200)
    throw Error("Sitemap/robots unavailable");
  const xml = load(sitemap.html, { xmlMode: true });
  const paths = new Set(
    xml("loc")
      .toArray()
      .map((el) => {
        const url = new URL(xml(el).text());
        if (url.origin !== origin.origin)
          throw Error("Start server with SITE_URL matching this audit origin");
        return url.pathname;
      }),
  );
  const queue = [...paths],
    pages = new Map<string, Awaited<ReturnType<typeof read>>>();
  const safe = (p: string) => /^\/(ro|ru|en)(?:\/[a-z0-9-]+)*$/.test(p);
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i];
    if (!safe(path)) throw Error("Unexpected public route");
    const result = await read(path);
    pages.set(path, result);
    if (result.status !== 200) continue;
    const $ = load(result.html);
    for (const a of $("a[href]").toArray()) {
      const url = new URL($(a).attr("href")!, origin.origin + path);
      if (
        url.origin !== origin.origin ||
        !safe(url.pathname) ||
        paths.has(url.pathname)
      )
        continue;
      if (paths.size >= 300)
        throw Error("Crawl limit reached; no complete score is claimed");
      paths.add(url.pathname);
      queue.push(url.pathname);
    }
  }
  const known = [...pages].filter(([, r]) => r.status === 200).map(([p]) => p);
  const publicAssets = new Set<string>();
  for (const [, r] of pages) {
    const $ = load(r.html);
    for (const el of $("a[href]").toArray()) {
      const p = new URL($(el).attr("href")!, origin.origin).pathname;
      if (
        !/^\/(branding|images|media|fonts|partners)\/[a-zA-Z0-9/_.-]+$/.test(
          p,
        ) ||
        p.split("/").includes("..")
      )
        continue;
      try {
        const f = await lstat(resolve("public", p.slice(1)));
        if (f.isFile() && !f.isSymbolicLink()) publicAssets.add(p);
      } catch {
        /* Broken public asset. */
      }
    }
  }
  const results = [...pages].map(([path, r]) => ({
    ...auditHTML({
      path,
      origin: origin.origin,
      html: r.html,
      sitemap: sitemap.html,
      robots: robots.html,
      paths: known,
      assetExists: (p) => publicAssets.has(p),
      indexable: false,
    }),
    httpStatus: r.status,
    responseMs: Math.round(r.ms),
    htmlBytes: r.bytes,
    title: load(r.html)("title").first().text(),
    description: load(r.html)('meta[name="description"]').attr("content") || "",
  }));
  const duplicates = (key: "title" | "description") => {
    const groups = new Map<string, string[]>();
    for (const r of results)
      if (r[key]) groups.set(r[key], [...(groups.get(r[key]) || []), r.path]);
    return [...groups]
      .filter(([, p]) => p.length > 1)
      .map(([value, paths]) => ({ value, paths }));
  };
  const report = {
    checkedAt: new Date().toISOString(),
    scope:
      "Isolated loopback crawl; staging intentionally noindex. Not a Google ranking or hosted integration test.",
    count: results.length,
    duplicateTitles: duplicates("title"),
    duplicateDescriptions: duplicates("description"),
    results,
  };
  if (process.argv[3])
    await writeFile(process.argv[3], JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
    });
  console.log(
    JSON.stringify(
      {
        pages: results.length,
        failedStatus: results
          .filter((r) => r.httpStatus !== 200)
          .map((r) => r.path),
        duplicateTitles: report.duplicateTitles,
        duplicateDescriptions: report.duplicateDescriptions,
        issues: results.map((r) => ({
          path: r.path,
          score: r.score,
          checks: r.checks.filter((c) => c.status !== "pass").map((c) => c.id),
        })),
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
