'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Contact, Locale } from '@/lib/content/types';
import { locales } from '@/lib/content/types';
import { t } from '@/lib/i18n';
import { Icon, Logo } from './icons';

const languageNames = { ro: 'Română', ru: 'Русский', en: 'English' };

export function Header({ locale, contact }: { locale: Locale; contact: Contact }) {
  const ui = t(locale);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mobileRef = useRef<HTMLElement>(null);
  const routes = [
    { path: '', label: ui.nav.home },
    { path: '/servicii', label: ui.nav.services },
    { path: '/echipamente', label: ui.nav.equipment },
    { path: '/portofoliu', label: ui.nav.portfolio },
    { path: '/despre-noi', label: ui.nav.about },
    { path: '/contact', label: ui.nav.contact },
  ];
  const current = (path: string) => path ? pathname.startsWith(`/${locale}${path}`) : pathname === `/${locale}`;

  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', listener);
    const frame = requestAnimationFrame(() => mobileRef.current?.querySelector<HTMLAnchorElement>('a')?.focus());
    return () => { document.removeEventListener('keydown', listener); cancelAnimationFrame(frame); };
  }, [open]);

  function close() { setOpen(false); }

  return <header className="site-header">
    <div className="container header-inner">
      <Link href={`/${locale}`} className="brand-link" aria-label={`ARTMASTER ADVERTISING GROUP — ${ui.nav.home}`} onClick={close}><Logo /></Link>
      <nav className="desktop-nav" aria-label={ui.common.language === 'Limba' ? 'Navigare principală' : locale === 'ru' ? 'Основная навигация' : 'Main navigation'}>
        {routes.map(({ path, label }) => <Link key={path} href={`/${locale}${path}`} className="nav-link" aria-current={current(path) ? 'page' : undefined}>{label}</Link>)}
      </nav>
      <nav className="language-switch" aria-label={ui.common.language}>
        {locales.map(language => <a key={language} href={pathname.replace(/^\/(ro|ru|en)(?=\/|$)/, `/${language}`) + (query ? `?${query}` : '')} hrefLang={language} lang={language} aria-label={`${language.toUpperCase()} — ${languageNames[language]}`} aria-current={language === locale ? 'page' : undefined} onClick={close}>{language.toUpperCase()}</a>)}
      </nav>
      <a href={`tel:${contact.phone}`} className="header-phone" aria-label={`${ui.contact.phone}: ${contact.phone}`}><Icon name="phone" /></a>
      <Link href={`/${locale}/solicita-oferta`} className="button header-quote">{ui.nav.quote}<Icon name="arrow" /></Link>
      <button type="button" className="menu-toggle" ref={toggleRef} aria-label={open ? ui.common.close : ui.common.openMenu} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(previous => !previous)}><Icon name={open ? 'close' : 'menu'} /></button>
    </div>
    <nav id="mobile-navigation" ref={mobileRef} className={`mobile-navigation${open ? ' is-open' : ''}`} aria-label={locale === 'ro' ? 'Navigare mobilă' : locale === 'ru' ? 'Мобильная навигация' : 'Mobile navigation'} inert={!open}>
      <ul>{routes.map(({ path, label }) => <li key={path}><Link href={`/${locale}${path}`} className="nav-link" aria-current={current(path) ? 'page' : undefined} onClick={close}>{label}</Link></li>)}</ul>
      <Link href={`/${locale}/solicita-oferta`} className="button" onClick={close}>{ui.nav.quote}<Icon name="arrow" /></Link>
      <a href={`tel:${contact.phone}`} className="mobile-menu-contact"><Icon name="phone" />{contact.phone}</a>
      <a href={`mailto:${contact.email}`} className="mobile-menu-contact"><Icon name="mail" />{contact.email}</a>
    </nav>
  </header>;
}
