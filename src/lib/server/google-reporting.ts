import { isIP } from "node:net";
import { JWT } from "google-auth-library";
import { createHash } from "node:crypto";
import type { DateRange } from "./seo-center";
import { publicOrigin, BackendError } from "./config";
export type ConnectionState = "unconnected" | "connected" | "unavailable";
export type GoogleReports = {
  ga4: {
    state: ConnectionState;
    users: number | null;
    sessions: number | null;
    keyEvents: number | null;
    sessionKeyEventRate: number | null;
    days: { day: string; users: number; sessions: number; keyEvents: number }[];
    sources: { channel: string; sessions: number }[];
    popularPages: { path: string; views: number }[];
  };
  search: {
    state: ConnectionState;
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
    averagePosition: number | null;
    days: { day: string; clicks: number; impressions: number }[];
  };
};
export function googleConfiguration() {
  const enabled = process.env.ARTMASTER_GOOGLE_REPORTING_ENABLED === "true",
    email = process.env.GOOGLE_CLIENT_EMAIL || "",
    key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    property = process.env.GA4_PROPERTY_ID || "",
    site = process.env.GSC_SITE_URL || "";
  const credentials =
    enabled &&
    /^[^\s@]+@[^\s@]+\.gserviceaccount\.com$/.test(email) &&
    key.includes("PRIVATE KEY");
  let search = false;
  try {
    search =
      site === `sc-domain:${new URL(publicOrigin()).hostname}` ||
      site === publicOrigin() + "/";
  } catch {
    /* Invalid deployment origin leaves reporting disconnected. */
  }
  return {
    email,
    key,
    property,
    site,
    ga4: credentials && /^\d{1,20}$/.test(property),
    search: credentials && search,
    pagespeed:
      process.env.ARTMASTER_PAGESPEED_ENABLED === "true" &&
      !!process.env.PAGESPEED_API_KEY,
  };
}
export function emptyGoogleReports(): GoogleReports {
  return {
    ga4: {
      state: "unconnected",
      users: null,
      sessions: null,
      keyEvents: null,
      sessionKeyEventRate: null,
      days: [],
      sources: [],
      popularPages: [],
    },
    search: {
      state: "unconnected",
      clicks: null,
      impressions: null,
      ctr: null,
      averagePosition: null,
      days: [],
    },
  };
}
const cache = new Map<string, { time: number; data: GoogleReports }>();
export async function googleReports(range: DateRange) {
  const config = googleConfiguration(),
    key = createHash("sha256")
      .update(JSON.stringify([config, range]))
      .digest("hex"),
    cached = cache.get(key);
  if (cached && Date.now() - cached.time < 900000) return cached.data;
  const data = await requestGoogleReports(config, range);
  if (cache.size >= 50) cache.delete(cache.keys().next().value!);
  cache.set(key, { time: Date.now(), data });
  return data;
}
type Config = ReturnType<typeof googleConfiguration>;
type Json = Record<string, unknown>;
export async function requestGoogleReports(
  config: Config,
  range: DateRange,
  request: typeof fetch = fetch,
  authorize?: (scope: string) => Promise<string>,
) {
  const data = emptyGoogleReports();
  const post = async (url: string, body: unknown, scope: string) => {
    const token = authorize
      ? await authorize(scope)
      : (
          await new JWT({
            email: config.email,
            key: config.key,
            scopes: [scope],
            transporterOptions: { timeout: 12000, retry: false },
          }).authorize()
        ).access_token;
    if (!token) throw Error("authorization");
    const r = await request(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!r.ok) throw Error("provider");
    return r.json();
  };
  await Promise.all([
    (async () => {
      if (!config.ga4) return;
      try {
        const metrics = [
            "totalUsers",
            "sessions",
            "keyEvents",
            "sessionKeyEventRate",
          ].map((name) => ({ name })),
          base = {
            dateRanges: [{ startDate: range.start, endDate: range.end }],
            metrics,
          };
        const r = await post(
          `https://analyticsdata.googleapis.com/v1beta/properties/${config.property}:batchRunReports`,
          {
            requests: [
              {
                ...base,
                dimensions: [{ name: "date" }],
                orderBys: [{ dimension: { dimensionName: "date" } }],
                limit: 93,
              },
              base,
              {
                dateRanges: base.dateRanges,
                dimensions: [{ name: "sessionDefaultChannelGroup" }],
                metrics: [{ name: "sessions" }],
                orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
                limit: 10,
              },
              {
                dateRanges: base.dateRanges,
                dimensions: [{ name: "pagePath" }],
                metrics: [{ name: "screenPageViews" }],
                orderBys: [
                  { metric: { metricName: "screenPageViews" }, desc: true },
                ],
                limit: 10,
              },
            ],
          },
          "https://www.googleapis.com/auth/analytics.readonly",
        );
        if (!Array.isArray(r.reports) || r.reports.length !== 4)
          throw Error("shape");
        for (const report of r.reports.slice(0, 2)) {
          if (
            !Array.isArray(report.metricHeaders) ||
            report.metricHeaders
              .map((v: { name: string }) => v.name)
              .join(",") !== "totalUsers,sessions,keyEvents,sessionKeyEventRate"
          )
            throw Error("shape");
        }
        if (
          r.reports[2].metricHeaders
            ?.map((v: { name: string }) => v.name)
            .join(",") !== "sessions" ||
          r.reports[3].metricHeaders
            ?.map((v: { name: string }) => v.name)
            .join(",") !== "screenPageViews"
        )
          throw Error("shape");
        const number = (row: Json, index: number) => {
          if (
            Object.keys(row).length &&
            !(row.metricValues as unknown[])?.[index]
          )
            throw Error("metric");
          const raw =
              (row.metricValues as { value: string }[] | undefined)?.[index]
                ?.value ?? "0",
            value = Number(raw);
          if (!Number.isFinite(value) || value < 0) throw Error("metric");
          return value;
        };
        const totals = r.reports[1].rows?.[0] || {};
        if (number(totals, 3) > 1) throw Error("metric");
        data.ga4 = {
          state: "connected",
          users: number(totals, 0),
          sessions: number(totals, 1),
          keyEvents: number(totals, 2),
          sessionKeyEventRate: number(totals, 3),
          sources: (r.reports[2].rows || []).map((row: Json) => {
            const channel = (row.dimensionValues as { value: string }[])?.[0]
              ?.value;
            if (typeof channel !== "string" || channel.length > 200)
              throw Error("shape");
            return { channel, sessions: number(row, 0) };
          }),
          popularPages: (r.reports[3].rows || []).map((row: Json) => {
            const path = (row.dimensionValues as { value: string }[])?.[0]
              ?.value;
            if (
              typeof path !== "string" ||
              !/^\/(?:[a-z0-9-]+\/)*[a-z0-9-]*$/i.test(path) ||
              path.length > 250
            )
              throw Error("shape");
            return { path, views: number(row, 0) };
          }),
          days: (r.reports[0].rows || []).map((row: Json) => {
            const date = (row.dimensionValues as { value: string }[])[0].value;
            const day =
              date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6);
            if (
              !/^\d{8}$/.test(date) ||
              day < range.start ||
              day > range.end ||
              new Date(day).toISOString().slice(0, 10) !== day
            )
              throw Error("date");
            return {
              day:
                date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6),
              users: number(row, 0),
              sessions: number(row, 1),
              keyEvents: number(row, 2),
            };
          }),
        };
      } catch {
        data.ga4.state = "unavailable";
      }
    })(),
    (async () => {
      if (!config.search) return;
      try {
        const r = await post(
          `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(config.site)}/searchAnalytics/query`,
          {
            startDate: range.start,
            endDate: range.end,
            dimensions: ["date"],
            type: "web",
            rowLimit: 100,
          },
          "https://www.googleapis.com/auth/webmasters.readonly",
        );
        if (!r || !Array.isArray(r.rows || [])) throw Error("shape");
        const days = (r.rows || []).map(
          (row: {
            keys: string[];
            clicks: number;
            impressions: number;
            position: number;
          }) => {
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(row.keys?.[0]) ||
              ![row.clicks, row.impressions, row.position].every(
                (n) => Number.isFinite(n) && n >= 0,
              ) ||
              row.clicks > row.impressions ||
              row.keys[0] < range.start ||
              row.keys[0] > range.end ||
              new Date(row.keys[0]).toISOString().slice(0, 10) !== row.keys[0]
            )
              throw Error("metric");
            return {
              day: row.keys[0],
              clicks: row.clicks,
              impressions: row.impressions,
              position: row.position,
            };
          },
        );
        data.search = {
          state: "connected",
          days,
          clicks: days.reduce(
            (n: number, r: { clicks: number }) => n + r.clicks,
            0,
          ),
          impressions: days.reduce(
            (n: number, r: { impressions: number }) => n + r.impressions,
            0,
          ),
          ctr:
            days.reduce(
              (n: number, r: { impressions: number }) => n + r.impressions,
              0,
            ) > 0
              ? days.reduce(
                  (n: number, r: { clicks: number }) => n + r.clicks,
                  0,
                ) /
                days.reduce(
                  (n: number, r: { impressions: number }) => n + r.impressions,
                  0,
                )
              : 0,
          averagePosition:
            days.reduce(
              (n: number, r: { impressions: number }) => n + r.impressions,
              0,
            ) > 0
              ? days.reduce(
                  (n: number, r: { impressions: number; position: number }) =>
                    n + r.impressions * r.position,
                  0,
                ) /
                days.reduce(
                  (n: number, r: { impressions: number }) => n + r.impressions,
                  0,
                )
              : null,
        };
      } catch {
        data.search.state = "unavailable";
      }
    })(),
  ]);
  return data;
}
export function isPublicPageSpeedOrigin(value: string) {
  try {
    const url = new URL(value),
      host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      host.includes(".") &&
      !isIP(host) &&
      !/(^|\.)(localhost|local|internal|invalid|test|example)$/.test(host)
    );
  } catch {
    return false;
  }
}
export async function pageSpeed(
  path: string,
  strategy: "mobile" | "desktop" = "mobile",
) {
  const config = googleConfiguration(),
    origin = publicOrigin();
  if (!config.pagespeed || !isPublicPageSpeedOrigin(origin))
    throw new BackendError("not_configured", 409);
  const url = new URL(
    "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  url.searchParams.set("url", origin + path);
  url.searchParams.set("key", process.env.PAGESPEED_API_KEY!);
  url.searchParams.set("strategy", strategy);
  for (const category of [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
  ])
    url.searchParams.append("category", category);
  const r = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new BackendError("provider_unavailable", 503);
  const d = await r.json(),
    metrics = d.loadingExperience?.metrics || {};
  const lab = (name: string) => {
    const n = d.lighthouseResult?.categories?.[name]?.score;
    return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1
      ? Math.round(n * 100)
      : null;
  };
  const field = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : null;
  return {
    checkedAt: new Date().toISOString(),
    strategy,
    labScore: lab("performance"),
    labCategories: {
      performance: lab("performance"),
      accessibility: lab("accessibility"),
      bestPractices: lab("best-practices"),
      seo: lab("seo"),
    },
    field: {
      lcp: field(metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile),
      inp: field(metrics.INTERACTION_TO_NEXT_PAINT?.percentile),
      cls:
        field(metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile) !== null
          ? metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100
          : null,
    },
    note: "Laboratorul Lighthouse este separat de datele reale CrUX p75. Lipsa datelor CrUX nu înseamnă scor zero. URL transmis către Google numai la solicitare explicită.",
  };
}
