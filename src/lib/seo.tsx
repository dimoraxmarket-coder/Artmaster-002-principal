import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { siteUrl, isIndexable, localizedPath } from './site';
import { locales, type Locale } from './content/types';
export function pageMetadata(locale:Locale,path:string,title:string,description:string,index=true): Metadata {
 const url=siteUrl+localizedPath(locale,path);
 return { title,description,alternates:{canonical:url,languages:Object.fromEntries([...locales.map(l=>[l,siteUrl+localizedPath(l,path)]),['x-default',siteUrl+localizedPath('ro',path)]])},openGraph:{title,description,url,siteName:'ARTMASTER',type:'website',locale:({ro:'ro_MD',ru:'ru_MD',en:'en_GB'})[locale],images:[{url:'/media/print-workshop.png',alt:'ARTMASTER — vizualizare de concept a producției publicitare'}]},robots:{index:isIndexable&&index,follow:isIndexable&&index}};
}
export async function JsonLd({data}:{data:unknown}){
 const nonce=(await headers()).get('x-nonce') || undefined;
 return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{__html:JSON.stringify(data).replace(/</g,'\\u003c')}}/>;
}
export function breadcrumbData(items:{name:string;path:string}[]){return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items.map((i,n)=>({'@type':'ListItem',position:n+1,name:i.name,item:siteUrl+i.path}))};}
