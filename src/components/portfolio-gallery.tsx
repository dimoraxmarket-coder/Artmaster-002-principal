'use client';

import { PublicLink as Link } from './public-runtime';
import { PublicImage as Image } from './public-runtime';
import { useId, useMemo, useState } from 'react';
import type { Locale, Project, Service } from '@/lib/content/types';
import { t } from '@/lib/i18n';
import { Icon } from './icons';

export function PortfolioGallery({ locale, projects, services }: { locale: Locale; projects: Project[]; services: Service[] }) {
  const ui = t(locale);
  const id = useId();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const publicProjects = useMemo(() => projects.filter(project => project.published), [projects]);
  const categories = services.filter(service => publicProjects.some(project => project.serviceSlugs.includes(service.slug)));
  const filtered = publicProjects.filter(project => (category === 'all' || project.serviceSlugs.includes(category)) && `${project.title[locale]} ${project.summary[locale]}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale)));
  return <div>
    <div className="gallery-toolbar">
      <div className="gallery-filters" role="group" aria-label={ui.nav.services}>
        <button type="button" className={`chip${category === 'all' ? ' is-active' : ''}`} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>{ui.common.all}</button>
        {categories.map(service => <button key={service.slug} type="button" className={`chip${category === service.slug ? ' is-active' : ''}`} aria-pressed={category === service.slug} onClick={() => setCategory(service.slug)}>{service.title[locale]}</button>)}
      </div>
      <div className="gallery-search"><Icon name="search" /><label className="sr-only" htmlFor={`${id}-search`}>{ui.portfolio.search}</label><input id={`${id}-search`} type="search" placeholder={ui.common.search} value={query} onChange={event => setQuery(event.currentTarget.value)} /></div>
    </div>
    <div className="gallery-count" role="status" aria-live="polite">{filtered.length} / {publicProjects.length}</div>
    {filtered.length ? <div className="gallery-grid">{filtered.map(project => <Link className="project-card" key={project.slug} href={`/${locale}/portofoliu/${project.slug}`}>
      <Image src={project.image} alt={project.kind === 'concept' ? `${ui.common.concept}: ${project.title[locale]}` : project.title[locale]} width={720} height={540} sizes="(min-width: 701px) 33vw, 50vw" />
      {project.kind === 'concept' && <span className="project-label">{ui.common.concept}</span>}
      <div className="project-caption"><h3>{project.title[locale]}</h3><p>{project.summary[locale]}</p></div>
    </Link>)}</div> : <p className="empty-state">{ui.common.noResults}</p>}
  </div>;
}
