import { notFound } from 'next/navigation';
import { Home } from '@/components/home';
import { getContent } from '@/lib/content/repository';
import { isLocale } from '@/lib/content/types';
import { websiteCopy } from '@/lib/content/page-copy';
import { pageMetadata } from '@/lib/seo';

const titles = {
  ro: 'Print UV, litere volumetrice și imprimare 3D în Moldova',
  ru: 'УФ-печать, объёмные буквы и 3D-печать в Молдове',
  en: 'UV printing, dimensional lettering and 3D printing in Moldova',
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const content=await getContent(),copy=websiteCopy(content);
  return pageMetadata(locale, '', titles[locale], copy.hero.description[locale], true, content.seo?.find(entry=>entry.path===''));
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const content = await getContent();
  return <Home locale={locale} content={content} />;
}
