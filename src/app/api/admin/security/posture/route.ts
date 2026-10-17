import { requireActor } from "@/lib/server/auth";
import { securityPosture } from "@/lib/server/security-posture";
import { errorResponse } from "@/lib/server/guards";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request, "admin");
    const data = await securityPosture(actor);
    await requireActor(request, "admin");
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
