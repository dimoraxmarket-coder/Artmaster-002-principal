import { requireActor } from '@/lib/server/auth';
import { boundedBody,requireSameOrigin,errorResponse,requestBucket } from '@/lib/server/guards';
import { BackendError } from '@/lib/server/config';
import { getStorage } from '@/lib/server/storage';
import { storeMedia } from '@/lib/server/media';
export const runtime='nodejs';
export async function POST(request:Request){
  try{requireSameOrigin(request);const actor=await requireActor(request,'editor',true);if(!await getStorage().consumeRate(`media:${actor.id}:${requestBucket(request)}`,30,3600000))throw new BackendError('rate_limited',429);if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw new BackendError('invalid_input',400);const bytes=await boundedBody(request,6*1024*1024);const form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();if([...form.keys()].some(key=>key!=='file')||form.getAll('file').length!==1)throw new BackendError('invalid_input',400);const file=form.get('file');if(!file||typeof file==='string')throw new BackendError('invalid_file',400);const result=await storeMedia(file);await getStorage().audit(actor,'media.upload',result.url);return Response.json(result,{status:201,headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}
}
