import { requireActor } from "@/lib/server/auth";
import {
  boundedBody,
  requireSameOrigin,
  errorResponse,
  requestBucket,
} from "@/lib/server/guards";
import { BackendError } from "@/lib/server/config";
import { getStorage } from "@/lib/server/storage";
import { inventory, mediaQuerySchema } from "@/lib/server/media-inventory";
import { storeMedia } from "@/lib/server/media";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const actor = await requireActor(request, "editor");
    if (
      !(await getStorage().consumeRate(
        `media:${actor.id}:${requestBucket(request)}`,
        30,
        3600000,
      ))
    )
      throw new BackendError("rate_limited", 429);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
      throw new BackendError("invalid_input", 400);
    const bytes = await boundedBody(request, 6 * 1024 * 1024);
    const form = await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    if (
      [...form.keys()].some((key) => key !== "file" && key !== "purpose") ||
      form.getAll("purpose").length > 1 ||
      form.getAll("file").length !== 1
    )
      throw new BackendError("invalid_input", 400);
    const file = form.get("file");
    if (!file || typeof file === "string")
      throw new BackendError("invalid_file", 400);
    const purpose = form.get("purpose") ?? "photo";
    if (purpose !== "photo" && purpose !== "artwork")
      throw new BackendError("invalid_input", 400);
    const result = await storeMedia(file, actor, purpose);
    await getStorage().audit(actor, "media.upload", result.url);
    return Response.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const query = mediaQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) throw new BackendError("invalid_input", 400);
    return Response.json(await inventory(query.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
