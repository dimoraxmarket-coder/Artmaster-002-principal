import { t } from "../i18n";
import { localizedSeoCopy } from "../seo-content";
import { websiteCopy } from "./page-copy";
import { normalizeSeoSeed } from "./seo-text";
import type { Locale, Localized, PageSeo, SiteContent } from "./types";

export function metadataDescription(summary: string, detail = summary) {
  return summary.trim().length < 50 && detail.trim().length >= 50
    ? detail.trim().slice(0, 177).replace(/\s+\S*$/, "") + "…"
    : summary;
}

function defaults(content: SiteContent, path: string, locale: Locale) {
  const ui = t(locale), [section, slug] = path.split("/");
  if (slug) {
    const entries = ({ servicii: content.services, echipamente: content.equipment, portofoliu: content.projects, blog: content.articles } as const);
    const item = entries[section as keyof typeof entries]?.find((v) => v.slug === slug);
    if (item) return localizedSeoCopy(locale, path, item.title[locale], metadataDescription(item.summary[locale], "description" in item ? item.description[locale] : item.paragraphs[locale].join(" ")));
  }
  const copy = websiteCopy(content);
  const text: Record<string, { title: string; description: string }> = {
    "": { title: `${copy.hero.title[locale]} ${copy.hero.accent[locale]}`, description: copy.hero.description[locale] },
    servicii: { title: ui.services.title, description: ui.services.description },
    echipamente: { title: ui.equipment.title, description: ui.equipment.description },
    portofoliu: { title: ui.portfolio.title, description: ui.portfolio.description },
    "despre-noi": { title: copy.about.title[locale], description: copy.about.summary[locale] },
    contact: { title: ui.contact.title, description: ui.contact.description },
    blog: { title: ui.blog.title, description: ui.blog.description },
    "intrebari-frecvente": { title: ui.nav.faq, description: ui.blog.description },
    "solicita-oferta": { title: ui.nav.quote, description: ui.contact.formDescription },
    confidentialitate: { title: ({ ro: "Politica de confidențialitate", ru: "Политика конфиденциальности", en: "Privacy policy" })[locale], description: "" },
    termeni: { title: ({ ro: "Condiții de utilizare", ru: "Условия использования", en: "Terms of use" })[locale], description: "" },
    cookies: { title: ({ ro: "Politica privind cookie-urile", ru: "Политика файлов cookie", en: "Cookie policy" })[locale], description: "" },
  };
  const entry = text[path] || { title: path, description: "" };
  return localizedSeoCopy(locale, path, entry.title, entry.description);
}

function trimWords(value: string, max: number) {
  const text = normalizeSeoSeed(value);
  return text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, "") || text.slice(0, max);
}

// An editable starting point, never saved/published automatically.
export function seedPageSeo(content: SiteContent, path: string): PageSeo {
  const title = {} as Localized, description = {} as Localized;
  for (const locale of ["ro", "ru", "en"] as const) {
    const copy = defaults(content, path, locale);
    title[locale] = trimWords(copy.title, 57) + (copy.title.includes("ARTMASTER") ? "" : " | ARTMASTER");
    const fallback = ({
      ro: "Consultă informațiile paginii și discută cerințele proiectului cu ARTMASTER înainte de ofertare.",
      ru: "Ознакомьтесь с информацией страницы и обсудите требования проекта с ARTMASTER до расчёта предложения.",
      en: "Read the page information and discuss your project requirements with ARTMASTER before requesting a quote.",
    })[locale];
    description[locale] = trimWords(copy.description.length >= 50 ? copy.description : `${copy.description} ${fallback}`, 180);
  }
  return { path, title, description };
}

export function serviceMetadata(content: SiteContent, slug: string, locale: Locale) {
  const path = `servicii/${slug}`, override = content.seo?.find((entry) => entry.path === path);
  if (override) return { title: override.title[locale], description: override.description[locale] };
  const copy = defaults(content, path, locale);
  return { ...copy, title: `${copy.title} | ARTMASTER` };
}
