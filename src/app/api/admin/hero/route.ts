import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import { BackendError } from "@/lib/server/config";
import {
  boundedBody,
  errorResponse,
  requireSameOrigin,
} from "@/lib/server/guards";
import { getStorage } from "@/lib/server/storage";
import { storeMedia, storeHeroVideo } from "@/lib/server/media";
export const runtime = "nodejs";
const cropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().min(0.01).max(1),
    height: z.number().min(0.01).max(1),
  })
  .strict();
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireActor(request, "editor");
    if (!(await getStorage().consumeRate(`hero:${actor.id}`, 20, 3600000)))
      throw new BackendError("rate_limited", 429);
    const type = request.headers.get("content-type") || "";
    if (!type.startsWith("multipart/form-data"))
      throw new BackendError("invalid_input", 400);
    const bytes = await boundedBody(request, 21 * 1024 * 1024),
      form = await new Response(bytes, {
        headers: { "Content-Type": type },
      }).formData();
    if (
      [...form.keys()].some(
        (key) => !["file", "crop", "rightsConfirmed"].includes(key),
      ) ||
      form.getAll("file").length !== 1 ||
      form.getAll("crop").length > 1 ||
      form.getAll("rightsConfirmed").length !== 1 ||
      form.get("rightsConfirmed") !== "true"
    )
      throw new BackendError("invalid_input", 400);
    const file = form.get("file");
    if (!file || typeof file === "string")
      throw new BackendError("invalid_file", 400);
    let crop: z.infer<typeof cropSchema> | undefined;
    if (form.has("crop")) {
      try {
        crop = cropSchema.parse(JSON.parse(String(form.get("crop"))));
      } catch {
        throw new BackendError("invalid_input", 400);
      }
    }
    if (file.type.startsWith("video/") && crop)
      throw new BackendError("invalid_input", 400);
    const result = file.type.startsWith("video/")
      ? await storeHeroVideo(file, actor)
      : await storeMedia(file, actor, crop);
    await getStorage().audit(actor, "hero.upload", result.url);
    return Response.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
