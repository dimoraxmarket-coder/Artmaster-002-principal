import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { siteUrl, isIndexable, localizedPath } from './site';
import { locales, type Locale } from './content/types';
import { localizedSeoCopy } from './seo-content';
export function pageMetadata(locale: Locale, path: string, title: string, description: string, index = true): Metadata {
  const url = siteUrl + localizedPath(locale, path);
  const copy = localizedSeoCopy(locale, path, title, description);
  const image = { url: `/branding/share-${locale}.jpg`, width: 1200, height: 630, alt: 'ARTMASTER — ADVERTISING GROUP' };
  return { ...copy, alternates: { canonical: url, languages: Object.fromEntries([...locales.map(language => [language, siteUrl + localizedPath(language, path)]), ['x-default', siteUrl + localizedPath('ro', path)]]) },
    openGraph: { ...copy, url, siteName: 'ARTMASTER', type: 'website', locale: ({ ro: 'ro_MD', ru: 'ru_MD', en: 'en_GB' })[locale], alternateLocale: locales.filter(language => language !== locale).map(language => ({ ro: 'ro_MD', ru: 'ru_MD', en: 'en_GB' })[language]), images: [image] },
    twitter: { card: 'summary_large_image', ...copy, images: [image] }, robots: { index: isIndexable && index, follow: isIndexable && index } };
}
export async function JsonLd({ data }: { data: unknown }) {
  const nonce = (await headers()).get('x-nonce') || undefined;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
export function breadcrumbData(items: { name: string; path: string }[]) { return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: siteUrl + item.path })) }; }
