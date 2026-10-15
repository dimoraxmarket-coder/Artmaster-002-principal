import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import { BackendError } from "@/lib/server/config";
import {
  boundedJSON,
  errorResponse,
  requireSameOrigin,
} from "@/lib/server/guards";
import { contentSnapshot, restoreContent } from "@/lib/server/content-history";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
async function idFor(context: Context) {
  const { id } = await context.params;
  if (!/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id)))
    throw new BackendError("invalid_input", 400);
  return Number(id);
}
export async function GET(request: Request, context: Context) {
  try {
    await requireActor(request);
    return Response.json(await contentSnapshot(await idFor(context)), {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    requireSameOrigin(request);
    const actor = await requireActor(request, "editor");
    const input = z
      .object({
        version: z.number().int().nonnegative(),
        confirm: z.literal(true),
      })
      .strict()
      .safeParse(await boundedJSON(request, 1024));
    if (!input.success) throw new BackendError("invalid_input", 400);
    return Response.json(
      {
        ok: true,
        version: await restoreContent(
          await idFor(context),
          input.data.version,
          actor,
          request,
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
