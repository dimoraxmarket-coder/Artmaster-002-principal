'use client';

import Image from 'next/image';
import { useId, useState } from 'react';
import type { Locale } from '@/lib/content/types';
import { safePartnerWebsite, type Partner } from '@/lib/partners';
import styles from './partners-marquee.module.css';

const copy = {
  ro: { title: 'Companii care au încredere în noi', description: 'Construim relații durabile prin proiecte realizate cu precizie, creativitate și atenție la detalii.', previewTitle: 'Parteneri — previzualizare', previewDescription: 'Logouri demonstrative pentru prezentarea acestei secțiuni. Aceste exemple nu reprezintă clienți sau parteneri ARTMASTER.', pause: 'Oprește animația', resume: 'Pornește animația', list: 'Parteneri ARTMASTER', examples: 'Exemple de logo-uri' },
  ru: { title: 'Компании, которые нам доверяют', description: 'Мы строим долгосрочные отношения благодаря точному исполнению, творческому подходу и вниманию к деталям.', previewTitle: 'Партнёры — предварительный просмотр', previewDescription: 'Демонстрационные логотипы для оформления раздела. Эти примеры не являются клиентами или партнёрами ARTMASTER.', pause: 'Остановить анимацию', resume: 'Запустить анимацию', list: 'Партнёры ARTMASTER', examples: 'Примеры логотипов' },
  en: { title: 'Companies that trust us', description: 'We build lasting relationships through precise execution, creativity and attention to detail.', previewTitle: 'Partners — preview', previewDescription: 'Example logos showing how this section will look. These examples are not ARTMASTER clients or partners.', pause: 'Pause animation', resume: 'Resume animation', list: 'ARTMASTER partners', examples: 'Example logos' },
};

export function PartnersMarquee({ locale, partners, exampleMode = false }: { locale: Locale; partners: Partner[]; exampleMode?: boolean }) {
  const [paused, setPaused] = useState(false);
  const id = useId();
  const text = copy[locale];
  if (!partners.length) return null;
  // Each of the two identical sets is wider than the 1280 px viewport.
  const items = Array.from({ length: Math.ceil(8 / partners.length) }, () => partners).flat();
  function item(partner: Partner, index: number, duplicate: boolean) {
    const hidden = duplicate || index >= partners.length;
    const href = safePartnerWebsite(partner.website);
    const graphic = <Image src={partner.logo} alt={hidden ? '' : partner.alt[locale]} width={172} height={80} sizes="172px" unoptimized className={styles.logo} />;
    return <li key={`${partner.name}-${index}`} className={`${styles.item}${index >= partners.length ? ` ${styles.repeat}` : ''}`} aria-hidden={hidden || undefined} inert={hidden || undefined}>
      {href ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={partner.name}>{graphic}</a> : graphic}
    </li>;
  }
  return <section className={`section ${styles.section}`} aria-labelledby={`${id}-title`} data-partners-example={exampleMode || undefined}>
    <div className="container">
      <div className={styles.heading}><div><p className="eyebrow">ARTMASTER · {text.list}</p><h2 id={`${id}-title`}>{exampleMode ? text.previewTitle : text.title}</h2><p>{exampleMode ? text.previewDescription : text.description}</p></div>
        <button type="button" className={styles.pause} aria-pressed={paused} aria-controls={`${id}-logos`} onClick={() => setPaused(previous => !previous)}>{paused ? text.resume : text.pause}</button>
      </div>
      <div id={`${id}-logos`} className={styles.window} data-paused={paused || undefined}>
        <div className={styles.track} style={{ animationDuration: `${Math.max(32, items.length * 196 / 45)}s` }}>
          <ul className={styles.set} aria-label={exampleMode ? text.examples : text.list}>{items.map((partner, index) => item(partner, index, false))}</ul>
          <ul className={`${styles.set} ${styles.duplicate}`} aria-hidden="true" inert>{items.map((partner, index) => item(partner, index, true))}</ul>
        </div>
      </div>
    </div>
  </section>;
}
