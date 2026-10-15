export const dynamic = 'force-dynamic';
import type { MetadataRoute } from 'next';
import { siteUrl,isIndexable } from '@/lib/site';
export default function robots():MetadataRoute.Robots {return {rules:isIndexable?{userAgent:'*',allow:'/',disallow:['/admin','/api','/*?']}:{userAgent:'*',disallow:'/'},sitemap:siteUrl+'/sitemap.xml',host:siteUrl};}
