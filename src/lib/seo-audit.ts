import { load } from "cheerio";
import type { SiteContent } from "./content/types";
import { structuredIssues } from "./structured-data";
export const SEO_FORMULA_VERSION = 2;
export const SEO_WEIGHTS: Record<string, number> = {
  title: 10,
  description: 8,
  canonical: 10,
  hreflang: 10,
  sitemap: 6,
  robots: 6,
  structured: 10,
  alt: 6,
  links: 8,
  indexing: 8,
  headings: 6,
  language: 4,
  social: 6,
  viewport: 2,
};
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
  severity: "critical" | "warning" | "info";
  id: string;
  label: string;
  weight: number;
  status: "pass" | "fail" | "unavailable";
  detail: string;
  recommendation: string;
};
export type PageAudit = {
  formulaVersion: number;
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
      severity: pass
        ? "info"
        : ["canonical", "hreflang", "structured", "language"].includes(id) ||
            (indexable && ["robots", "indexing"].includes(id))
          ? "critical"
          : "warning",
      id,
      label,
      weight: SEO_WEIGHTS[id],
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
    description.length >= 50 &&
      description.length <= 180 &&
      $('meta[name="description"]').length === 1,
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
  const issues = structuredIssues(
    scripts.map((el) => $(el).text()),
    origin,
  );
  check(
    "structured",
    "Date structurate",
    issues.length === 0,
    `${scripts.length} blocuri JSON-LD · ${issues.join(" ") || "Sintaxă, tipuri, câmpuri și URL-uri verificate pentru schemele aplicației."}`,
    "Corectează structura și câmpurile necesare. Verificarea locală nu certifică eligibilitatea Rich Results sau adevărul informațiilor comerciale; validează separat cu Google și proprietarul.",
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
      if (!["https:", "http:"].includes(url.protocol)) {
        broken.add(href.slice(0, 200));
        continue;
      }
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
  const headings = ($("main").length ? $("main") : $("body"))
    .find("h1,h2,h3,h4,h5,h6")
    .toArray()
    .map((el) => Number(el.tagName.slice(1)));
  check(
    "headings",
    "Ierarhia titlurilor",
    headings.filter((v) => v === 1).length === 1 &&
      headings[0] === 1 &&
      headings.every((v, i) => i === 0 || v <= headings[i - 1] + 1),
    `${headings.filter((v) => v === 1).length} H1; ordinea nivelurilor: ${headings.join(" → ")}.`,
    "Păstrează un singur H1 și evită trecerea directă de la H1 la H3.",
  );
  const language = /^\/(ro|ru|en)(?:\/|$)/.exec(path)?.[1];
  check(
    "language",
    "Limba documentului",
    !!language && $("html").attr("lang") === language,
    `lang=${$("html").attr("lang") || "lipsește"}`,
    "Potrivește HTML lang cu limba URL-ului. Traducerile necesită și verificare editorială.",
  );
  check(
    "social",
    "Open Graph și Twitter",
    !!$('meta[property="og:title"]').attr("content") &&
      !!$('meta[property="og:description"]').attr("content") &&
      $('meta[property="og:url"]').attr("content") === origin + path &&
      !!$('meta[property="og:image"]').attr("content") &&
      $('meta[name="twitter:card"]').attr("content") === "summary_large_image",
    "Titlu, descriere, URL, imagine OG și card Twitter.",
    "Completează metadatele de distribuire; verifică vizual imaginea autorizată.",
  );
  check(
    "viewport",
    "Viewport mobil",
    /width=device-width/.test($('meta[name="viewport"]').attr("content") || ""),
    "Viewport responsiv, fără a pretinde un scor PageSpeed.",
    "Adaugă viewport width=device-width și testează layoutul pe mobil.",
  );
  return {
    formulaVersion: SEO_FORMULA_VERSION,
    path,
    score: checks.reduce((n, c) => n + (c.status === "pass" ? c.weight : 0), 0),
    checkedAt: new Date().toISOString(),
    checks,
    externalLinksUnchecked: external.size,
    brokenLinks: [...broken],
    scope:
      "Formula v2: 14 verificări ponderate, suma 100; puncte numai pentru verificări trecute. HTML public randat + sitemap/robots ale aplicației. Euristici locale, fără garanție de ranking, Rich Results sau indexare Google.",
  };
}
