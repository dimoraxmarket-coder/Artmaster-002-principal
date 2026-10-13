import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { siteUrl, isIndexable } from '@/lib/site';
export const metadata: Metadata = {metadataBase:new URL(siteUrl),title:{default:'ARTMASTER — reclamă vizuală și producție publicitară',template:'%s | ARTMASTER'},description:'Print UV, litere volumetrice, imprimare 3D, gravură laser și frezare CNC. Oficiu în Durlești, Republica Moldova.',robots:{index:isIndexable,follow:isIndexable},icons:{icon:'/favicon.svg'},verification:{google:process.env.GSC_VERIFICATION || undefined}};
export default async function RootLayout({children}:{children:React.ReactNode}){
 const locale=(await headers()).get('x-site-locale') || 'ro';
 return <html lang={locale}><body>{children}</body></html>;
}
