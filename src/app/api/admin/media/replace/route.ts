import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import { BackendError } from "@/lib/server/config";
import {
  boundedJSON,
  requireSameOrigin,
  errorResponse,
} from "@/lib/server/guards";
import { replaceDraftMedia } from "@/lib/server/media-inventory";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireActor(request, "editor"),
      input = z
        .object({
          url: z.string().min(1).max(2048),
          replacementUrl: z
            .string()
            .regex(/^\/api\/media\/[a-f0-9-]{36}\.webp$/),
          expectedVersion: z.number().int().nonnegative(),
        })
        .strict()
        .safeParse(await boundedJSON(request, 8192));
    if (!input.success) throw new BackendError("invalid_input", 400);
    return Response.json(
      await replaceDraftMedia(
        input.data.url,
        input.data.replacementUrl,
        input.data.expectedVersion,
        actor,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
