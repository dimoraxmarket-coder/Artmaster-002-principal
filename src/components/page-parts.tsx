import { PublicLink as Link } from './public-runtime';
import { PublicImage as Image } from './public-runtime';
import type { Locale, Faq, Service, Equipment } from '@/lib/content/types';
import { localizedPath } from '@/lib/site';
import { isConceptImage } from '@/lib/media';
import { JsonLd, breadcrumbData } from '@/lib/seo';
import { t } from '@/lib/i18n';
export function Breadcrumb({locale,items}:{locale:Locale;items:{name:string;path:string}[]}){
 const list=[{name:t(locale).nav.home,path:localizedPath(locale)},...items];
 return <>
  <nav aria-label="Breadcrumb" className="breadcrumb container">
   <ol className="breadcrumb-list">
    {list.map((item,index)=><li key={item.path} className="breadcrumb-item">
     {index>0&&<span className="breadcrumb-separator" aria-hidden="true">/</span>}
     {index===list.length-1
      ?<span className="breadcrumb-current" aria-current="page">{item.name}</span>
      :<Link href={item.path} className="breadcrumb-link">{item.name}</Link>}
    </li>)}
   </ol>
  </nav>
  <JsonLd data={breadcrumbData(list)}/>
 </>;
}
export function PageHero({eyebrow,title,description}:{eyebrow?:string;title:string;description:string}){return <section className="page-hero"><div className="container">{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1 className="page-title">{title}</h1><p>{description}</p></div></section>;}
export function ServiceCards({locale,services}:{locale:Locale;services:Service[]}){return <div className="card-grid">{services.map(s=><Link key={s.slug} href={localizedPath(locale,`servicii/${s.slug}`)} className="card"><div className="card-media"><Image src={s.image} alt={s.title[locale]} fill sizes="(max-width:600px) 100vw,(max-width:1000px) 50vw,33vw"/></div><div className="card-body"><h3>{s.title[locale]}</h3><p>{s.summary[locale]}</p><span className="card-action">{t(locale).common.learnMore}<span aria-hidden>↗</span></span></div></Link>)}</div>;}
export function EquipmentCards({locale,equipment}:{locale:Locale;equipment:Equipment[]}){return <div className="card-grid equipment-catalog">{equipment.map(e=><Link key={e.slug} className="card" href={localizedPath(locale,`echipamente/${e.slug}`)}><div className="card-media"><Image src={e.image} alt={e.title[locale]} fill sizes="(max-width:600px) 100vw,(max-width:1000px) 50vw,33vw"/>{(isConceptImage(e.image)||e.image.endsWith(".svg"))&&<span className="media-label">{isConceptImage(e.image)?t(locale).common.concept:t(locale).common.illustrative}</span>}</div><div className="card-body">{e.catalog&&<p className="equipment-category">{e.catalog.category[locale]}</p>}<h3>{e.title[locale]}</h3><p>{e.summary[locale]}</p><span className="card-action">{t(locale).common.learnMore}<span aria-hidden>↗</span></span></div></Link>)}</div>;}
export function FaqList({locale,faqs}:{locale:Locale;faqs:Faq[]}){return <div className="faq-list">{faqs.map(f=><details key={f.question[locale]}><summary>{f.question[locale]}<span aria-hidden>+</span></summary><p>{f.answer[locale]}</p></details>)}</div>;}
export function QuoteCta({locale,service}:{locale:Locale;service?:string}){return <aside className="quote-cta"><div className="container split"><div><p className="eyebrow">ARTMASTER</p><h2>{({ro:'Hai să dăm formă ideii tale.',ru:'Давайте воплотим вашу идею.',en:'Let’s give your idea a shape.'})[locale]}</h2><p>{({ro:'Descrie proiectul și trimite fișierele. Echipa îți va răspunde cu informațiile necesare pentru ofertare.',ru:'Опишите проект и прикрепите файлы. Команда свяжется с вами, чтобы обсудить предложение.',en:'Describe your project and attach your files. Our team will contact you to discuss a quote.'})[locale]}</p></div><Link className="button" href={localizedPath(locale,'solicita-oferta')+(service?'?serviciu='+encodeURIComponent(service):'')}>{t(locale).common.requestQuote} <span aria-hidden>↗</span></Link></div></aside>;}
