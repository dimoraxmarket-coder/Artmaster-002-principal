export const dynamic = 'force-dynamic';
import type { MetadataRoute } from 'next';
import { getContent } from '@/lib/content/repository';
import { locales } from '@/lib/content/types';
import { siteUrl,localizedPath } from '@/lib/site';
import { contentPaths } from '@/lib/content/routes';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const c=await getContent();
 const paths=contentPaths(c,{concepts:false});
 return paths.flatMap(path=>locales.map(locale=>({url:siteUrl+localizedPath(locale,path),alternates:{languages:Object.fromEntries([...locales.map(l=>[l,siteUrl+localizedPath(l,path)]),['x-default',siteUrl+localizedPath('ro',path)]])}})));
}
