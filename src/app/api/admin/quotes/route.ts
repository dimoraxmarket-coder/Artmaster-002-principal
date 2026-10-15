import { requireActor } from '@/lib/server/auth';
import { errorResponse } from '@/lib/server/guards';
import { getStorage } from '@/lib/server/storage';
export const runtime='nodejs';
export async function GET(request:Request){try{await requireActor(request);const quotes=await getStorage().listQuotes();return Response.json({quotes:quotes.map(({payloadHash,idempotencyKey,...quote})=>{void payloadHash;void idempotencyKey;return quote;})},{headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}}
