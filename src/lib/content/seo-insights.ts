import { isConceptImage } from "../media";
import { locales } from "./types";
import type { Locale, SiteContent } from "./types";
import { serviceMetadata } from "./seo";
import { serviceResources } from "./service-resources";

export type ContentInsight = {
  path: string;
  locale: Locale;
  name: string;
  title: string;
  description: string;
  words: number;
  questions: number;
  applications: number;
  quoteHints: number;
  projects: number;
  guides: number;
  issues: { id: string; detail: string; recommendation: string }[];
};
export function serviceContentInsights(content: SiteContent): ContentInsight[] {
  const rows = content.services.flatMap((service) => locales.map((locale) => {
    const metadata = serviceMetadata(content, service.slug, locale), resources = serviceResources(content, service.slug);
    const text = [service.title[locale], service.summary[locale], service.description[locale], ...service.applications[locale], ...service.quoteHints[locale], ...service.faqs.flatMap((faq) => [faq.question[locale], faq.answer[locale]])].join(" ");
    const words = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length || 0;
    const issues: ContentInsight["issues"] = [];
    if (metadata.title.length < 15 || metadata.title.length > 70) issues.push({ id: "title-length", detail: `Titlu de ${metadata.title.length} caractere.`, recommendation: "Revizuiește titlul în Content Studio → Metadate SEO. Intervalul 15–70 este orientativ, nu o limită Google." });
    if (metadata.description.length < 50 || metadata.description.length > 180) issues.push({ id: "description-length", detail: `Descriere de ${metadata.description.length} caractere.`, recommendation: "Descrie concret serviciul și următorul pas. Intervalul 50–180 este orientativ; Google poate rescrie fragmentul." });
    if (words < 180) issues.push({ id: "content-review", detail: `${words} cuvinte în câmpurile serviciului.`, recommendation: "Verifică dacă răspunzi întrebărilor reale despre utilizare, fișiere și ofertare. Pragul editorial nu este factor de clasare și nu justifică text de umplutură." });
    if (!service.faqs.length) issues.push({ id: "faq", detail: "Nicio întrebare specifică serviciului.", recommendation: "Adaugă întrebări reale și răspunsuri confirmate în Content Studio." });
    if (!resources.projects.length) issues.push({ id: "real-project", detail: "Niciun proiect real publicat și asociat.", recommendation: "Adaugă o lucrare proprie verificată, cu acord pentru publicare. Conceptele nu sunt prezentate drept dovezi." });
    if (!resources.articles.length) issues.push({ id: "guide", detail: "Niciun ghid publicat asociat.", recommendation: "Asociază un ghid util în Content Studio. Linkul va apărea automat după publicare." });
    if (isConceptImage(service.image) || service.image.endsWith(".svg")) issues.push({ id: "illustration", detail: "Imagine de concept sau ilustrație, nu dovadă fotografică verificată.", recommendation: "Păstrează eticheta. Înlocuiește cu o fotografie proprie adecvată prin Media Studio, după verificarea drepturilor." });
    return { path: `/${locale}/servicii/${service.slug}`, locale, name: service.title[locale], ...metadata, words, questions: service.faqs.length, applications: service.applications[locale].length, quoteHints: service.quoteHints[locale].length, projects: resources.projects.length, guides: resources.articles.length, issues };
  }));
  for (const row of rows) {
    for (const [field, label] of [["title", "titlu"], ["description", "descriere"]] as const) {
      const normalized = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase(row.locale);
      const duplicates = rows.filter((other) => other !== row && other.locale === row.locale && normalized(other[field]) === normalized(row[field]));
      if (duplicates.length) row.issues.push({ id: `duplicate-${field}`, detail: `Același ${label} pe ${duplicates.map((other) => other.path).join(", ")}.`, recommendation: "Scrie metadate distincte care descriu intenția și conținutul fiecărui serviciu; evită pagini aproape identice." });
    }
  }
  return rows;
}
