import { test,after } from 'node:test';
import assert from 'node:assert/strict';
import { rm,stat } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PDFDocument,PDFName,PDFString } from 'pdf-lib';
import { LocalStorage } from '../src/lib/server/local';
import { issueFormToken,validateFormToken,requireSameOrigin,requestBucket,boundedBody } from '../src/lib/server/guards';
import { validateUploads } from '../src/lib/server/uploads';
import { storageMode,BackendError } from '../src/lib/server/config';
import { createLocalAdmin,loginAdmin,actorForSession,logoutAdmin,requireActor,sessionCookie,verifyPassword,hashPassword } from '../src/lib/server/auth';
import { contentSchema,quoteSchema } from '../src/lib/server/schema';
import { defaultContent } from '../src/lib/content/defaults';
import type { Quote,Actor } from '../src/lib/server/types';

const directory=mkdtempSync(join(tmpdir(),'artmaster-backend-'));
process.env.ARTMASTER_DATA_DIR=directory;process.env.ARTMASTER_STORAGE='local';process.env.SITE_URL='http://localhost:3000';
after(async()=>{await rm(directory,{recursive:true,force:true});});
const store=new LocalStorage();
function errorCode(code:string){return (error:unknown)=>error instanceof BackendError&&error.code===code;}
function sampleQuote(overrides:Partial<Quote>={}):Quote{return {id:randomUUID(),idempotencyKey:randomUUID(),payloadHash:'test',locale:'ro',service:defaultContent.services[0].slug,name:'Test User',email:'user@example.com',phone:'+37360010400',message:'A useful request',createdAt:new Date().toISOString(),status:'new',files:[],notification:'not_configured',...overrides};}

test('production refuses accidental local storage or missing Supabase',()=>{
  const env=process.env.NODE_ENV;Object.assign(process.env,{NODE_ENV:'production'});delete process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION;
  assert.throws(()=>storageMode(),errorCode('unavailable'));
  process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION='true';assert.equal(storageMode(),'local');delete process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION;
  Object.assign(process.env,{NODE_ENV:env||'test'});
});
test('signed tokens reject tampering, different nonce, too-fast and expired submission',async()=>{
  const form=await issueFormToken(10000);
  await validateFormToken(form.token,form.idempotencyKey,12000);
  await assert.rejects(()=>validateFormToken(form.token+'x',form.idempotencyKey,12000),errorCode('invalid_token'));
  await assert.rejects(()=>validateFormToken(form.token,randomUUID(),12000),errorCode('invalid_token'));
  await assert.rejects(()=>validateFormToken(form.token,form.idempotencyKey,10500),errorCode('too_fast'));
  await assert.rejects(()=>validateFormToken(form.token,form.idempotencyKey,7300000),errorCode('invalid_token'));
});
test('rate limit persists across adapters and prunes only its own bucket',async()=>{
  for(let i=0;i<5;i++)assert.equal(await store.consumeRate('quote-unit',5,900000,10000+i),true);
  assert.equal(await new LocalStorage().consumeRate('quote-unit',5,900000,10010),false);
  assert.equal(await store.consumeRate('other-unit',5,1000,20000),true);
  assert.equal(await store.consumeRate('quote-unit',5,900000,20000),false);
  assert.equal(await store.consumeRate('quote-unit',5,900000,920001),true);
});
test('origin and proxy guards reject forged origins and ignore untrusted IP headers',()=>{
  const valid=new Request('http://localhost:3000/api/quotes',{headers:{Origin:'http://localhost:3000'}});requireSameOrigin(valid);
  assert.throws(()=>requireSameOrigin(new Request(valid.url,{headers:{Origin:'https://evil.invalid'}})),errorCode('origin_rejected'));
  const a=new Request(valid.url,{headers:{'x-forwarded-for':'1.2.3.4','x-real-ip':'1.2.3.4'}}),b=new Request(valid.url,{headers:{'x-real-ip':'9.9.9.9'}});
  delete process.env.ARTMASTER_TRUST_PROXY;assert.equal(requestBucket(a),requestBucket(b));
  process.env.ARTMASTER_TRUST_PROXY='true';assert.notEqual(requestBucket(a),requestBucket(b));delete process.env.ARTMASTER_TRUST_PROXY;
});
test('bounded reader limits actual body even if content length is omitted',async()=>{
  await assert.rejects(()=>boundedBody(new Request('http://localhost',{method:'POST',body:'123456'}),5),errorCode('request_too_large'));
});
test('uploads decode images, reject spoofed content and unsafe names, PDFs reject active actions',async()=>{
  const image=await sharp({create:{width:2,height:2,channels:3,background:'#fff'}}).png().toBuffer();
  const accepted=await validateUploads([new File([Uint8Array.from(image)],'a.png',{type:'image/png'})]);assert.equal(accepted[0].mime,'image/png');
  await assert.rejects(()=>validateUploads([new File(['%PDF-fake'],'a.png',{type:'image/png'})]),errorCode('invalid_file'));
  await assert.rejects(()=>validateUploads([new File([Uint8Array.from(image)],'attack.exe.png',{type:'image/png'})]),errorCode('invalid_file'));
  const pdf=await PDFDocument.create();pdf.addPage([100,100]);const bytes=await pdf.save();assert.equal((await validateUploads([new File([Uint8Array.from(bytes)],'drawing.pdf',{type:'application/pdf'})])).length,1);
  pdf.catalog.set(PDFName.of('OpenAction'),pdf.context.obj({S:PDFName.of('JavaScript'),JS:PDFString.of('alert(1)')}));const active=await pdf.save();await assert.rejects(()=>validateUploads([new File([Uint8Array.from(active)],'active.pdf',{type:'application/pdf'})]),errorCode('invalid_file'));
});
test('idempotency stores one quote, refuses conflicting payload and writes private files',async()=>{
  const value=sampleQuote(),file={name:'drawing.pdf',mime:'application/pdf',bytes:Buffer.from('%PDF-test')};value.files=[{id:randomUUID(),path:randomUUID(),name:file.name,mime:file.mime,size:file.bytes.length}];
  const first=await store.createQuote(value,[file]);assert.equal(first.duplicate,false);
  const second=await store.createQuote({...value,id:randomUUID(),files:[{...value.files[0],path:randomUUID()}]},[file]);assert.equal(second.duplicate,true);assert.equal(second.quote.id,value.id);
  await assert.rejects(()=>store.createQuote({...value,id:randomUUID(),payloadHash:'changed',files:[{...value.files[0],path:randomUUID()}]},[file]),errorCode('idempotency_conflict'));
  assert.deepEqual(await store.readFile(value.files[0]),file.bytes);assert.equal((await stat(join(directory,'uploads',value.files[0].path))).mode&0o777,0o600);
});
test('secure local auth has no default account, signed hashed sessions and immediate revocation',async()=>{
  assert.equal(verifyPassword('a secure test password',hashPassword('a secure test password')),true);
  await assert.rejects(()=>loginAdmin('missing@example.com','wrong'),errorCode('unauthorized'));
  createLocalAdmin('editor@example.com','a secure test password','editor');
  const login=await loginAdmin('editor@example.com','a secure test password');assert.equal(login.mfaRequired,false);const actor=await actorForSession(login.cookie);assert.equal(actor?.role,'editor');
  assert.equal(await actorForSession(login.cookie+'x'),null);
  await assert.rejects(()=>requireActor(new Request('http://localhost',{headers:{Cookie:`artmaster_admin=${login.cookie}`}}),'admin'),errorCode('forbidden'));
  assert.match(sessionCookie(login.cookie),/HttpOnly; SameSite=Strict/);
  await logoutAdmin(login.cookie);assert.equal(await actorForSession(login.cookie),null);
});
test('draft edits do not publish, version conflicts cannot overwrite and schema checks references',async()=>{
  const actor:Actor={id:randomUUID(),email:'admin@example.com',role:'admin',aal:'aal1'};
  assert.equal(contentSchema.safeParse(defaultContent).success,true);
  const changed=structuredClone(defaultContent);changed.contact.email='changed@example.com';
  const version=await store.saveContent(changed,false,actor,0);assert.equal(version,1);assert.equal((await store.content()).published,null);
  await assert.rejects(()=>store.saveContent(defaultContent,true,actor,0),errorCode('version_conflict'));
  await store.saveContent(changed,true,actor,1);assert.equal((await store.content()).published?.contact.email,'changed@example.com');
  changed.services[0].relatedSlugs=['unknown-reference'];assert.equal(contentSchema.safeParse(changed).success,false);
});
test('quote input cannot skip consent or inject unknown keys and retains structured optional details',()=>{
  const input={locale:'ro',service:'test',name:'User',email:'user@example.com',phone:'+37360010400',message:'Request',consent:'true',website:'',token:'long-form-token-placeholder',idempotencyKey:randomUUID(),company:'Company',quantity:'2',dimensions:'300 x 200 mm',deadline:'2026-12-01'};
  assert.equal(quoteSchema.safeParse(input).success,true);assert.equal(quoteSchema.safeParse({...input,consent:'false'}).success,false);assert.equal(quoteSchema.safeParse({...input,admin:true}).success,false);assert.equal(quoteSchema.safeParse({...input,deadline:'2026-02-31'}).success,false);
});
