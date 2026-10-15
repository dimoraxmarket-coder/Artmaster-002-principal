'use client';
import { useEffect, useId, useState } from 'react';
import type { Contact, Locale } from '@/lib/content/types';
import { googleMapLinks } from '@/lib/location';
import { displayPhone } from './floating-actions';
import { Icon } from './icons';
import styles from './location-section.module.css';

const copy = {
  ro: { title: 'Unde ne găsești', description: 'Vizitează-ne pentru a discuta despre proiectul tău și a descoperi soluțiile potrivite.', address: 'Adresa noastră', route: 'Deschide traseul', load: 'Încarcă harta interactivă', consent: 'Harta este oferită de Google Maps. La încărcare, Google primește date despre conexiunea ta și poate utiliza cookie-uri. Harta se încarcă numai la alegerea ta.', loading: 'Se încarcă harta…', mapTitle: 'ARTMASTER — locația oficiului în Google Maps', fallback: 'Dacă harta nu se afișează, deschide locația direct în Google Maps.', open: 'Deschide în Google Maps', error: 'Harta nu a putut fi încărcată. Poți folosi legătura către Google Maps.', retry: 'Încearcă din nou', missing: 'Adresa trebuie confirmată înainte de afișarea hărții.', privacy: 'Politica de confidențialitate', unload: 'Ascunde harta', visit: 'Contactează-ne înainte de vizită.' },
  ru: { title: 'Где нас найти', description: 'Приходите обсудить ваш проект и подобрать подходящее решение.', address: 'Наш адрес', route: 'Построить маршрут', load: 'Загрузить интерактивную карту', consent: 'Карту предоставляет Google Maps. При загрузке Google получает данные о подключении и может использовать cookie. Карта загружается только по вашему выбору.', loading: 'Карта загружается…', mapTitle: 'ARTMASTER — расположение офиса в Google Maps', fallback: 'Если карта не отображается, откройте адрес непосредственно в Google Maps.', open: 'Открыть в Google Maps', error: 'Не удалось загрузить карту. Воспользуйтесь ссылкой на Google Maps.', retry: 'Попробовать снова', missing: 'Перед отображением карты необходимо подтвердить адрес.', privacy: 'Политика конфиденциальности', unload: 'Скрыть карту', visit: 'Свяжитесь с нами перед визитом.' },
  en: { title: 'Where to find us', description: 'Visit us to discuss your project and discover the right solution.', address: 'Our address', route: 'Get directions', load: 'Load interactive map', consent: 'The map is provided by Google Maps. Loading it shares connection information with Google and may use cookies. The map loads only when you choose.', loading: 'Loading map…', mapTitle: 'ARTMASTER — office location in Google Maps', fallback: 'If the map does not appear, open the location directly in Google Maps.', open: 'Open in Google Maps', error: 'The map could not be loaded. You can use the Google Maps link.', retry: 'Try again', missing: 'The address must be confirmed before displaying a map.', privacy: 'Privacy policy', unload: 'Hide map', visit: 'Contact us before visiting.' },
};
export function LocationSection({ locale, contact }: { locale: Locale; contact: Contact }) {
  const text = copy[locale], id = useId(), links = googleMapLinks(contact.address[locale]);
  const [enabled, setEnabled] = useState(false), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => { if (!enabled || !loading) return; const timer = setTimeout(() => { setLoading(false); setFailed(true); }, 18000); return () => clearTimeout(timer); }, [enabled, loading, attempt]);
  function load() { setFailed(false); setLoading(true); setEnabled(true); setAttempt(previous => previous + 1); }
  return <section className={`section section-soft ${styles.section}`} aria-labelledby={`${id}-title`}>
    <div className="container"><div className={styles.heading}><p className="eyebrow">ARTMASTER · {({ ro: 'DURLEȘTI', ru: 'ДУРЛЕШТЫ', en: 'DURLEȘTI' })[locale]}</p><h2 id={`${id}-title`}>{text.title}</h2><p>{text.description}</p></div>
      <div className={styles.grid}>
        <aside className={styles.card}><h3>ARTMASTER</h3><p className={styles.brand}>ADVERTISING GROUP</p><p className={styles.addressLabel}><Icon name="pin" />{text.address}</p><address>{contact.address[locale]}</address><p className={styles.visit}>{text.visit}</p><a className={styles.contact} href={`tel:${contact.phone}`}><Icon name="phone" />{displayPhone(contact.phone)}</a><a className={styles.contact} href={`mailto:${contact.email}`}><Icon name="mail" />{contact.email}</a>{links && <a href={links.directions} className="button" target="_blank" rel="noopener noreferrer">{text.route}<Icon name="arrow" /></a>}</aside>
        <div className={styles.mapArea}><div className={styles.mapWindow}>
          {links && enabled && !failed ? <><iframe key={attempt} title={text.mapTitle} src={links.embed} loading="lazy" referrerPolicy="no-referrer" allowFullScreen onLoad={() => setLoading(false)} onError={() => { setLoading(false); setFailed(true); }} />{loading && <p className={styles.loading} role="status">{text.loading}</p>}</> : <div className={styles.placeholder}><Icon name="pin" /><p>{failed ? text.error : links ? text.consent : text.missing}</p>{links && <button type="button" className="button" onClick={load}>{failed ? text.retry : text.load}</button>}<a href={`/${locale}/confidentialitate`}>{text.privacy}</a></div>}
        </div><div className={styles.mapFooter}><p>{text.fallback}</p>{links && <a href={links.search} target="_blank" rel="noopener noreferrer">{text.open} ↗</a>}{enabled && <button type="button" onClick={() => { setEnabled(false); setLoading(false); setFailed(false); }}>{text.unload}</button>}</div></div>
      </div>
    </div>
  </section>;
}
