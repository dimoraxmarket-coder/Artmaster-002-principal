import { enrollAdminMfa,sessionCookie,PREAUTH_COOKIE } from '@/lib/server/auth';
import { requireSameOrigin,errorResponse } from '@/lib/server/guards';
export const runtime='nodejs';
export async function POST(request:Request){try{requireSameOrigin(request);const result=await enrollAdminMfa(request);return Response.json({qrCode:result.qrCode},{headers:{'Cache-Control':'no-store','Set-Cookie':sessionCookie(result.cookie,PREAUTH_COOKIE,300)}});}catch(error){return errorResponse(error);}}
