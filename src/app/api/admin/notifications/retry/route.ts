import { requireActor } from '@/lib/server/auth';
import { requireSameOrigin,errorResponse } from '@/lib/server/guards';
import { retryNotifications } from '@/lib/server/notifications';
export const runtime='nodejs';
export async function POST(request:Request){try{requireSameOrigin(request);await requireActor(request,'admin',true);return Response.json(await retryNotifications(),{headers:{'Cache-Control':'no-store'}});}catch(error){return errorResponse(error);}}
