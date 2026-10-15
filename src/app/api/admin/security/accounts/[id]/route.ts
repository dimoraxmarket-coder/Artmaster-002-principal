import { z } from "zod";
import { requireSecurityContext } from "@/lib/server/auth";
import { accountChangeSchema, changeAccount } from "@/lib/server/security";
import { BackendError } from "@/lib/server/config";
import {
  boundedJSON,
  requireSameOrigin,
  errorResponse,
} from "@/lib/server/guards";
export const runtime = "nodejs";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireSameOrigin(request);
    const context = await requireSecurityContext(request),
      { id } = await params;
    if (!z.uuid().safeParse(id).success)
      throw new BackendError("not_found", 404);
    const input = accountChangeSchema.safeParse(
      await boundedJSON(request, 2048),
    );
    if (!input.success) throw new BackendError("invalid_input", 400);
    return Response.json(await changeAccount(context, id, input.data), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
