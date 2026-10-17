import type { SiteContent } from "./types";

/** Explicit publication checks remain necessary when rendering a saved draft preview. */
export function serviceResources(content: SiteContent, slug: string) {
  return {
    projects: content.projects.filter((item) => item.published && item.kind === "real" && item.serviceSlugs.includes(slug)),
    articles: content.articles.filter((item) => item.published && item.serviceSlugs.includes(slug)),
  };
}
