import './environment';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createLocalAdmin } from '../src/lib/server/auth';
import { storageMode } from '../src/lib/server/config';
import { supabaseService } from '../src/lib/server/supabase';
import type { AdminRole } from '../src/lib/server/types';

async function password(){
  if(process.env.ADMIN_PASSWORD)return process.env.ADMIN_PASSWORD;
  if(!process.stdin.isTTY){
    const chunks:Buffer[]=[];let length=0;
    for await(const chunk of process.stdin){const bytes=Buffer.from(chunk);length+=bytes.length;if(length>1024)throw new Error('Parola primită este prea lungă.');chunks.push(bytes);}
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/,'');
  }
  process.stderr.write('Parolă nouă (minimum 12 caractere, nu este afișată): ');
  const silent=new Writable({write(_chunk,_encoding,callback){callback();}});
  const rl=createInterface({input:process.stdin,output:silent,terminal:true});
  try{return await rl.question('');}finally{rl.close();process.stderr.write('\n');}
}
async function main(){
  const email=process.env.ADMIN_EMAIL,role=(process.env.ADMIN_ROLE||'admin') as AdminRole;
  if(!email||!['viewer','editor','admin'].includes(role))throw new Error('Setează ADMIN_EMAIL și opțional ADMIN_ROLE=viewer|editor|admin.');
  const secret=await password();if(secret.length<12||secret.length>128)throw new Error('Parola trebuie să aibă între 12 și 128 de caractere.');
  if(storageMode()==='local')createLocalAdmin(email,secret,role);
  else{
    const client=supabaseService(),{data,error}=await client.auth.admin.createUser({email,password:secret,email_confirm:true});
    if(error||!data.user)throw new Error('Crearea contului Supabase nu a reușit. Verifică configurația și dacă există deja.');
    const {error:failure}=await client.from('admin_roles').insert({user_id:data.user.id,role});
    if(failure){await client.auth.admin.deleteUser(data.user.id);throw new Error('Rolul nu a putut fi atribuit. Aplică migrarea bazei de date.');}
  }
  console.log('Cont creat. Parola nu este afișată. În modul Supabase configurează TOTP prin /admin; toate datele administrative necesită MFA.');
}
main().catch(()=>{console.error('Crearea contului nu a reușit. Verifică ADMIN_EMAIL, parola de 12–128 caractere, configurația și absența unui cont cu același e-mail.');process.exitCode=1;});
