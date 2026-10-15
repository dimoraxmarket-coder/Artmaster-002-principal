import { z } from 'zod';
import { requireActor } from '@/lib/server/auth';
import { boundedJSON,requireSameOrigin,errorResponse } from '@/lib/server/guards';
import { getStorage } from '@/lib/server/storage';
import { quoteStatusSchema } from '@/lib/server/schema';
import { BackendError } from '@/lib/server/config';
export const runtime='nodejs';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{requireSameOrigin(request);const actor=await requireActor(request,'editor'),{id}=await params;if(!z.uuid().safeParse(id).success)throw new BackendError('not_found',404);const input=z.object({status:quoteStatusSchema}).strict().safeParse(await boundedJSON(request,1024));if(!input.success)throw new BackendError('invalid_input',400);await getStorage().updateQuote(id,input.data.status,actor);return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}}
