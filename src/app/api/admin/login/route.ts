import { loginAdmin, loginSchema, cookieValue, verifyAdminMfa, sessionCookie, PREAUTH_COOKIE } from '@/lib/server/auth';
import { boundedJSON, requireSameOrigin, requestBucket, errorResponse } from '@/lib/server/guards';
import { getStorage } from '@/lib/server/storage';
import { createHash } from 'node:crypto';
import { BackendError } from '@/lib/server/config';
export const runtime='nodejs';
export async function POST(request:Request){
  try{
    requireSameOrigin(request);
    if(!await getStorage().consumeRate(`login:${requestBucket(request)}`,10,900000))throw new BackendError('rate_limited',429);
    const input=await boundedJSON(request,2048);
    if(typeof input==='object'&&input&&'code' in input){
      const code=(input as {code:unknown}).code;
      if(typeof code!=='string')throw new BackendError('invalid_input',400);
      const value=await verifyAdminMfa(cookieValue(request,PREAUTH_COOKIE)||'',code);
      const response=Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
      response.headers.append('Set-Cookie',sessionCookie(value));response.headers.append('Set-Cookie',sessionCookie('',PREAUTH_COOKIE,0));return response;
    }
    const parsed=loginSchema.safeParse(input);if(!parsed.success)throw new BackendError('invalid_input',400);
    const accountBucket=createHash('sha256').update(parsed.data.email).digest('hex');
    if(!await getStorage().consumeRate(`login-account:${accountBucket}`,10,900000))throw new BackendError('rate_limited',429);
    const result=await loginAdmin(parsed.data.email,parsed.data.password);
    const response=Response.json({ok:!result.mfaRequired,mfaRequired:result.mfaRequired,enrollmentRequired:'enrollmentRequired' in result&&result.enrollmentRequired},{headers:{'Cache-Control':'no-store'}});
    response.headers.append('Set-Cookie',sessionCookie(result.cookie,result.mfaRequired?PREAUTH_COOKIE:undefined,result.mfaRequired?300:undefined));
    response.headers.append('Set-Cookie',sessionCookie('',result.mfaRequired?undefined:PREAUTH_COOKIE,0));return response;
  }catch(error){return errorResponse(error);}
}
