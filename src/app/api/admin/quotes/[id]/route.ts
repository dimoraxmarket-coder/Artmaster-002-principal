import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import {
  boundedJSON,
  requireSameOrigin,
  errorResponse,
} from "@/lib/server/guards";
import { changeQuote, quoteDetail, quoteChangeSchema } from "@/lib/server/crm";
import { BackendError } from "@/lib/server/config";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
async function quoteId(context: Context) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) throw new BackendError("not_found", 404);
  return id;
}
export async function GET(request: Request, context: Context) {
  try {
    await requireActor(request);
    const id = await quoteId(context),
      query = z
        .object({
          before: z.coerce
            .number()
            .int()
            .positive()
            .max(Number.MAX_SAFE_INTEGER)
            .optional(),
        })
        .strict()
        .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new BackendError("invalid_input", 400);
    return Response.json(await quoteDetail(id, query.data.before), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireActor(request, "editor"),
      id = await quoteId(context),
      input = quoteChangeSchema.safeParse(await boundedJSON(request, 20000));
    if (!input.success) throw new BackendError("invalid_input", 400);
    await changeQuote(id, input.data, actor);
    return Response.json(await quoteDetail(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
