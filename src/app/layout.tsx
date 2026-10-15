import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { siteUrl, isIndexable } from '@/lib/site';
export const metadata: Metadata = {metadataBase:new URL(siteUrl),title:{default:'ARTMASTER — reclamă vizuală și producție publicitară',template:'%s | ARTMASTER'},description:'Print UV, litere volumetrice, imprimare 3D, gravură laser și frezare CNC. Oficiu în Durlești, Republica Moldova.',robots:{index:isIndexable,follow:isIndexable},icons:{icon:[{url:'/favicon.ico',sizes:'any'},{url:'/branding/icon-48.png',type:'image/png',sizes:'48x48'}],apple:[{url:'/branding/apple-touch-icon.png',sizes:'180x180'}]},manifest:'/manifest.webmanifest',verification:{google:process.env.GSC_VERIFICATION || undefined}};
export default async function RootLayout({children}:{children:React.ReactNode}){
 const locale=(await headers()).get('x-site-locale') || 'ro';
 return <html lang={locale}><body>{children}</body></html>;
}
