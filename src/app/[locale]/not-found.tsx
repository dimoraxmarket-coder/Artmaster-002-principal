import Link from 'next/link';
import { headers } from 'next/headers';
import { isLocale } from '@/lib/content/types';
import { t } from '@/lib/i18n';
export default async function NotFound(){
 const value=(await headers()).get('x-site-locale')||'ro';const locale=isLocale(value)?value:'ro';const ui=t(locale);
 return <section className="container section empty-state"><p className="eyebrow">ARTMASTER · 404</p><h1>{ui.common.notFound}</h1><p>{ui.common.notFoundDescription}</p><Link className="button" href={'/'+locale}>{ui.nav.home}</Link></section>;
}
