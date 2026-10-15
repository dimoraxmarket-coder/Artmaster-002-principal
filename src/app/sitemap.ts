export const dynamic = 'force-dynamic';
import type { MetadataRoute } from 'next';
import { getContent } from '@/lib/content/repository';
import { locales } from '@/lib/content/types';
import { siteUrl,localizedPath } from '@/lib/site';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const c=await getContent();
 const paths=['','servicii','echipamente','portofoliu','despre-noi','contact','solicita-oferta','intrebari-frecvente','blog','confidentialitate','termeni','cookies',...c.services.map(s=>'servicii/'+s.slug),...c.equipment.map(e=>'echipamente/'+e.slug),...c.projects.filter(p=>p.published&&p.kind==='real').map(p=>'portofoliu/'+p.slug),...c.articles.filter(a=>a.published).map(a=>'blog/'+a.slug)];
 return paths.flatMap(path=>locales.map(locale=>({url:siteUrl+localizedPath(locale,path),alternates:{languages:Object.fromEntries([...locales.map(l=>[l,siteUrl+localizedPath(l,path)]),['x-default',siteUrl+localizedPath('ro',path)]])}})));
}
