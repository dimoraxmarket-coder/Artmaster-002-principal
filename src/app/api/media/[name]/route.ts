import { readPublishedMedia, mediaResponse } from '@/lib/server/media';
import { errorResponse } from '@/lib/server/guards';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{name:string}>}){try{const {name}=await params;return mediaResponse(await readPublishedMedia(name),name,request);}catch(error){return errorResponse(error);}}
