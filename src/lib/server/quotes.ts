import { randomUUID } from 'node:crypto';
import { quotePayloadHash } from './quote-identity';
import { getContent } from '../content/repository';
import { quoteSchema } from './schema';
import { BackendError } from './config';
import { boundedBody, requestBucket, requireSameOrigin, validateFormToken } from './guards';
import { getStorage } from './storage';
import { validateUploads } from './uploads';
import { emailConfigured, notifyQuote } from './notifications';
import type { Quote } from './types';

export async function submitQuote(request:Request){
  requireSameOrigin(request);
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw new BackendError('invalid_input',400);
  if(!await getStorage().consumeRate(`quote-attempts:${requestBucket(request)}`,30,900000))throw new BackendError('rate_limited',429);
  const bytes=await boundedBody(request);
  let form:FormData;
  try{form=await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();}catch{throw new BackendError('invalid_input',400);}
  const fields=['locale','service','name','email','phone','message','consent','website','token','idempotencyKey'];
  const optional=['company','dimensions','quantity','deadline','sourcePath'];
  if([...form.keys()].some(key=>key!=='files'&&!fields.includes(key)&&!optional.includes(key))||fields.some(key=>form.getAll(key).length!==1)||optional.some(key=>form.getAll(key).length>1))throw new BackendError('invalid_input',400);
  const parsed=quoteSchema.safeParse(Object.fromEntries([...fields,...optional.filter(key=>form.has(key))].map(key=>[key,form.get(key)])));
  if(!parsed.success)throw new BackendError('invalid_input',400,parsed.error.flatten().fieldErrors);
  const data=parsed.data;
  await validateFormToken(data.token,data.idempotencyKey);
  const content=await getContent();
  if(!content.services.some(service=>service.slug===data.service))throw new BackendError('invalid_input',400,{service:['invalid']});
  const files=await validateUploads(form.getAll('files'));
  // Keep original input identity for retries of records saved before sanitization.
  // The original bytes are not stored for new raster attachments.
  const payloadHash=quotePayloadHash(data,files);
  const storage=getStorage(),existing=await storage.findQuote(data.idempotencyKey);
  if(existing){if(existing.payloadHash!==payloadHash)throw new BackendError('idempotency_conflict',409);return {id:existing.id,notification:existing.notification,duplicate:true};}
  if(!await storage.consumeRate(`quotes:${requestBucket(request)}`,5,900000))throw new BackendError('rate_limited',429);
  const quote:Quote={id:randomUUID(),locale:data.locale,service:data.service,name:data.name,email:data.email,phone:data.phone,message:data.message,company:data.company,dimensions:data.dimensions,quantity:data.quantity,deadline:data.deadline,sourcePath:data.sourcePath||`/${data.locale}/solicita-oferta`,createdAt:new Date().toISOString(),status:'new',files:files.map(file=>({id:randomUUID(),name:file.name,mime:file.mime,size:file.bytes.length,path:randomUUID()})),notification:emailConfigured()?'pending':'not_configured',payloadHash,idempotencyKey:data.idempotencyKey};
  const saved=await storage.createQuote(quote,files);
  const notification=saved.duplicate?saved.quote.notification:saved.quote.notification==='pending'?await notifyQuote(saved.quote):saved.quote.notification;
  return {id:saved.quote.id,notification,duplicate:saved.duplicate};
}
