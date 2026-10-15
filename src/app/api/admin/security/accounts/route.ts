import { requireSecurityContext } from "@/lib/server/auth";
import { accountQuerySchema, listAccounts } from "@/lib/server/security";
import { BackendError } from "@/lib/server/config";
import { errorResponse } from "@/lib/server/guards";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const context = await requireSecurityContext(request),
      query = accountQuerySchema.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
    if (!query.success) throw new BackendError("invalid_input", 400);
    return Response.json(await listAccounts(context, query.data), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
