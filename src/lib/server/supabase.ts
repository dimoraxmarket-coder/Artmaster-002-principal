import { createClient } from '@supabase/supabase-js';
import { BackendError } from './config';
import { contentSchema, type QuoteStatus } from './schema';
import type { Storage, Quote, IncomingFile, StoredFile, Actor, ContentState } from './types';

export function supabaseService(){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new BackendError('unavailable',503);
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function supabaseAuth(){
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_ANON_KEY)throw new BackendError('unavailable',503);
  return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
function check(error:unknown){if(error)throw new BackendError('unavailable',503);}
function quote(row:Record<string,unknown>|null):Quote|null{return row?{...(row.data as Quote),notification:row.notification as Quote['notification']}:null;}
export class SupabaseStorage implements Storage {
  async secret(name:string){const value=process.env[name];if(!value||value.length<32)throw new BackendError('unavailable',503);return value;}
  async consumeRate(key:string,limit:number,windowMs:number){const {data,error}=await supabaseService().rpc('consume_rate',{p_bucket:key,p_limit:limit,p_window_ms:windowMs});check(error);return data===true;}
  async findQuote(key:string){const {data,error}=await supabaseService().from('quotes').select('data,notification').eq('idempotency_key',key).maybeSingle();check(error);return quote(data);}
  async createQuote(value:Quote,files:IncomingFile[]){
    const client=supabaseService(),saved:string[]=[];
    try {
      for(let i=0;i<files.length;i++){
        const {error}=await client.storage.from('quote-files').upload(value.files[i].path,files[i].bytes,{contentType:files[i].mime,upsert:false});check(error);saved.push(value.files[i].path);
      }
      const {error}=await client.from('quotes').insert({id:value.id,idempotency_key:value.idempotencyKey,payload_hash:value.payloadHash,data:value,notification:value.notification});
      if(error?.code==='23505'){
        if(saved.length)await client.storage.from('quote-files').remove(saved);
        const existing=await this.findQuote(value.idempotencyKey);
        if(!existing||existing.payloadHash!==value.payloadHash)throw new BackendError('idempotency_conflict',409);
        return {quote:existing,duplicate:true};
      }
      check(error);return {quote:value,duplicate:false};
    }catch(error){if(saved.length)await client.storage.from('quote-files').remove(saved);throw error;}
  }
  async listQuotes(){const {data,error}=await supabaseService().from('quotes').select('data,notification').order('created_at',{ascending:false}).limit(200);check(error);return(data||[]).map(row=>quote(row)!);}
  async getQuote(id:string){const {data,error}=await supabaseService().from('quotes').select('data,notification').eq('id',id).maybeSingle();check(error);return quote(data);}
  async updateQuote(id:string,status:QuoteStatus,actor:Actor){const current=await this.getQuote(id);if(!current)throw new BackendError('not_found',404);const {error}=await supabaseService().from('quotes').update({data:{...current,status}}).eq('id',id);check(error);await this.audit(actor,'quote.status',id);}
  async readFile(file:StoredFile){if(!/^[a-f0-9-]{36}$/.test(file.path))throw new BackendError('not_found',404);const {data,error}=await supabaseService().storage.from('quote-files').download(file.path);check(error);if(!data)throw new BackendError('not_found',404);return Buffer.from(await data.arrayBuffer());}
  async content():Promise<ContentState>{const {data,error}=await supabaseService().from('site_content').select('published,draft,version').eq('id',1).single();check(error);return {published:data?.published?contentSchema.parse(data.published):null,draft:data?.draft?contentSchema.parse(data.draft):null,version:data?.version||0};}
  async saveContent(value:ContentState['draft'],publish:boolean,actor:Actor,expectedVersion:number){
    const clean=contentSchema.parse(value),{data,error}=await supabaseService().rpc('save_site_content',{p_content:clean,p_publish:publish,p_actor:actor.id,p_expected_version:expectedVersion});
    if(error?.code==='40001')throw new BackendError('version_conflict',409);check(error);return Number(data);
  }
  async markNotification(id:string,sent:boolean,error?:string){const {error:failure}=await supabaseService().rpc('mark_quote_notification',{p_id:id,p_sent:sent,p_error:error||null});check(failure);}
  async pendingNotifications(){const {data,error}=await supabaseService().from('quotes').select('data,notification').neq('notification','sent').lt('attempts',10).lte('next_attempt',new Date().toISOString()).limit(20);check(error);return(data||[]).map(row=>quote(row)!);}
  async audit(actor:Actor,action:string,target:string){const {error}=await supabaseService().from('audit_log').insert({actor_id:actor.id,action,target});check(error);}
}
