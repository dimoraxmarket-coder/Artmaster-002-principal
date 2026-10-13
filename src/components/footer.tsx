import Link from 'next/link';
import type { Locale, SiteContent } from '@/lib/content/types';
import { t } from '@/lib/i18n';
import { Icon, Logo } from './icons';

export function Footer({ locale, content }: { locale: Locale; content: SiteContent }) {
  const ui = t(locale);
  const { contact } = content;
  const navigation = [
    ['/servicii', ui.nav.services], ['/echipamente', ui.nav.equipment], ['/portofoliu', ui.nav.portfolio],
    ['/despre-noi', ui.nav.about], ['/contact', ui.nav.contact], ['/blog', ui.nav.blog], ['/intrebari-frecvente', ui.nav.faq],
  ];
  return <footer className="site-footer">
    <div className="container">
      <div className="footer-top">
        <Link href={`/${locale}`} aria-label={`ARTMASTER CREATIVE SOLUTIONS — ${ui.nav.home}`}><Logo light /></Link>
        <div className="footer-tagline"><h2>{ui.footer.tagline}</h2><p>{ui.home.locationLabel}</p></div>
        <Link href={`/${locale}/solicita-oferta`} className="button">{ui.nav.quote}<Icon name="arrow" /></Link>
      </div>
      <div className="footer-grid">
        <div><h3>{ui.nav.services}</h3><ul>{content.services.map(service => <li key={service.slug}><Link href={`/${locale}/servicii/${service.slug}`}>{service.title[locale]}</Link></li>)}</ul></div>
        <div><h3>ARTMASTER</h3><ul>{navigation.map(([path, label]) => <li key={path}><Link href={`/${locale}${path}`}>{label}</Link></li>)}</ul></div>
        <div><h3>{ui.nav.equipment}</h3><ul>{content.equipment.slice(0, 5).map(equipment => <li key={equipment.slug}><Link href={`/${locale}/echipamente/${equipment.slug}`}>{equipment.title[locale]}</Link></li>)}</ul></div>
        <div className="footer-contact"><h3>{ui.nav.contact}</h3><a href={`tel:${contact.phone}`}><Icon name="phone" />{contact.phone}</a><a href={`mailto:${contact.email}`}><Icon name="mail" />{contact.email}</a><address><Icon name="pin" /><span>{contact.address[locale]}</span></address></div>
      </div>
      <div className="footer-bottom">
        <p>© {new Date().getUTCFullYear()} ARTMASTER. {ui.footer.rights}</p>
        <nav className="legal-links" aria-label={locale === 'ro' ? 'Informații legale' : locale === 'ru' ? 'Юридическая информация' : 'Legal information'}><Link href={`/${locale}/confidentialitate`}>{ui.footer.privacy}</Link><Link href={`/${locale}/termeni`}>{ui.footer.terms}</Link><Link href={`/${locale}/cookies`}>{ui.footer.cookies}</Link></nav>
      </div>
    </div>
  </footer>;
}
