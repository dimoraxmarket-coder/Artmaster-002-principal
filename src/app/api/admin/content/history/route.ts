import { requireActor } from "@/lib/server/auth";
import { BackendError } from "@/lib/server/config";
import { errorResponse } from "@/lib/server/guards";
import {
  contentHistory,
  historyQuerySchema,
} from "@/lib/server/content-history";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireActor(request);
    const query = historyQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) throw new BackendError("invalid_input", 400);
    return Response.json(await contentHistory(query.data), {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
