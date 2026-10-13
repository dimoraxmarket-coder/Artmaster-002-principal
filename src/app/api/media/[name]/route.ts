import { readLocalMedia } from '@/lib/server/media';
import { errorResponse } from '@/lib/server/guards';
export const runtime='nodejs';
export async function GET(_request:Request,{params}:{params:Promise<{name:string}>}){try{const {name}=await params,bytes=await readLocalMedia(name);return new Response(Uint8Array.from(bytes),{headers:{'Content-Type':'image/webp','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});}catch(error){return errorResponse(error);}}
