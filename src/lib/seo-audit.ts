import { load } from "cheerio";
import type { SiteContent } from "./content/types";
export function publicPaths(c: SiteContent) {
  return [
    "",
    "servicii",
    "echipamente",
    "portofoliu",
    "despre-noi",
    "contact",
    "solicita-oferta",
    "intrebari-frecvente",
    "blog",
    "confidentialitate",
    "termeni",
    "cookies",
    ...c.services.map((s) => "servicii/" + s.slug),
    ...c.equipment
      .filter((e) => e.catalog?.published !== false)
      .map((e) => "echipamente/" + e.slug),
    ...c.projects.filter((p) => p.published).map((p) => "portofoliu/" + p.slug),
    ...c.articles.filter((a) => a.published).map((a) => "blog/" + a.slug),
  ].flatMap((path) =>
    ["ro", "ru", "en"].map((l) => `/${l}${path ? "/" + path : ""}`),
  );
}
export type SeoCheck = {
  id: string;
  label: string;
  weight: number;
  status: "pass" | "fail" | "unavailable";
  detail: string;
  recommendation: string;
};
export type PageAudit = {
  path: string;
  score: number;
  checkedAt: string;
  checks: SeoCheck[];
  externalLinksUnchecked: number;
  brokenLinks: string[];
  scope: string;
};
export function auditHTML(input: {
  path: string;
  origin: string;
  html: string;
  sitemap: string;
  robots: string;
  paths: string[];
  assetExists: (p: string) => boolean;
  indexable: boolean;
}): PageAudit {
  const { path, origin, html, sitemap, robots, paths, assetExists, indexable } =
      input,
    $ = load(html),
    checks: SeoCheck[] = [];
  const check = (
    id: string,
    label: string,
    pass: boolean,
    detail: string,
    recommendation: string,
  ) =>
    checks.push({
      id,
      label,
      weight: 10,
      status: pass ? "pass" : "fail",
      detail,
      recommendation,
    });
  const title = $("title").first().text().trim(),
    description =
      $('meta[name="description"]').first().attr("content")?.trim() || "";
  check(
    "title",
    "Titlu de pagină",
    title.length >= 15 && title.length <= 70 && $("title").length === 1,
    `${title.length} caractere · ${title}`,
    "Folosește un titlu unic, descriptiv, de 15–70 caractere. Limita este o euristică, nu o regulă Google.",
  );
  check(
    "description",
    "Meta description",
    description.length >= 50 && description.length <= 180,
    `${description.length} caractere · ${description}`,
    "Completează o descriere unică de 50–180 caractere; verifică formularea în fiecare limbă.",
  );
  check(
    "canonical",
    "Canonical",
    $('link[rel="canonical"]').length === 1 &&
      $('link[rel="canonical"]').attr("href") === origin + path,
    $('link[rel="canonical"]').attr("href") || "Lipsește",
    "Canonical trebuie să indice URL-ul absolut al acestei pagini, fără parametri.",
  );
  const suffix = path.replace(/^\/(ro|ru|en)/, "");
  check(
    "hreflang",
    "Hreflang RO / RU / EN",
    ["ro", "ru", "en", "x-default"].every(
      (l) =>
        $(`link[rel="alternate"][hreflang="${l}"]`).attr("href") ===
        origin + "/" + (l === "x-default" ? "ro" : l) + suffix,
    ),
    "Verificare alternates pentru cele trei limbi și x-default.",
    "Adaugă alternates reciproce pentru toate limbile și x-default, către pagini existente.",
  );
  const xml = load(sitemap, { xmlMode: true });
  check(
    "sitemap",
    "Sitemap",
    xml("loc")
      .toArray()
      .some((el) => xml(el).text() === origin + path),
    "URL căutat în sitemap.xml randat.",
    "Include URL-ul public în sitemap; exclude ciornele și paginile private.",
  );
  const rules = robots.split(/\r?\n/).map((l) => l.split("#")[0].trim());
  const blocked = rules.some((l) => /^Disallow:\s*\/\s*$/i.test(l));
  check(
    "robots",
    "Robots.txt",
    !!robots &&
      /User-agent:\s*\*/i.test(robots) &&
      !blocked &&
      !rules.some(
        (l) =>
          /^Disallow:/i.test(l) &&
          l.split(":").slice(1).join(":").trim() === path,
      ),
    blocked
      ? "Accesul crawlerelor este blocat global."
      : "Regulile robots de bază nu blochează pagina.",
    "Activează indexarea numai pentru originea de producție aprobată. Auditul interpretează regulile emise de această aplicație.",
  );
  const scripts = $('script[type="application/ld+json"]').toArray();
  let valid = scripts.length > 0;
  for (const el of scripts) {
    try {
      const d = JSON.parse($(el).text());
      if (
        !d ||
        (!d["@type"] && !d["@graph"]) ||
        d["@context"] !== "https://schema.org"
      )
        valid = false;
    } catch {
      valid = false;
    }
  }
  check(
    "structured",
    "Date structurate",
    valid,
    `${scripts.length} blocuri JSON-LD · sintaxă și context Schema.org.`,
    "Corectează JSON-LD și validează separat semantica în Google Rich Results Test.",
  );
  const images = $("img").toArray(),
    missing = images.filter((el) => $(el).attr("alt") === undefined).length;
  check(
    "alt",
    "Atribute alt",
    missing === 0,
    `${images.length} imagini; ${missing} fără alt. Alt gol este permis pentru imagini decorative.`,
    "Adaugă alt relevant imaginilor informative. Calitatea textului și caracterul decorativ necesită review uman.",
  );
  const broken = new Set<string>(),
    external = new Set<string>();
  for (const el of $("a[href]").toArray()) {
    const href = $(el).attr("href")!;
    if (/^(mailto:|tel:|viber:|whatsapp:|#)/i.test(href)) continue;
    try {
      const url = new URL(href, origin + path);
      if (url.origin !== origin) {
        external.add(url.origin + url.pathname);
        continue;
      }
      const target = url.pathname.replace(/\/$/, "") || "/";
      if (target === "/" || paths.includes(target) || assetExists(target))
        continue;
      broken.add(target);
    } catch {
      broken.add(href.slice(0, 200));
    }
  }
  check(
    "links",
    "Linkuri interne",
    broken.size === 0,
    `${broken.size} destinații interne inexistente; ${external.size} linkuri externe neverificate.`,
    "Corectează linkurile interne. URL-urile externe și fragmentele # nu sunt accesate sau certificate de acest audit.",
  );
  const noindex = $('meta[name="robots"]')
    .toArray()
    .some((el) => /noindex/i.test($(el).attr("content") || ""));
  check(
    "indexing",
    "Pregătire de indexare",
    indexable && origin.startsWith("https:") && !noindex,
    indexable && !noindex
      ? "Configurat pentru indexare; prezența în Google nu este verificată."
      : "Indexare dezactivată sau origine locală/staging.",
    "Păstrează noindex în staging/local. După aprobare verifică HTTPS, SITE_INDEXABLE și inspecția URL în Search Console.",
  );
  return {
    path,
    score: checks.reduce((n, c) => n + (c.status === "pass" ? c.weight : 0), 0),
    checkedAt: new Date().toISOString(),
    checks,
    externalLinksUnchecked: external.size,
    brokenLinks: [...broken],
    scope:
      "HTML public randat + sitemap/robots ale aplicației. 10 verificări × 10 puncte. Euristici locale, fără garanție de ranking sau indexare Google.",
  };
}
