import { requireActor } from "@/lib/server/auth";
import { BackendError } from "@/lib/server/config";
import { errorResponse } from "@/lib/server/guards";
import { getStorage } from "@/lib/server/storage";
import { defaultContent } from "@/lib/content/defaults";
import { publicContent } from "@/lib/content/assets";
import { serviceContentInsights } from "@/lib/content/seo-insights";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request), store = getStorage();
    if (new URL(request.url).search) throw new BackendError("invalid_input", 400);
    if (!(await store.consumeRate(`seo-content:${actor.id}`, 60, 3600000))) throw new BackendError("rate_limited", 429);
    const state = await store.content();
    const rows = serviceContentInsights(publicContent(state.published || defaultContent));
    await requireActor(request);
    return Response.json({ checkedAt: new Date().toISOString(), version: state.version, source: state.published ? "published" : "repository-defaults", rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
