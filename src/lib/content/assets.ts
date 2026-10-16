import type { SiteContent } from "./types";
export function contentAssets(content: SiteContent) {
  const urls = [
    ...content.services,
    ...content.equipment,
    ...content.projects,
  ].map((item) => item.image);
  for (const asset of [content.heroMedia?.desktop, content.heroMedia?.mobile])
    if (asset) {
      urls.push(asset.image);
      if (asset.video) urls.push(asset.video);
    }
  return urls;
}
export function publicContent(content: SiteContent): SiteContent {
  return {
    ...content,
    equipment: content.equipment
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.catalog?.published !== false)
      .sort((a, b) => (a.e.catalog?.order ?? a.i) - (b.e.catalog?.order ?? b.i))
      .map(({ e }) => e),
  };
}
export const isVideo = (url: string) => /\.(mp4|webm)$/.test(url);
export const privateMedia = (url: string) =>
  url.replace(/^\/api\/media\//, "/api/admin/media/");
