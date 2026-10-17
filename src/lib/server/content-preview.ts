import { requireActor } from "./auth";
import { getStorage } from "./storage";
import { defaultContent } from "../content/defaults";
// No tokens, cookies that switch public rendering, global context, or cache entries.
export async function savedDraftPreview(request: Request) {
  await requireActor(request);
  const state = await getStorage().content();
  // The account/session may have been revoked while storage was being read.
  await requireActor(request);
  return {
    content: state.draft || state.published || defaultContent,
    version: state.version,
    hasDraft: !!state.draft,
  };
}
