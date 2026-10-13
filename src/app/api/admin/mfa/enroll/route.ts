import { enrollAdminMfa,sessionCookie,PREAUTH_COOKIE,requireActor } from '@/lib/server/auth';
import { requireSameOrigin,errorResponse } from '@/lib/server/guards';
import { getStorage } from '@/lib/server/storage';
import { BackendError } from '@/lib/server/config';
export const runtime='nodejs';
export async function POST(request:Request){try{requireSameOrigin(request);const actor=await requireActor(request,'editor');if(!await getStorage().consumeRate(`mfa-enroll:${actor.id}`,3,3600000))throw new BackendError('rate_limited',429);const result=await enrollAdminMfa(request);return Response.json({qrCode:result.qrCode},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie(result.cookie,PREAUTH_COOKIE,300)}});}catch(error){return errorResponse(error);}}
