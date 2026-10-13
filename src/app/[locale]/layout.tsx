import { headers } from 'next/headers';
import { AnalyticsConsent } from '@/components/analytics-consent';
import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/content/types';
import { getContent } from '@/lib/content/repository';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { JsonLd } from '@/lib/seo';
import { siteUrl } from '@/lib/site';
export default async function LocaleLayout({children,params}:{children:React.ReactNode;params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(!isLocale(locale))notFound();
 const content=await getContent();
 const {contact}=content;
 const nonce=(await headers()).get('x-nonce')||'';
 return <><a className="skip-link" href="#main-content">{({ro:'Sari la conținut',ru:'Перейти к содержимому',en:'Skip to content'})[locale]}</a><Header locale={locale} contact={contact}/><main id="main-content">{children}</main><Footer locale={locale} content={content}/><JsonLd data={{'@context':'https://schema.org','@type':'LocalBusiness','@id':siteUrl+'/#organization',name:contact.companyName||'ARTMASTER',url:siteUrl,telephone:contact.phone||undefined,email:contact.email||undefined,address:contact.address[locale]?{'@type':'PostalAddress',streetAddress:contact.address[locale],addressCountry:'MD'}:undefined}}/><AnalyticsConsent locale={locale} measurementId={process.env.GA_MEASUREMENT_ID||''} nonce={nonce}/></>;
}
