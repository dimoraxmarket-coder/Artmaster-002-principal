import { PublicLink as Link, PublicImage as Image } from "./public-runtime";
import type { Locale, SiteContent } from "@/lib/content/types";
import { serviceResources } from "@/lib/content/service-resources";
import { localizedPath } from "@/lib/site";
import { t } from "@/lib/i18n";

const headings = {
  ro: { projects: "Proiecte realizate pentru această direcție", guides: "Ghiduri utile pentru pregătirea proiectului" },
  ru: { projects: "Выполненные проекты по этому направлению", guides: "Полезные руководства для подготовки проекта" },
  en: { projects: "Completed projects in this area", guides: "Guides to help you prepare your project" },
};

export function ServiceResources({ content, slug, locale }: { content: SiteContent; slug: string; locale: Locale }) {
  const { projects, articles } = serviceResources(content, slug), copy = headings[locale];
  return <>
    {projects.length > 0 && <section className="section container" aria-label={copy.projects}>
      <h2>{copy.projects}</h2>
      <div className="card-grid">{projects.slice(0, 6).map((item) => <Link className="card" key={item.slug} href={localizedPath(locale, `portofoliu/${item.slug}`)}>
        <div className="card-media"><Image src={item.image} alt={item.title[locale]} fill sizes="(max-width:600px) 100vw,(max-width:1000px) 50vw,33vw" /></div>
        <div className="card-body"><h3>{item.title[locale]}</h3><p>{item.summary[locale]}</p><span className="card-action">{t(locale).common.details} ↗</span></div>
      </Link>)}</div>
    </section>}
    {articles.length > 0 && <section className="section container" aria-label={copy.guides}>
      <h2>{copy.guides}</h2>
      <div className="card-grid">{articles.slice(0, 6).map((item) => <article className="card editorial-card" key={item.slug}>
        <div className="card-body"><h3><Link href={localizedPath(locale, `blog/${item.slug}`)}>{item.title[locale]}</Link></h3><p>{item.summary[locale]}</p><Link className="card-action" href={localizedPath(locale, `blog/${item.slug}`)}>{t(locale).common.readGuide} ↗</Link></div>
      </article>)}</div>
    </section>}
  </>;
}
