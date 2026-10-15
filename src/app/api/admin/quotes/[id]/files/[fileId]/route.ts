import { z } from 'zod';
import { requireActor } from '@/lib/server/auth';
import { errorResponse } from '@/lib/server/guards';
import { getStorage } from '@/lib/server/storage';
import { BackendError } from '@/lib/server/config';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string;fileId:string}>}){
  try{const actor=await requireActor(request),{id,fileId}=await params;if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(fileId).success)throw new BackendError('not_found',404);const storage=getStorage(),quote=await storage.getQuote(id),file=quote?.files.find(file=>file.id===fileId);if(!file)throw new BackendError('not_found',404);const bytes=await storage.readFile(file);await storage.audit(actor,'quote.file.download',`${id}/${fileId}`);return new Response(Uint8Array.from(bytes),{headers:{'Content-Type':file.mime,'Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${file.name.replace(/["\\\r\n]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});}catch(error){return errorResponse(error);}
}
