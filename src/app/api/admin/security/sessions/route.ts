import { requireSecurityContext } from "@/lib/server/auth";
import {
  sessionQuerySchema,
  listSessions,
  revokeSchema,
  revokeSessions,
} from "@/lib/server/security";
import { BackendError } from "@/lib/server/config";
import {
  boundedJSON,
  requireSameOrigin,
  errorResponse,
} from "@/lib/server/guards";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const context = await requireSecurityContext(request),
      query = sessionQuerySchema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
    if (!query.success) throw new BackendError("invalid_input", 400);
    return Response.json(await listSessions(context, query.data), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const context = await requireSecurityContext(request),
      input = revokeSchema.safeParse(await boundedJSON(request, 2048));
    if (!input.success) throw new BackendError("invalid_input", 400);
    return Response.json(await revokeSessions(context, input.data), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
