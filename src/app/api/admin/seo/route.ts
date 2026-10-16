import { requireActor } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/guards";
import { BackendError } from "@/lib/server/config";
import {
  conversionDays,
  dateRangeSchema,
  defaultRange,
  seoPages,
} from "@/lib/server/seo-center";
import {
  googleConfiguration,
  googleReports,
} from "@/lib/server/google-reporting";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    const params = Object.fromEntries(new URL(request.url).searchParams),
      parsed = dateRangeSchema.safeParse(
        Object.keys(params).length ? params : defaultRange(),
      );
    if (!parsed.success) throw new BackendError("invalid_input", 400);
    const { getStorage } = await import("@/lib/server/storage");
    if (
      !(await getStorage().consumeRate(`seo-report:${actor.id}`, 60, 3600000))
    )
      throw new BackendError("rate_limited", 429);
    const [days, pages, google] = await Promise.all([
      conversionDays(parsed.data),
      seoPages(),
      googleReports(parsed.data),
    ]);
    await requireActor(request);
    return Response.json(
      {
        range: parsed.data,
        timezone: "UTC",
        days,
        submissions: days.reduce((n, d) => n + d.count, 0),
        pages,
        google,
        pagespeedConfigured: googleConfiguration().pagespeed,
        cacheMinutes: 15,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
