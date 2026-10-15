import { requireActor } from "./auth";
import { getStorage } from "./storage";
import { defaultContent } from "../content/defaults";
// No tokens, cookies that switch public rendering, global context, or cache entries.
export async function savedDraftPreview(request: Request) {
  await requireActor(request);
  const state = await getStorage().content();
  return {
    content: state.draft || state.published || defaultContent,
    version: state.version,
    hasDraft: !!state.draft,
  };
}
