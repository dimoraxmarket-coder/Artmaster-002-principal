// Application-specific structural checks, not Google's Rich Results validator.
export function structuredIssues(blocks: string[], origin: string): string[] {
  const issues: string[] = [];
  if (!blocks.length) return ["Lipsește JSON-LD."];
  const object = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const text = (v: unknown) => typeof v === "string" && !!v.trim();
  const localUrl = (v: unknown) => {
    try {
      const u = new URL(String(v));
      return u.origin === origin && !u.username && !u.password;
    } catch {
      return false;
    }
  };
  for (const [index, raw] of blocks.entries()) {
    try {
      const root: unknown = JSON.parse(raw);
      if (!object(root) || root["@context"] !== "https://schema.org") {
        issues.push(`Bloc ${index + 1}: context invalid.`);
        continue;
      }
      const nodes = root["@graph"] === undefined ? [root] : root["@graph"];
      if (!Array.isArray(nodes) || !nodes.length) {
        issues.push(`Bloc ${index + 1}: graph gol sau invalid.`);
        continue;
      }
      for (const node of nodes) {
        if (!object(node)) {
          issues.push("Nod JSON-LD invalid.");
          continue;
        }
        const types =
          typeof node["@type"] === "string" ? [node["@type"]] : node["@type"];
        if (!Array.isArray(types) || !types.length || !types.every(text)) {
          issues.push("Nod fără tip Schema.org.");
          continue;
        }
        if (node.url !== undefined && !localUrl(node.url))
          issues.push("URL de pagină diferit de originea site-ului.");
        for (const type of types) {
          if (
            ["Organization", "LocalBusiness", "WebSite", "Service"].includes(
              type,
            ) &&
            !text(node.name)
          )
            issues.push(`${type}: nume lipsă.`);
          if (
            type === "LocalBusiness" &&
            (!text(node.telephone) ||
              !object(node.address) ||
              !text(node.address.streetAddress) ||
              !text(node.address.addressCountry))
          )
            issues.push("LocalBusiness: verifică telefonul și adresa reală.");
          if (
            type === "Service" &&
            (!text(node.description) ||
              !localUrl(node.url) ||
              !object(node.provider) ||
              !localUrl(node.provider["@id"]))
          )
            issues.push("Service: descriere, URL sau provider lipsă.");
          if (type === "WebSite" && !localUrl(node.url))
            issues.push("WebSite: URL lipsă.");
          if (
            type === "Article" &&
            (!text(node.headline) ||
              !localUrl(node.mainEntityOfPage) ||
              !["ro", "ru", "en"].includes(String(node.inLanguage)))
          )
            issues.push("Article: headline, limbă sau URL lipsă.");
          if (type === "BreadcrumbList") {
            const items = node.itemListElement;
            if (
              !Array.isArray(items) ||
              items.length < 2 ||
              !items.every(
                (v, i) =>
                  object(v) &&
                  v["@type"] === "ListItem" &&
                  v.position === i + 1 &&
                  text(v.name) &&
                  localUrl(v.item),
              )
            )
              issues.push(
                "BreadcrumbList: poziții, nume sau URL-uri invalide.",
              );
          }
        }
      }
    } catch {
      issues.push(`Bloc ${index + 1}: JSON invalid.`);
    }
  }
  return [...new Set(issues)];
}
