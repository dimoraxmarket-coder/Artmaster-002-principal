import { requireActor } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/guards";
import { staffDirectory } from "@/lib/server/crm";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireActor(request);
    return Response.json(
      { staff: await staffDirectory() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
