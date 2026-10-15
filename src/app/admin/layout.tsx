import type { Metadata } from 'next';
export const metadata:Metadata={title:'Administrare | ARTMASTER',robots:{index:false,follow:false}};
export default function AdminLayout({children}:{children:React.ReactNode}){return <main className="admin-shell container" style={{paddingBlock:'3rem'}}>{children}</main>;}
