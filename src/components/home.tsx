import { HeroMedia } from './hero-media';
import { HomepageBannerView } from './homepage-banner';
import { publishablePartner } from '@/lib/content/visual-assets';
import { PublicLink as Link } from './public-runtime';
import { PublicImage as Image } from './public-runtime';
import type { Locale, SiteContent } from '@/lib/content/types';
import { websiteCopy } from '@/lib/content/page-copy';
import { t } from '@/lib/i18n';
import { isConceptImage } from '@/lib/media';
import { Icon, type IconName } from './icons';
import { QuoteForm } from './quote-form';
import { PartnersMarquee } from './partners-marquee';
import { partners, examplePartners } from '@/lib/partners';
import { isIndexable } from '@/lib/site';

export function Home({ locale, content, preview = false }: { locale: Locale; content: SiteContent; preview?: boolean }) {
  const ui = t(locale);
  const hero=websiteCopy(content).hero;
  const projects = content.projects.filter(project => project.published).slice(0, 4);
  const partnerPreview = (process.env.PARTNERS_PREVIEW ?? 'true') === 'true' && !isIndexable;
  const managed = content.partners?.filter(p => preview ? !['hidden','archived'].includes(p.status) : publishablePartner(p));
  const partnerEntries = managed ? managed.map(p => ({ name:p.name, logo:preview||p.rights!=='unverified'?p.image:undefined, website:p.identity==='confirmed'?p.website:undefined, alt:p.alt, pending:!publishablePartner(p) })) : partners.length ? partners : partnerPreview ? examplePartners : [];
  const advantageIcons: IconName[] = ['layers', 'precision', 'chat'];
  return <>
    {content.banner?.enabled ? <HomepageBannerView banner={content.banner} locale={locale} title={`${hero.title[locale]} ${hero.accent[locale]}`} /> : <section className="home-hero" aria-labelledby="hero-title">
      {content.heroMedia?<HeroMedia media={content.heroMedia} locale={locale}/>:<picture className="hero-picture">
        <source media="(max-width:480px)" type="image/avif" srcSet="/media/hero-narrow.avif" />
        <source media="(max-width:480px)" type="image/webp" srcSet="/media/hero-narrow.webp" />
        <source type="image/avif" srcSet="/media/hero-wide.avif" />
        <img className="hero-background" src="/media/hero-wide.webp" alt="" width={1672} height={941} loading="eager" fetchPriority="high" decoding="async" />
      </picture>}
      <div className="container"><div className="hero-content">
        <p className="eyebrow">{hero.eyebrow[locale]}</p>
        <h1 id="hero-title">{hero.title[locale]}<span>{hero.accent[locale]}</span></h1>
        <p className="hero-description">{hero.description[locale]}</p>
        <div className="hero-actions"><Link href={`/${locale}/solicita-oferta`} className="button">{hero.quoteLabel[locale]}<Icon name="arrow" /></Link><Link href={`/${locale}/servicii`} className="button-secondary button-ghost">{hero.servicesLabel[locale]}</Link></div>
        <p className="hero-location"><Icon name="pin" />{ui.home.locationLabel}</p>
      </div></div>
      {!content.heroMedia&&<span className="concept-caption">{ui.common.concept}</span>}
    </section>}

    <section className="section home-services" aria-labelledby="services-title">
      <div className="container">
        <div className="section-heading"><div><p className="eyebrow">{ui.home.servicesEyebrow}</p><h2 id="services-title">{ui.home.servicesTitle}</h2></div><div><p>{ui.home.servicesDescription}</p><Link className="text-link" href={`/${locale}/servicii`}>{ui.common.viewAll}<Icon name="arrow" /></Link></div></div>
        <div className="service-grid">{content.services.slice(0, 6).map(service => <Link key={service.slug} href={`/${locale}/servicii/${service.slug}`} className="card card-link">
          <div className="card-media">
            <Image className="card-image" src={service.image} alt={`${isConceptImage(service.image) ? ui.common.concept : service.title[locale]}${isConceptImage(service.image) ? ': ' + service.title[locale] : ''}`} width={640} height={480} sizes="(min-width: 1280px) 200px, (min-width: 701px) 33vw, 50vw" />
            {isConceptImage(service.image) && <span className="media-label">{ui.common.concept}</span>}
          </div>
          <div className="card-body"><h3>{service.title[locale]}</h3><p>{service.summary[locale]}</p><span className="card-arrow"><Icon name="arrow" /></span></div>
        </Link>)}</div>
      </div>
    </section>

    <section className="section section-soft" aria-labelledby="portfolio-title">
      <div className="container">
        <div className="section-heading"><div><p className="eyebrow">{ui.nav.portfolio}</p><h2 id="portfolio-title">{ui.home.portfolioTitle}</h2></div><div><p>{ui.home.portfolioDescription}</p><Link className="text-link" href={`/${locale}/portofoliu`}>{ui.common.viewAll}<Icon name="arrow" /></Link></div></div>
        {projects.some(project => project.kind === 'concept') && <p className="portfolio-note">{ui.common.conceptNotice}</p>}
        {projects.length ? <div className={`gallery-grid home-gallery${projects.length === 3 ? ' home-gallery-three' : ''}`}>{projects.map(project => <Link className="project-card" key={project.slug} href={`/${locale}/portofoliu/${project.slug}`}>
          <Image src={project.image} alt={project.kind === 'concept' ? `${ui.common.concept}: ${project.title[locale]}` : project.title[locale]} width={720} height={540} sizes="(min-width: 701px) 33vw, 50vw" />
          {project.kind === 'concept' && <span className="project-label">{ui.common.concept}</span>}
          <div className="project-caption"><h3>{project.title[locale]}</h3><p>{project.summary[locale]}</p></div>
        </Link>)}</div> : <p className="empty-state">{ui.common.emptyPortfolio}</p>}
      </div>
    </section>

    <PartnersMarquee locale={locale} partners={partnerEntries} reviewMode={preview && Boolean(managed)} exampleMode={managed ? preview : !partners.length} />

    <section className="section" aria-labelledby="advantages-title"><div className="container">
      <div className="section-heading"><div><p className="eyebrow">ARTMASTER</p><h2 id="advantages-title">{ui.home.advantagesTitle}</h2></div></div>
      <div className="advantage-grid">{ui.home.advantages.map((advantage, index) => <div className="advantage-card" key={advantage.title}><div className="icon-tile"><Icon name={advantageIcons[index] ?? 'spark'} /></div><h3>{advantage.title}</h3><p>{advantage.description}</p></div>)}</div>
    </div></section>

    <section className="section equipment-section" aria-labelledby="equipment-title"><div className="container">
      <div className="section-heading"><div><p className="eyebrow">{ui.nav.equipment}</p><h2 id="equipment-title">{ui.home.equipmentTitle}</h2></div><div><p>{ui.home.equipmentDescription}</p><Link className="text-link" href={`/${locale}/echipamente`}>{ui.common.viewAll}<Icon name="arrow" /></Link></div></div>
      <p className="equipment-count"><Icon name="cube" />{ui.home.equipmentCount}</p>
      <div className="equipment-grid">{content.equipment.map(equipment => <Link href={`/${locale}/echipamente/${equipment.slug}`} key={equipment.slug} className="card card-link equipment-card">
        <div className="card-media">
          <Image className="card-image" src={equipment.image} alt={isConceptImage(equipment.image) ? `${ui.common.concept}: ${equipment.title[locale]}` : equipment.title[locale]} width={640} height={480} sizes="(min-width: 701px) 33vw, 50vw" />
          {isConceptImage(equipment.image) && <span className="media-label">{ui.common.concept}</span>}
        </div>
        <div className="card-body"><h3>{equipment.title[locale]}</h3><p>{equipment.summary[locale]}</p><span className="card-arrow"><Icon name="arrow" /></span></div>
      </Link>)}</div>
    </div></section>

    <section className="section" aria-labelledby="process-title"><div className="container">
      <div className="section-heading"><div><p className="eyebrow">{ui.common.process}</p><h2 id="process-title">{ui.home.processTitle}</h2></div></div>
      <div className={`process-grid${ui.home.processSteps.length === 3 ? ' process-grid-three' : ''}`}>{ui.home.processSteps.map((step, index) => <div className="process-step" key={step.title}><span className="step-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p></div>)}</div>
    </div></section>

    <section className="section industries-section" aria-labelledby="industries-title"><div className="container industries-inner">
      <div><p className="eyebrow">{ui.home.servicesEyebrow}</p><h2 id="industries-title">{ui.home.industriesTitle}</h2></div><div className="industry-list">{ui.home.industries.map(industry => <span className="chip" key={industry}>{industry}</span>)}</div>
    </div></section>

    <section className="section faq-section" aria-labelledby="faq-title"><div className="container faq-layout">
      <div><p className="eyebrow">{ui.nav.faq}</p><h2 id="faq-title">{ui.home.faqTitle}</h2><p>{ui.home.quoteDescription}</p><Link href={`/${locale}/intrebari-frecvente`} className="text-link">{ui.common.viewAll}<Icon name="arrow" /></Link></div>
      <div className="faq-list">{content.faqs.slice(0, 5).map(faq => <details key={faq.question[locale]}><summary>{faq.question[locale]}</summary><p>{faq.answer[locale]}</p></details>)}</div>
    </div></section>

    <section className="section quote-section" aria-labelledby="quote-title"><div className="container quote-panel">
      <div><p className="eyebrow">{ui.nav.quote}</p><h2 id="quote-title">{ui.home.quoteTitle}</h2><p>{ui.home.quoteDescription}</p><a className="quote-contact" href={`tel:${content.contact.phone}`}><Icon name="phone" />{content.contact.phone}</a><a className="quote-contact" href={`mailto:${content.contact.email}`}><Icon name="mail" />{content.contact.email}</a></div>
      <QuoteForm locale={locale} services={content.services} contact={content.contact} compact />
    </div></section>
  </>;
}
