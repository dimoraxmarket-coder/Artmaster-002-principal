import type { SiteContent, ManagedPartner } from "./types";

export function publishablePartner(partner: ManagedPartner) {
  return (
    partner.status === "published" &&
    partner.identity === "confirmed" &&
    partner.relationshipConfirmed
  );
}
// One reference definition for inventory, replacement, archival and restoration.
// Keep hidden/archived partner references: history and future reactivation must remain safe.
export function contentAssets(content: SiteContent) {
  const refs: {
    image: string;
    section: string;
    slug: string;
    title: string;
  }[] = [];
  for (const section of ["services", "equipment", "projects"] as const)
    for (const item of content[section])
      refs.push({
        image: item.image,
        section,
        slug: item.slug,
        title: item.title.ro,
      });
  for (const [size, asset] of Object.entries(content.heroMedia || {}))
    if (asset) {
      refs.push({
        image: asset.image,
        section: "hero",
        slug: size,
        title: `Hero ${size}`,
      });
      if (asset.video)
        refs.push({
          image: asset.video,
          section: "hero",
          slug: size,
          title: `Hero video ${size}`,
        });
    }
  if (content.banner)
    for (const size of ["desktop", "mobile"] as const) {
      const asset = content.banner[size];
      if (asset)
        refs.push({
          image: asset.image,
          section: "banner",
          slug: size,
          title: `Banner · ${size}`,
        });
    }
  for (const partner of content.partners || [])
    if (partner.image)
      refs.push({
        image: partner.image,
        section: "partners",
        slug: partner.slug,
        title: partner.name,
      });
  return refs;
}
export function publishedImageUrls(content: SiteContent) {
  return [
    ...content.services.map((item) => item.image),
    ...content.equipment
      .filter((item) => item.catalog?.published !== false)
      .map((item) => item.image),
    ...content.projects
      .filter((item) => item.published)
      .map((item) => item.image),
    ...(!content.banner?.enabled
      ? [content.heroMedia?.desktop, content.heroMedia?.mobile].flatMap(
          (asset) =>
            asset ? [asset.image, ...(asset.video ? [asset.video] : [])] : [],
        )
      : []),
    ...(content.banner?.enabled
      ? [
          content.banner.desktop.image,
          ...(content.banner.mobile ? [content.banner.mobile.image] : []),
        ]
      : []),
    ...(content.partners || [])
      .filter(publishablePartner)
      .filter((p) => p.rights !== "unverified")
      .flatMap((p) => (p.image ? [p.image] : [])),
  ];
}
