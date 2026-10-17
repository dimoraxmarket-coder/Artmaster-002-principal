import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import {
  boundedJSON,
  requireSameOrigin,
  errorResponse,
} from "@/lib/server/guards";
import { auditPage } from "@/lib/server/seo-center";
import { getStorage } from "@/lib/server/storage";
import { BackendError } from "@/lib/server/config";
import { publishedFingerprint, recordSeoAudit } from "@/lib/server/seo-history";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireActor(request);
    const input = z
      .object({ path: z.string().max(250) })
      .strict()
      .safeParse(await boundedJSON(request, 1024));
    if (!input.success) throw new BackendError("invalid_input", 400);
    if (
      !(await getStorage().consumeRate(`seo-audit:${actor.id}`, 120, 3600000))
    )
      throw new BackendError("rate_limited", 429);
    const fingerprint = await publishedFingerprint();
    const data = await auditPage(input.data.path);
    const liveActor = await requireActor(request);
    await recordSeoAudit(data, liveActor, fingerprint);
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
