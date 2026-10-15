import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { defaultContent } from '@/lib/content/defaults';
import { requireActor } from '@/lib/server/auth';
import { boundedJSON,requireSameOrigin,errorResponse } from '@/lib/server/guards';
import { getStorage } from '@/lib/server/storage';
import { contentSchema } from '@/lib/server/schema';
import { BackendError } from '@/lib/server/config';
export const runtime='nodejs';
const saveSchema=z.object({content:contentSchema,action:z.enum(['save-draft','publish']),version:z.number().int().nonnegative()}).strict();
export async function GET(request:Request){try{await requireActor(request);const state=await getStorage().content();return Response.json({...state,published:state.published||defaultContent},{headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}}
export async function PUT(request:Request){
  try{requireSameOrigin(request);const input=saveSchema.safeParse(await boundedJSON(request));if(!input.success)throw new BackendError('invalid_input',400);const {content,action,version}=input.data,actor=await requireActor(request,action==='publish'?'admin':'editor',true);const next=await getStorage().saveContent(content,action==='publish',actor,version);if(action==='publish')revalidatePath('/','layout');return Response.json({ok:true,version:next},{headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}
}
