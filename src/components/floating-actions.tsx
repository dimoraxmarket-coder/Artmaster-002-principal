'use client';
import { PublicLink as Link } from './public-runtime';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { Contact, Locale } from '@/lib/content/types';
import { BackToTop } from './back-to-top';
import { Icon } from './icons';
import styles from './floating-actions.module.css';

const copy = {
  ro: { open: 'Contact rapid', close: 'Închide contactul rapid', description: 'Suntem aici pentru proiectul tău.', phone: 'Sună-ne', email: 'Trimite e-mail', quote: 'Solicită o ofertă' },
  ru: { open: 'Быстрая связь', close: 'Закрыть панель связи', description: 'Мы здесь, чтобы обсудить ваш проект.', phone: 'Позвонить', email: 'Написать письмо', quote: 'Запросить предложение' },
  en: { open: 'Quick contact', close: 'Close quick contact', description: 'We are here for your project.', phone: 'Call us', email: 'Send email', quote: 'Request a quote' },
};
export function displayPhone(value: string) { return value === '+37360010400' ? '+373 60 010 400' : value; }
function validChannel(value: string) { return /^\+?[0-9]{7,16}$/.test(value) ? value : undefined; }

export function FloatingActions({ locale, contact, viber = '' }: { locale: Locale; contact: Contact; viber?: string }) {
  const text = copy[locale]; const id = useId();
  const [open, setOpen] = useState(false); const [bottom, setBottom] = useState(20);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const whatsapp = validChannel(contact.whatsapp), viberNumber = validChannel(viber);
  useEffect(() => {
    if (!open) return;
    let focusFrame = 0, externalFrame = 0;
    const frame = requestAnimationFrame(() => { focusFrame = requestAnimationFrame(() => closeButton.current?.focus()); });
    const pointer = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); } };
    const externalFocus = () => { externalFrame = requestAnimationFrame(() => { if (document.activeElement instanceof HTMLIFrameElement) setOpen(false); }); };
    window.addEventListener('blur', externalFocus);
    document.addEventListener('pointerdown', pointer); document.addEventListener('keydown', escape);
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(focusFrame); cancelAnimationFrame(externalFrame); window.removeEventListener('blur', externalFocus); document.removeEventListener('pointerdown', pointer); document.removeEventListener('keydown', escape); };
  }, [open]);
  useEffect(() => {
    let banner: HTMLElement | null = null, frame = 0;
    const resize = new ResizeObserver(() => schedule());
    const update = () => {
      frame = 0;
      const current = document.querySelector<HTMLElement>('.consent-banner');
      if (current !== banner) { if (banner) resize.unobserve(banner); banner = current; if (banner) resize.observe(banner); }
      const bounds = banner?.getBoundingClientRect();
      setBottom(bounds && bounds.right > window.innerWidth - 90 ? Math.max(20, window.innerHeight - bounds.top + 12) : 20);
    };
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    const mutations = new MutationObserver(records => { if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node instanceof HTMLElement && (node.matches('.consent-banner') || node.querySelector('.consent-banner'))))) schedule(); });
    mutations.observe(document.body, { childList: true, subtree: true });
    schedule(); window.addEventListener('resize', schedule);
    return () => { mutations.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); };
  }, []);
  function close() { setOpen(false); trigger.current?.focus(); }
  return <div className={styles.shell} ref={root} style={{ '--floating-bottom': `${bottom}px` } as CSSProperties}>
    <BackToTop locale={locale} suppressed={open} />
    <section id={`${id}-contact`} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} aria-hidden={!open || undefined} inert={!open} data-open={open || undefined} className={styles.panel}>
      <div className={styles.panelHeader}><div><h2 id={`${id}-title`}>ARTMASTER</h2><span>ADVERTISING GROUP</span></div><button type="button" ref={closeButton} className={styles.close} aria-label={text.close} onClick={close}><Icon name="close" /></button></div>
      <p className={styles.description}>{text.description}</p>
      <a href={`tel:${contact.phone}`} className={styles.contactLink}><Icon name="phone" /><span><small>{text.phone}</small>{displayPhone(contact.phone)}</span></a>
      <a href={`mailto:${contact.email}`} className={styles.contactLink}><Icon name="mail" /><span><small>{text.email}</small>{contact.email}</span></a>
      {(whatsapp || viberNumber) && <div className={styles.channels}>{whatsapp && <a href={`https://wa.me/${whatsapp.replace(/^\+/, '')}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}{viberNumber && <a href={`viber://chat?number=${encodeURIComponent(viberNumber)}`}>Viber</a>}</div>}
      <Link href={`/${locale}/solicita-oferta`} className="button" onClick={() => setOpen(false)}>{text.quote}<Icon name="arrow" /></Link>
    </section>
    <button type="button" ref={trigger} className={`${styles.round} ${styles.contactToggle}`} aria-label={open ? text.close : text.open} aria-expanded={open} aria-controls={`${id}-contact`} onClick={() => setOpen(previous => !previous)}><Icon name={open ? 'close' : 'chat'} /></button>
  </div>;
}
