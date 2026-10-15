import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHmac, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { BackendError, storageMode } from './config';
import { getStorage } from './storage';
import { localDatabase, hashSession } from './local';
import { supabaseAuth, supabaseService } from './supabase';
import type { Actor, AdminRole } from './types';

export const SESSION_COOKIE='artmaster_admin';
export const PREAUTH_COOKIE='artmaster_mfa';
const SESSION_SECONDS=8*60*60;
export const loginSchema=z.object({email:z.email().max(254).transform(v=>v.toLowerCase().trim()),password:z.string().min(1).max(128)}).strict();
export function hashPassword(password:string){
  if(password.length<12||password.length>128)throw new BackendError('weak_password',400);
  const salt=randomBytes(24).toString('base64url');
  return `scrypt:${salt}:${scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}).toString('base64url')}`;
}
export function verifyPassword(password:string,stored:string){
  const [algorithm,salt,encoded]=stored.split(':');if(algorithm!=='scrypt'||!salt||!encoded||password.length>128)return false;
  const expected=Buffer.from(encoded,'base64url'),actual=scryptSync(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export function createLocalAdmin(email:string,password:string,role:AdminRole='admin'){
  const safe=z.email().parse(email.toLowerCase().trim()),id=randomUUID();
  if(!['viewer','editor','admin'].includes(role))throw new BackendError('invalid_input',400);
  const db=localDatabase();
  if(db.prepare('SELECT id FROM admins WHERE email=?').get(safe))throw new BackendError('account_exists',409);
  db.prepare('INSERT INTO admins(id,email,password_hash,role) VALUES(?,?,?,?)').run(id,safe,hashPassword(password),role);
  return id;
}
async function signed(token:string){const secret=await getStorage().secret('ARTMASTER_SESSION_SECRET');return `${token}.${createHmac('sha256',secret).update(token).digest('base64url')}`;}
async function unsigned(value:string){
  const [token,mac,...rest]=value.split('.');if(rest.length||!token||!mac)return null;
  const expected=Buffer.from((await signed(token)).split('.')[1]),actual=Buffer.from(mac);
  return expected.length===actual.length&&timingSafeEqual(expected,actual)?token:null;
}
type SupabaseSession={access:string;refresh:string;expires:number;factor?:string;challenge?:string;sid?:string};
async function encryptSession(value:SupabaseSession){
  const secret=await getStorage().secret('ARTMASTER_SESSION_SECRET'),key=createHash('sha256').update(secret).digest(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64url');
}
async function decryptSession(value:string):Promise<SupabaseSession|null>{
  try{const data=Buffer.from(value,'base64url');if(data.length<30||data.length>16000)return null;const secret=await getStorage().secret('ARTMASTER_SESSION_SECRET'),key=createHash('sha256').update(secret).digest(),cipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));const parsed=JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8')) as SupabaseSession;return typeof parsed.expires==='number'&&parsed.expires>Date.now()?parsed:null;}catch{return null;}
}
function jwtAal(token:string):Actor['aal']{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8')).aal==='aal2'?'aal2':'aal1';}catch{return 'aal1';}}
async function supabaseRole(id:string){const {data,error}=await supabaseService().from('admin_roles').select('role').eq('user_id',id).maybeSingle();if(error||!data||!['viewer','editor','admin'].includes(data.role))throw new BackendError('unauthorized',401);return data.role as AdminRole;}
async function establishSupabaseSession(session:SupabaseSession,userId:string){
  const service=supabaseService();
  const {error:cleanupError}=await service.from('admin_sessions').delete().lt('expires_at',new Date().toISOString());if(cleanupError)throw new BackendError('unavailable',503);
  const sid=randomBytes(32).toString('base64url'),{error}=await service.from('admin_sessions').insert({session_hash:hashSession(sid),user_id:userId,expires_at:new Date(session.expires).toISOString()});
  if(error)throw new BackendError('unavailable',503);
  return encryptSession({...session,sid});
}

export async function loginAdmin(email:string,password:string){
  if(storageMode()==='local'){
    const db=localDatabase(),admin=db.prepare('SELECT id,email,password_hash,role FROM admins WHERE email=?').get(email.toLowerCase()) as {id:string;email:string;password_hash:string;role:AdminRole}|undefined;
    // Unknown accounts perform the same costly password derivation.
    const valid=verifyPassword(password,admin?.password_hash||`scrypt:unregistered:${Buffer.alloc(64).toString('base64url')}`);
    if(!admin||!valid)throw new BackendError('unauthorized',401);
    const token=randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    db.prepare('INSERT INTO sessions(hash,admin_id,expires) VALUES(?,?,?)').run(hashSession(token),admin.id,Date.now()+SESSION_SECONDS*1000);
    await getStorage().audit({id:admin.id,email:admin.email,role:admin.role,aal:'aal1'},'admin.login','session');
    return {cookie:await signed(token),mfaRequired:false};
  }
  const client=supabaseAuth(),{data,error}=await client.auth.signInWithPassword({email,password});
  if(error||!data.session||!data.user)throw new BackendError('unauthorized',401);
  const role=await supabaseRole(data.user.id),session=data.session;
  const factors=data.user.factors?.filter(factor=>factor.factor_type==='totp'&&factor.status==='verified')||[];
  if(factors.length){
    const {data:challenge,error:failure}=await client.auth.mfa.challenge({factorId:factors[0].id});
    if(failure||!challenge)throw new BackendError('unauthorized',401);
    return {cookie:await encryptSession({access:session.access_token,refresh:session.refresh_token,expires:Date.now()+300000,factor:factors[0].id,challenge:challenge.id}),mfaRequired:true};
  }
  await getStorage().audit({id:data.user.id,email,role,aal:jwtAal(session.access_token)},'admin.login','session');
  return {cookie:await establishSupabaseSession({access:session.access_token,refresh:session.refresh_token,expires:Math.min(Date.now()+SESSION_SECONDS*1000,(session.expires_at||0)*1000)},data.user.id),mfaRequired:false};
}
export async function verifyAdminMfa(cookie:string,code:string){
  if(!/^\d{6}$/.test(code)||storageMode()!=='supabase')throw new BackendError('unauthorized',401);
  const session=await decryptSession(cookie);if(!session?.factor||!session.challenge)throw new BackendError('unauthorized',401);
  const client=supabaseAuth();
  const {error:failure}=await client.auth.setSession({access_token:session.access,refresh_token:session.refresh});if(failure)throw new BackendError('unauthorized',401);
  const {data,error}=await client.auth.mfa.verify({factorId:session.factor,challengeId:session.challenge,code});
  if(error||!data)throw new BackendError('unauthorized',401);
  const {data:user,error:userError}=await client.auth.getUser(data.access_token);if(userError||!user.user)throw new BackendError('unauthorized',401);await supabaseRole(user.user.id);
  return await establishSupabaseSession({access:data.access_token,refresh:data.refresh_token,expires:Date.now()+Math.min(SESSION_SECONDS,data.expires_in)*1000},user.user.id);
}
export async function actorForSession(value:string|undefined):Promise<Actor|null>{
  if(!value)return null;
  if(storageMode()==='local'){
    const token=await unsigned(value);if(!token)return null;
    const row=localDatabase().prepare('SELECT a.id,a.email,a.role FROM sessions s JOIN admins a ON s.admin_id=a.id WHERE s.hash=? AND s.expires>?').get(hashSession(token),Date.now()) as {id:string;email:string;role:AdminRole}|undefined;
    return row?{...row,aal:'aal1'}:null;
  }
  const session=await decryptSession(value);if(!session||session.factor||!session.sid)return null;
  const {data,error}=await supabaseAuth().auth.getUser(session.access);if(error||!data.user)return null;
  const {data:active,error:sessionError}=await supabaseService().from('admin_sessions').select('user_id').eq('session_hash',hashSession(session.sid)).eq('user_id',data.user.id).gt('expires_at',new Date().toISOString()).maybeSingle();if(sessionError||!active)return null;
  return {id:data.user.id,email:data.user.email||'',role:await supabaseRole(data.user.id),aal:jwtAal(session.access)};
}
export function cookieValue(request:Request,name=SESSION_COOKIE){return request.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${name}=`))?.slice(name.length+1);}
export async function requireActor(request?:Request,minimum:AdminRole='viewer',sensitive=false){
  const value=request?cookieValue(request):(await cookies()).get(SESSION_COOKIE)?.value;
  const actor=await actorForSession(value);if(!actor)throw new BackendError('unauthorized',401);
  const rank={viewer:0,editor:1,admin:2};if(rank[actor.role]<rank[minimum])throw new BackendError('forbidden',403);
  if(sensitive&&process.env.NODE_ENV==='production'&&storageMode()==='supabase'&&actor.aal!=='aal2')throw new BackendError('mfa_required',403);
  return actor;
}
export async function logoutAdmin(value:string|undefined){
  if(!value)return;
  if(storageMode()==='local'){const token=await unsigned(value);if(token)localDatabase().prepare('DELETE FROM sessions WHERE hash=?').run(hashSession(token));}
  else {const session=await decryptSession(value);if(session){if(session.sid){const {error}=await supabaseService().from('admin_sessions').delete().eq('session_hash',hashSession(session.sid));if(error)throw new BackendError('unavailable',503);}await supabaseService().auth.admin.signOut(session.access,'local');}}
}
export async function enrollAdminMfa(request:Request){
  const actor=await requireActor(request,'editor');if(storageMode()!=='supabase')throw new BackendError('unavailable',503);
  const value=cookieValue(request),session=value?await decryptSession(value):null;if(!session)throw new BackendError('unauthorized',401);
  const client=supabaseAuth();const {error:failure}=await client.auth.setSession({access_token:session.access,refresh_token:session.refresh});if(failure)throw new BackendError('unauthorized',401);
  const {data:factors,error:factorError}=await client.auth.mfa.listFactors();if(factorError||factors?.totp.some(factor=>factor.status==='verified'))throw new BackendError('already_enrolled',409);
  for(const factor of factors?.all||[])if(factor.factor_type==='totp'&&factor.status==='unverified'){const {error}=await client.auth.mfa.unenroll({factorId:factor.id});if(error)throw new BackendError('unavailable',503);}
  const {data,error}=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'ARTMASTER'});if(error||!data)throw new BackendError('unavailable',503);
  const {data:challenge,error:challengeError}=await client.auth.mfa.challenge({factorId:data.id});if(challengeError||!challenge)throw new BackendError('unavailable',503);
  await getStorage().audit(actor,'admin.mfa.enroll','factor');
  return {qrCode:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.totp.qr_code)}`,cookie:await encryptSession({access:session.access,refresh:session.refresh,expires:Date.now()+300000,factor:data.id,challenge:challenge.id})};
}
export function sessionCookie(value:string,name=SESSION_COOKIE,maxAge=SESSION_SECONDS){return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;}
