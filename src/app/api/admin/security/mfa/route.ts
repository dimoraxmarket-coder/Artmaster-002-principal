import { verifiedMfaStatus } from "@/lib/server/auth";
import { listSessions, sessionQuerySchema } from "@/lib/server/security";
import { storageMode } from "@/lib/server/config";
import { errorResponse } from "@/lib/server/guards";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { context, count } = await verifiedMfaStatus(request),
      session = await listSessions(context, sessionQuerySchema.parse({}));
    return Response.json(
      {
        mode: storageMode(),
        aal: context.actor.aal,
        verifiedTotpFactors: count,
        freshUntil: session.freshUntil,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
