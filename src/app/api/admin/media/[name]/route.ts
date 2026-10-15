import { z } from "zod";
import { archiveMedia } from "@/lib/server/media-inventory";
import { BackendError } from "@/lib/server/config";
import { requireSameOrigin, boundedJSON } from "@/lib/server/guards";
import { requireActor } from "@/lib/server/auth";
import { readMedia } from "@/lib/server/media";
import { errorResponse } from "@/lib/server/guards";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    await requireActor(request);
    const { name } = await params,
      bytes = await readMedia(name);
    return new Response(Uint8Array.from(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    requireSameOrigin(request);
    const actor = await requireActor(request, "admin"),
      { name } = await params;
    if (
      !name.endsWith(".webp") ||
      !z.uuid().safeParse(name.slice(0, -5)).success
    )
      throw new BackendError("not_found", 404);
    const input = z
      .object({ confirm: z.literal(true) })
      .strict()
      .safeParse(await boundedJSON(request, 1024));
    if (!input.success) throw new BackendError("invalid_input", 400);
    await archiveMedia(`/api/media/${name}`, actor);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
