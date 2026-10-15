import { requireActor } from '@/lib/server/auth';
import { readMedia } from '@/lib/server/media';
import { errorResponse } from '@/lib/server/guards';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{name:string}>}){
  try{
    await requireActor(request);
    const {name}=await params,bytes=await readMedia(name);
    return new Response(Uint8Array.from(bytes),{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }catch(error){return errorResponse(error);}
}
