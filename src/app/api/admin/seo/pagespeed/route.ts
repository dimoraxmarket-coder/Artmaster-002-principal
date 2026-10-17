import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import {
  boundedJSON,
  requireSameOrigin,
  errorResponse,
} from "@/lib/server/guards";
import { seoPages } from "@/lib/server/seo-center";
import { pageSpeed } from "@/lib/server/google-reporting";
import { getStorage } from "@/lib/server/storage";
import { BackendError } from "@/lib/server/config";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireActor(request, "editor");
    const input = z
      .object({
        path: z.string().max(250),
        strategy: z.enum(["mobile", "desktop"]).default("mobile"),
      })
      .strict()
      .safeParse(await boundedJSON(request, 1024));
    if (!input.success || !(await seoPages()).includes(input.data.path))
      throw new BackendError("invalid_input", 400);
    if (!(await getStorage().consumeRate(`pagespeed:${actor.id}`, 10, 3600000)))
      throw new BackendError("rate_limited", 429);
    const data = await pageSpeed(input.data.path, input.data.strategy);
    await requireActor(request, "editor");
    await getStorage().audit(actor, "seo.pagespeed", input.data.path);
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
