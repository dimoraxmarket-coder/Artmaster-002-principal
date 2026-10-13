import { logoutAdmin, cookieValue, sessionCookie, PREAUTH_COOKIE } from '@/lib/server/auth';
import { requireSameOrigin,errorResponse } from '@/lib/server/guards';
export const runtime='nodejs';
export async function POST(request:Request){try{requireSameOrigin(request);await logoutAdmin(cookieValue(request));const response=Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie('',undefined,0)}});response.headers.append('Set-Cookie',sessionCookie('',PREAUTH_COOKIE,0));return response;}catch(error){return errorResponse(error);}}
