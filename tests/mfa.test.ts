import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { loginAdmin, verifyAdminMfa, actorForSession, requireActor, logoutAdmin, pendingMfaState } from '../src/lib/server/auth';
import { BackendError } from '../src/lib/server/config';
import { GET as publicImage } from '../src/app/api/media/[name]/route';
import { GET as preview } from '../src/app/api/admin/media/[name]/route';
import { GET as quotes } from '../src/app/api/admin/quotes/route';
import { GET as content, PUT as saveContent } from '../src/app/api/admin/content/route';
import { GET as attachment } from '../src/app/api/admin/quotes/[id]/files/[fileId]/route';
import { PATCH as status } from '../src/app/api/admin/quotes/[id]/route';
import { POST as media } from '../src/app/api/admin/media/route';
import { POST as retry } from '../src/app/api/admin/notifications/retry/route';
import { POST as enroll } from '../src/app/api/admin/mfa/enroll/route';
import { POST as loginRoute } from '../src/app/api/admin/login/route';
import { POST as logoutRoute } from '../src/app/api/admin/logout/route';
import { defaultContent } from '../src/lib/content/defaults';
import type { AdminRole } from '../src/lib/server/types';

// Real supabase-js runs against a deterministic, in-process HTTP fixture.
// No real credentials, Auth server, TOTP delivery or production data are used.
const userId = '00000000-0000-4000-8000-000000000001';
const authSessionId = '00000000-0000-4000-8000-000000000099';
const factorId = '00000000-0000-4000-8000-000000000002';
const secret = 'synthetic-session-secret-only-for-unit-tests';
const originalFetch = globalThis.fetch;
const names = ['ARTMASTER_STORAGE','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ARTMASTER_SESSION_SECRET','SITE_URL','NODE_ENV','ARTMASTER_ALLOW_LOCAL_PRODUCTION'];
const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
let role: AdminRole, verifiedFactor: boolean, userEnabled: boolean, roleEnabled: boolean, verifyAal: string, badCode: boolean, allowRate: boolean;
let dataReads: number;
let failTouch: boolean, publishedImage: string | null;
const storagePaths:string[]=[];
const sessions = new Map<string, { user_id: string; session_hash: string; expires_at: string; purpose: string; created_at: string; last_seen_at: string; auth_session_id: string }>();
function token(aal = 'aal1') {
  return [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'), Buffer.from(JSON.stringify({sub:userId,aal,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),role:'authenticated',session_id:authSessionId})).toString('base64url'), 'synthetic-signature'].join('.');
}
function user() { return {id:userId,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',factors:verifiedFactor?[{id:factorId,factor_type:'totp',status:'verified'}]:[]}; }
function authSession(aal = 'aal1') { return {access_token:token(aal),refresh_token:'synthetic-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user()}; }
function response(value: unknown, status = 200) { return new Response(value === undefined ? null : JSON.stringify(value), {status,headers:{'Content-Type':'application/json'}}); }
function request(cookie?: string, pending = false, method = 'GET', body?: unknown) {
  return new Request('https://site.example.invalid/api/admin/fixture', {method,headers:{Origin:'https://site.example.invalid',...(cookie?{Cookie:`${pending?'artmaster_mfa':'artmaster_admin'}=${cookie}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
}
function code(expected: string) { return (error: unknown) => error instanceof BackendError && error.code === expected; }
function encrypted(value: object) {
  const key=createHash('sha256').update(secret).digest(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');
}
beforeEach(() => {
  Object.assign(process.env,{ARTMASTER_STORAGE:'supabase',SUPABASE_URL:'https://supabase.example.invalid',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',ARTMASTER_SESSION_SECRET:secret,SITE_URL:'https://site.example.invalid',NODE_ENV:'development'});
  role='admin';verifiedFactor=false;userEnabled=true;roleEnabled=true;verifyAal='aal2';badCode=false;allowRate=true;dataReads=0;failTouch=false;publishedImage=null;storagePaths.length=0;sessions.clear();
  globalThis.fetch=async (input, init) => {
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    assert.equal(url.hostname,'supabase.example.invalid','fixture must never reach another host');
    const method=init?.method||'GET',body=typeof init?.body==='string'?JSON.parse(init.body):null;
    if(url.pathname==='/auth/v1/token')return response(authSession());
    if(url.pathname==='/auth/v1/user')return userEnabled?response(user()):response({msg:'invalid token'},401);
    if(url.pathname==='/auth/v1/factors'&&method==='POST')return response({id:factorId,type:'totp',totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg"/>',secret:'synthetic-totp',uri:'otpauth://totp/synthetic'}});
    if(url.pathname===`/auth/v1/factors/${factorId}/challenge`)return response({id:'synthetic-challenge',expires_at:Math.floor(Date.now()/1000)+300});
    if(url.pathname===`/auth/v1/factors/${factorId}/verify`){if(badCode)return response({msg:'bad code'},422);verifiedFactor=true;return response(authSession(verifyAal));}
    if(url.pathname==='/auth/v1/logout')return response(undefined,204);
    if(url.pathname==='/rest/v1/admin_roles')return response(roleEnabled?[{role}]:[]);
    if(url.pathname==='/rest/v1/admin_sessions'){
      if(method==='POST'){sessions.set(body.session_hash,{...body,created_at:new Date().toISOString(),last_seen_at:new Date().toISOString()});return response(undefined,201);}
      const hash=url.searchParams.get('session_hash')?.replace(/^eq\./,'');
      const row=hash?sessions.get(hash):undefined;
      const purpose=url.searchParams.get('purpose')?.replace(/^eq\./,'');
      const active=row&&row.user_id===userId&&(!purpose||row.purpose===purpose)&&new Date(row.expires_at).getTime()>Date.now();
      if(method==='DELETE'){
        if(!hash){for(const [key,row] of sessions)if(new Date(row.expires_at).getTime()<Date.now())sessions.delete(key);return response(undefined,204);}
        if(active)sessions.delete(hash);
        return url.searchParams.has('select')?response(active?[{user_id:userId}]:[]):response(undefined,204);
      }
      return response(active?[{user_id:userId}]:[]);
    }
    if(url.pathname==='/rest/v1/rpc/touch_admin_session'){
      if(failTouch)return response({message:'synthetic unavailable'},503);
      const row=sessions.get(body.p_session_hash),now=Date.now();
      if(!row||row.user_id!==body.p_user_id||row.auth_session_id!==body.p_auth_session_id||row.purpose!=='admin'||Date.parse(row.expires_at)<=now||Date.parse(row.created_at)<=now-8*3600000||Date.parse(row.last_seen_at)<=now-15*60000)return response(false);
      row.last_seen_at=new Date().toISOString();return response(true);
    }
    if(url.pathname==='/rest/v1/rpc/consume_rate')return response(allowRate);
    if(url.pathname==='/rest/v1/audit_log')return response(undefined,201);
    if(url.pathname==='/rest/v1/quotes'){dataReads++;return response([]);}
    if(url.pathname==='/rest/v1/site_content'){dataReads++;const published=structuredClone(defaultContent);if(publishedImage)published.services[0].image=publishedImage;return response({published,draft:null,version:0});}
    if(url.pathname.startsWith('/storage/v1/object/')){
      storagePaths.push(url.pathname);
      assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-service');
      assert.ok(url.pathname.startsWith('/storage/v1/object/portfolio-private/'),'new originals never enter a public bucket');
      return method==='POST'?response({Key:url.pathname.split('/object/')[1]},200):new Response('synthetic-private-image',{headers:{'Content-Type':'image/webp'}});
    }
    throw new Error(`Unmocked Supabase operation: ${method} ${url.pathname}`);
  };
});
afterEach(() => {globalThis.fetch=originalFetch;for(const name of names){if(originalEnv[name]===undefined)delete process.env[name];else process.env[name]=originalEnv[name];}});

for(const selectedRole of ['viewer','editor','admin'] as const)test(`${selectedRole}: password-only session can enroll but cannot access any protected API`, async () => {
  role=selectedRole;
  const result=await loginAdmin('fixture@example.invalid','synthetic password');
  assert.equal(result.mfaRequired,true);assert.equal('enrollmentRequired' in result&&result.enrollmentRequired,true);
  assert.equal(await actorForSession(result.cookie),null);
  assert.equal(await pendingMfaState(request(result.cookie,true)),'enroll');
  for(const cookie of [undefined,result.cookie]){
    const req=request(cookie);
    const responses=await Promise.all([
      quotes(req),content(req),preview(req,{params:Promise.resolve({name:`${factorId}.webp`})}),attachment(req,{params:Promise.resolve({id:userId,fileId:factorId})}),
      status(request(cookie,false,'PATCH',{status:'in_progress'}),{params:Promise.resolve({id:userId})}),
      media(request(cookie,false,'POST')),retry(request(cookie,false,'POST')),
      saveContent(request(cookie,false,'PUT',{content:defaultContent,version:0,action:'save-draft'})),
    ]);
    assert.deepEqual(responses.map(response=>response.status),[401,401,401,401,401,401,401,401]);
  }
  assert.equal(dataReads,0,'no protected records read before MFA');
  const setup=await enroll(request(result.cookie,true,'POST'));
  assert.equal(setup.status,200);
  assert.match((await setup.json()).qrCode,/^data:image\/svg\+xml/);
  const pending=setup.headers.get('set-cookie')!.match(/^artmaster_mfa=([^;]+)/)![1];
  const session=await verifyAdminMfa(pending,'123456');
  assert.equal((await requireActor(request(session))).role,selectedRole);
  assert.equal((await requireActor(request(session))).aal,'aal2');
  assert.equal((await quotes(request(session))).status,200);
  await assert.rejects(()=>verifyAdminMfa(pending,'123456'),code('unauthorized'));
  if(selectedRole==='viewer'){
    await assert.rejects(()=>requireActor(request(session),'editor'),code('forbidden'));
    assert.equal((await status(request(session,false,'PATCH',{status:'in_progress'}),{params:Promise.resolve({id:userId})})).status,403);
    assert.equal((await media(request(session,false,'POST'))).status,403);
    assert.equal((await saveContent(request(session,false,'PUT',{content:defaultContent,version:0,action:'save-draft'}))).status,403);
  }
  if(selectedRole!=='admin'){
    assert.equal((await retry(request(session,false,'POST'))).status,403);
    assert.equal((await saveContent(request(session,false,'PUT',{content:defaultContent,version:0,action:'publish'}))).status,403);
  }
  await logoutAdmin(session);assert.equal(await actorForSession(session),null);
});

test('enrolled user must complete MFA; wrong code, AAL1 result and rate limiting fail closed',async()=>{
  verifiedFactor=true;
  const result=await loginAdmin('fixture@example.invalid','synthetic password');
  assert.equal(await pendingMfaState(request(result.cookie,true)),'challenge');
  assert.equal((await enroll(request(result.cookie,true,'POST'))).status,403);
  badCode=true;await assert.rejects(()=>verifyAdminMfa(result.cookie,'000000'),code('unauthorized'));
  badCode=false;verifyAal='aal1';await assert.rejects(()=>verifyAdminMfa(result.cookie,'123456'),code('mfa_required'));
  assert.equal([...sessions.values()].filter(session=>session.purpose==='admin').length,0);
  allowRate=false;await assert.rejects(()=>verifyAdminMfa(result.cookie,'123456'),code('rate_limited'));
  allowRate=true;verifyAal='aal2';const cookie=await verifyAdminMfa(result.cookie,'123456');assert.equal((await actorForSession(cookie))?.aal,'aal2');
});

test('legacy AAL1 cookies are denied even outside production; expired, forged, role-revoked and Auth-rejected sessions fail closed',async()=>{
  const sid='synthetic-legacy-sid';
  sessions.set(createHash('sha256').update(sid).digest('hex'),{user_id:userId,session_hash:'unused',expires_at:new Date(Date.now()+60000).toISOString(),purpose:'admin',created_at:new Date().toISOString(),last_seen_at:new Date().toISOString(),auth_session_id:authSessionId});
  const old=encrypted({access:token(),refresh:'synthetic',expires:Date.now()+60000,sid});
  for(const mode of ['development','production']){
    Object.assign(process.env,{NODE_ENV:mode,ARTMASTER_ALLOW_LOCAL_PRODUCTION:'true'});
    await assert.rejects(()=>requireActor(request(old)),code('mfa_required'));
  }
  assert.equal((await quotes(request(old))).status,403);
  const valid=encrypted({access:token('aal2'),refresh:'synthetic',expires:Date.now()+60000,sid});
  assert.equal((await requireActor(request(valid))).aal,'aal2');
  assert.equal(await actorForSession(valid+'x'),null);
  assert.equal(await actorForSession(encrypted({access:token('aal2'),expires:Date.now()-1,sid})),null);
  roleEnabled=false;await assert.rejects(()=>requireActor(request(valid)),code('unauthorized'));
  roleEnabled=true;userEnabled=false;assert.equal(await actorForSession(valid),null);
});

test('logout revokes restricted MFA sessions and login never sets an administrative cookie before MFA',async()=>{
  const result=await loginRoute(request(undefined,false,'POST',{email:'fixture@example.invalid',password:'synthetic password'}));
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{ok:false,mfaRequired:true,enrollmentRequired:true});
  const cookies=result.headers.getSetCookie();
  const pending=cookies.find(cookie=>cookie.startsWith('artmaster_mfa='))!.match(/^artmaster_mfa=([^;]+)/)![1];
  assert.ok(cookies.some(cookie=>cookie.startsWith('artmaster_admin=;')&&cookie.includes('Max-Age=0')));
  assert.equal((await logoutRoute(request(pending,true,'POST'))).status,200);
  assert.equal(await pendingMfaState(request(pending,true)),null);
  assert.equal((await enroll(request(pending,true,'POST'))).status,401);
});


test('missing, expired and role-revoked MFA setup sessions cannot enroll or complete verification',async()=>{
  assert.equal((await enroll(request(undefined,true,'POST'))).status,401);
  const result=await loginAdmin('fixture@example.invalid','synthetic password');
  await assert.rejects(()=>verifyAdminMfa(result.cookie,'123456'),code('unauthorized'));
  assert.equal((await enroll(new Request('https://site.example.invalid/api/admin/mfa/enroll',{method:'POST',headers:{Origin:'https://other.example.invalid',Cookie:`artmaster_mfa=${result.cookie}`}}))).status,403);
  roleEnabled=false;assert.equal((await enroll(request(result.cookie,true,'POST'))).status,401);
  roleEnabled=true;for(const session of sessions.values())session.expires_at=new Date(Date.now()-1).toISOString();
  assert.equal(await pendingMfaState(request(result.cookie,true)),null);
  assert.equal((await enroll(request(result.cookie,true,'POST'))).status,401);
});

test('Supabase sessions expire on idle and absolute deadlines; activity never revives them',async()=>{
  verifiedFactor=true;
  for(const kind of ['idle','absolute','revoked'] as const){
    const pending=await loginAdmin('fixture@example.invalid','synthetic password');
    const cookie=await verifyAdminMfa(pending.cookie,'123456');
    const entry=[...sessions.entries()].find(([,row])=>row.purpose==='admin')!;
    const [hash,row]=entry;
    assert.equal((await quotes(request(cookie))).status,200);
    const absolute=row.created_at;
    assert.equal((await quotes(request(cookie))).status,200);
    assert.equal(row.created_at,absolute,'requests do not renew absolute age');
    if(kind==='idle')row.last_seen_at=new Date(Date.now()-15*60000-1).toISOString();
    if(kind==='absolute')row.created_at=new Date(Date.now()-8*3600000-1).toISOString();
    if(kind==='revoked')sessions.delete(hash);
    assert.equal((await quotes(request(cookie))).status,401);
    assert.equal((await preview(request(cookie),{params:Promise.resolve({name:`${factorId}.webp`})})).status,401);
    sessions.clear();
  }
});

test('unauthenticated malformed CMS writes fail before processing their content',async()=>{
  const result=await saveContent(new Request('https://site.example.invalid/api/admin/content',{method:'PUT',headers:{Origin:'https://site.example.invalid','Content-Type':'application/json'},body:'not JSON'}));
  assert.equal(result.status,401);
  assert.equal(dataReads,0);
});

test('session registry failure and Auth-session mismatch deny protected reads',async()=>{
  verifiedFactor=true;
  const pending=await loginAdmin('fixture@example.invalid','synthetic password');
  const cookie=await verifyAdminMfa(pending.cookie,'123456');
  failTouch=true;assert.equal((await quotes(request(cookie))).status,401);assert.equal(dataReads,0);
  failTouch=false;const row=[...sessions.values()].find(row=>row.purpose==='admin')!;
  row.auth_session_id=factorId;assert.equal((await quotes(request(cookie))).status,401);assert.equal(dataReads,0);
});

test('Supabase client uploads only private originals; public gateway checks publication before downloading',async()=>{
  verifiedFactor=true;
  const pending=await loginAdmin('fixture@example.invalid','synthetic password');
  const cookie=await verifyAdminMfa(pending.cookie,'123456');
  const bytes=await sharp({create:{width:3,height:3,channels:3,background:'#ffca05'}}).png().toBuffer();
  const form=new FormData();form.set('file',new File([Uint8Array.from(bytes)],'synthetic.png',{type:'image/png'}));
  const uploaded=await media(new Request('https://site.example.invalid/api/admin/media',{method:'POST',headers:{Origin:'https://site.example.invalid',Cookie:`artmaster_admin=${cookie}`},body:form}));
  assert.equal(uploaded.status,201);const {url}=await uploaded.json(),name=url.split('/').pop(),params={params:Promise.resolve({name})};
  assert.equal(storagePaths.length,1);
  assert.equal((await publicImage(request(),params)).status,404);
  assert.equal(storagePaths.length,1,'draft bytes were never downloaded for a public request');
  assert.equal((await preview(request(),params)).status,401);
  assert.equal((await preview(request(cookie),params)).status,200);
  publishedImage=url;assert.equal((await publicImage(request(),params)).status,200);
  assert.equal(storagePaths.length,3);
});
