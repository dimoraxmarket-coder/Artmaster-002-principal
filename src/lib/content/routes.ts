import type { SiteContent } from "./types";

export const sectionPaths = [
  "", "servicii", "echipamente", "portofoliu", "despre-noi", "contact",
  "solicita-oferta", "intrebari-frecvente", "blog", "confidentialitate", "termeni", "cookies",
] as const;

// Stable existing URLs. Language prefixes are applied by callers; no slug migration.
export function contentPaths(
  content: SiteContent,
  { drafts = false, concepts = true }: { drafts?: boolean; concepts?: boolean } = {},
) {
  return [
    ...sectionPaths,
    ...content.services.map((s) => `servicii/${s.slug}`),
    ...content.equipment.filter((e) => drafts || e.catalog?.published !== false).map((e) => `echipamente/${e.slug}`),
    ...content.projects.filter((p) => (drafts || p.published) && (concepts || p.kind === "real")).map((p) => `portofoliu/${p.slug}`),
    ...content.articles.filter((a) => drafts || a.published).map((a) => `blog/${a.slug}`),
  ];
}

export function renameSeoPath(content: SiteContent, from: string, to: string) {
  if (content.seo) content.seo = content.seo.map((entry) => entry.path === from ? { ...entry, path: to } : entry);
}
