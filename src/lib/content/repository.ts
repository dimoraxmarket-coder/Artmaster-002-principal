import "server-only";
import { cache } from "react";
import { publicContent } from "./assets";
import { defaultContent } from "./defaults";
import type { SiteContent } from "./types";
import { getStorage } from "../server/storage";
import { BackendError } from "../server/config";
// Request-scoped memoization only: no cross-request cache of drafts or media rights.
export const getContent = cache(async (): Promise<SiteContent> => {
  try {
    return publicContent(
      (await getStorage().content()).published || defaultContent,
    );
  } catch (error) {
    // Public pages can use repository content while the production provider is not configured.
    // Other failures are reported without data, credentials, or user contact details.
    if (!(error instanceof BackendError && error.code === "unavailable"))
      console.error(
        "Published content unavailable; repository content selected.",
      );
    return defaultContent;
  }
});
