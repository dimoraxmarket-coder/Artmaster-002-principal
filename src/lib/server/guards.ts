import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { BackendError, MAX_REQUEST_BYTES, publicOrigin } from './config';
import { getStorage } from './storage';

export function requireSameOrigin(request:Request){
  const origin=request.headers.get('origin');
  if(!origin || origin!==publicOrigin() || request.headers.get('sec-fetch-site')==='cross-site')throw new BackendError('origin_rejected',403);
}
export function requestBucket(request:Request){
  // Proxy headers are attacker-controlled unless the hosting layer overwrites them.
  const trusted=process.env.ARTMASTER_TRUST_PROXY==='true';
  const header=process.env.ARTMASTER_IP_HEADER||'x-real-ip';
  const candidate=trusted?request.headers.get(header)?.trim():null;
  const identity=candidate&&isIP(candidate)?candidate:'shared';
  return createHash('sha256').update(identity).digest('hex');
}
export async function boundedBody(request:Request,max=MAX_REQUEST_BYTES){
  const length=request.headers.get('content-length');
  if(length&&(!/^\d+$/.test(length)||Number(length)>max))throw new BackendError('request_too_large',413);
  const reader=request.body?.getReader();if(!reader)throw new BackendError('invalid_input',400);
  let count=0;const chunks:Uint8Array[]=[];
  try {while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>max){await reader.cancel();throw new BackendError('request_too_large',413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks,count);
}
export async function boundedJSON(request:Request,max=2*1024*1024){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new BackendError('invalid_input',400);
  try{return JSON.parse((await boundedBody(request,max)).toString('utf8')) as unknown;}catch(error){if(error instanceof BackendError)throw error;throw new BackendError('invalid_input',400);}
}
function signature(encoded:string,secret:string){return createHmac('sha256',secret).update(encoded).digest('base64url');}
export async function issueFormToken(now=Date.now()){
  const secret=await getStorage().secret('ARTMASTER_FORM_SECRET');
  const idempotencyKey=randomUUID(),body=Buffer.from(JSON.stringify({issued:now,id:idempotencyKey})).toString('base64url');
  return {token:`${body}.${signature(body,secret)}`,idempotencyKey};
}
export async function validateFormToken(token:string,key:string,now=Date.now()){
  const secret=await getStorage().secret('ARTMASTER_FORM_SECRET'),[body,mac,...rest]=token.split('.');
  if(rest.length||!body||!mac)throw new BackendError('invalid_token',400);
  const expected=signature(body,secret),actual=Buffer.from(mac),reference=Buffer.from(expected);
  if(actual.length!==reference.length||!timingSafeEqual(actual,reference))throw new BackendError('invalid_token',400);
  let data:{issued:number;id:string};try{data=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));}catch{throw new BackendError('invalid_token',400);}
  if(data.id!==key||!Number.isSafeInteger(data.issued)||now-data.issued>7200000||now<data.issued)throw new BackendError('invalid_token',400);
  if(now-data.issued<1200)throw new BackendError('too_fast',429);
}
export function errorResponse(error:unknown){
  const failure=error instanceof BackendError?error:new BackendError('internal_error',500);
  return Response.json({error:failure.code,code:failure.code,...(failure.fieldErrors?{fieldErrors:failure.fieldErrors}:{})},{status:failure.status,headers:{'Cache-Control':'no-store',...(failure.status===429?{'Retry-After':'60'}:{})}});
}
