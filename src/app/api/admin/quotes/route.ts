import { requireActor } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/guards";
import { BackendError } from "@/lib/server/config";
import { queryQuotes, quoteQuerySchema } from "@/lib/server/crm";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireActor(request);
    const input = quoteQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!input.success) throw new BackendError("invalid_input", 400);
    return Response.json(await queryQuotes(input.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
