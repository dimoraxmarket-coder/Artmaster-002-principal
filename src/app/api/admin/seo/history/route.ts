import { requireActor } from "@/lib/server/auth";
import { seoHistory } from "@/lib/server/seo-history";
import { errorResponse } from "@/lib/server/guards";
import { BackendError } from "@/lib/server/config";
import { getStorage } from "@/lib/server/storage";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (
      !(await getStorage().consumeRate(`seo-history:${actor.id}`, 120, 3600000))
    )
      throw new BackendError("rate_limited", 429);
    const query = new URL(request.url).searchParams;
    if (
      [...query.keys()].some((k) => k !== "path") ||
      query.getAll("path").length > 1
    )
      throw new BackendError("invalid_input", 400);
    const data = await seoHistory(query.get("path") || "/ro");
    await requireActor(request);
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
