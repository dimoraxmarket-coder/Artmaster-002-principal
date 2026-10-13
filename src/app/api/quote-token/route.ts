import { issueFormToken, requestBucket, errorResponse } from '@/lib/server/guards';
import { getStorage } from '@/lib/server/storage';
import { BackendError } from '@/lib/server/config';
export const runtime='nodejs';
export async function GET(request:Request){try{if(!await getStorage().consumeRate(`tokens:${requestBucket(request)}`,100,3600000))throw new BackendError('rate_limited',429);return Response.json(await issueFormToken(),{headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}}
