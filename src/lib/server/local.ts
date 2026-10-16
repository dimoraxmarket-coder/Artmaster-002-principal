import { contentAssets } from '../content/visual-assets';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDirectory, BackendError } from './config';
import { contentSchema, type QuoteStatus } from './schema';
import type { Actor, ContentState, IncomingFile, Quote, Storage, StoredFile } from './types';

import { initializeContentHistory, appendContentVersion } from './content-history-local';

const databases=new Map<string,DatabaseSync>();
export function localDatabase() {
  const dir=dataDirectory();
  let db=databases.get(dir);
  if(db)return db;
  mkdirSync(join(dir,'uploads'),{recursive:true,mode:0o700});
  chmodSync(dir,0o700);
  db=new DatabaseSync(join(dir,'artmaster.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_events(bucket TEXT NOT NULL,time INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS rate_bucket ON rate_events(bucket,time);
    CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,idempotency_key TEXT NOT NULL UNIQUE,payload_hash TEXT NOT NULL,data TEXT NOT NULL,notification TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,last_error TEXT);
    CREATE INDEX IF NOT EXISTS quotes_created_date ON quotes(json_extract(data,'$.createdAt'));
    CREATE TABLE IF NOT EXISTS content(id INTEGER PRIMARY KEY CHECK(id=1),published TEXT,draft TEXT,version INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO content(id) VALUES(1);
    CREATE TABLE IF NOT EXISTS admins(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')));
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,time TEXT NOT NULL);
  `);
  // Additive migration: unknown-age legacy sessions fail closed (timestamps 0).
  const sessionColumns=new Set((db.prepare('PRAGMA table_info(sessions)').all() as {name:string}[]).map(column=>column.name));
  for(const name of ['created_at','last_seen_at'])if(!sessionColumns.has(name))db.exec(`ALTER TABLE sessions ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0`);
  const adminColumns=new Set((db.prepare('PRAGMA table_info(admins)').all() as {name:string}[]).map(column=>column.name));
  if(!adminColumns.has('enabled'))db.exec('ALTER TABLE admins ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))');
  if(!adminColumns.has('version'))db.exec('ALTER TABLE admins ADD COLUMN version INTEGER NOT NULL DEFAULT 0');
  if(!sessionColumns.has('reference'))db.exec('ALTER TABLE sessions ADD COLUMN reference TEXT');
  if(!sessionColumns.has('verified_at'))db.exec('ALTER TABLE sessions ADD COLUMN verified_at INTEGER');
  if(!sessionColumns.has('role_version'))db.exec('ALTER TABLE sessions ADD COLUMN role_version INTEGER NOT NULL DEFAULT 0');
  for(const row of db.prepare('SELECT hash FROM sessions WHERE reference IS NULL').all() as {hash:string}[])db.prepare('UPDATE sessions SET reference=? WHERE hash=?').run(randomUUID(),row.hash);
  const auditColumns=new Set((db.prepare('PRAGMA table_info(audit)').all() as {name:string}[]).map(column=>column.name));
  if(!auditColumns.has('context'))db.exec("ALTER TABLE audit ADD COLUMN context TEXT NOT NULL DEFAULT '{}'");
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS session_reference ON sessions(reference);
    CREATE INDEX IF NOT EXISTS session_account ON sessions(admin_id);
    CREATE INDEX IF NOT EXISTS audit_security ON audit(action,time,id);
    CREATE TRIGGER IF NOT EXISTS audit_append_only_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit is append only'); END;
    CREATE TRIGGER IF NOT EXISTS audit_append_only_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit is append only'); END;
  `);
  const quoteColumns=new Set((db.prepare('PRAGMA table_info(quotes)').all() as {name:string}[]).map(column=>column.name));
  if(!quoteColumns.has('version'))db.exec('ALTER TABLE quotes ADD COLUMN version INTEGER NOT NULL DEFAULT 0');
  if(!quoteColumns.has('assigned_to'))db.exec('ALTER TABLE quotes ADD COLUMN assigned_to TEXT REFERENCES admins(id) ON DELETE SET NULL');
  db.exec(`CREATE TABLE IF NOT EXISTS quote_events(id INTEGER PRIMARY KEY AUTOINCREMENT,quote_id TEXT NOT NULL REFERENCES quotes(id),actor TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('status','assignment','note')),body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS quote_event_lookup ON quote_events(quote_id,id);
    CREATE INDEX IF NOT EXISTS quote_assignee ON quotes(assigned_to);
    CREATE TABLE IF NOT EXISTS media_assets(url TEXT PRIMARY KEY,name TEXT NOT NULL,bytes INTEGER NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,created_at TEXT NOT NULL,created_by TEXT,archived_at TEXT);
  `);
  initializeContentHistory(db);
  db.function('unicode_lower',{deterministic:true},value=>String(value).toLocaleLowerCase());
  chmodSync(join(dir,'artmaster.sqlite'),0o600);
  databases.set(dir,db);
  return db;
}
function decodeQuote(row:Record<string,unknown>|undefined):Quote|null {
  return row ? {...JSON.parse(row.data as string),notification:row.notification} as Quote:null;
}
function audit(db:DatabaseSync,actor:Actor,action:string,target:string){db.prepare('INSERT INTO audit(actor,action,target,time) VALUES(?,?,?,?)').run(actor.id,action,target,new Date().toISOString());}
export class LocalStorage implements Storage {
  async secret(name:string) {
    const env=process.env[name];
    if(env){if(env.length<32)throw new BackendError('unavailable',503);return env;}
    const db=localDatabase(),key=`secret:${name}`;
    db.prepare('INSERT OR IGNORE INTO meta(key,value) VALUES(?,?)').run(key,randomBytes(48).toString('base64url'));
    return (db.prepare('SELECT value FROM meta WHERE key=?').get(key) as {value:string}).value;
  }
  async consumeRate(key:string,limit:number,windowMs:number,now=Date.now()) {
    const db=localDatabase();db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('DELETE FROM rate_events WHERE bucket=? AND time<?').run(key,now-windowMs);
      const count=(db.prepare('SELECT COUNT(*) AS n FROM rate_events WHERE bucket=? AND time>?').get(key,now-windowMs) as {n:number}).n;
      if(count>=limit){db.exec('COMMIT');return false;}
      db.prepare('INSERT INTO rate_events(bucket,time) VALUES(?,?)').run(key,now);
      db.exec('COMMIT');return true;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  async findQuote(key:string){return decodeQuote(localDatabase().prepare('SELECT data,notification FROM quotes WHERE idempotency_key=?').get(key));}
  async createQuote(quote:Quote,files:IncomingFile[]) {
    localDatabase();
    const saved:string[]=[];
    try {
      for(let i=0;i<files.length;i++){
        const path=quote.files[i].path;
        await writeFile(join(dataDirectory(),'uploads',path),files[i].bytes,{flag:'wx',mode:0o600});saved.push(path);
      }
      const db=localDatabase();
      const result=db.prepare('INSERT OR IGNORE INTO quotes(id,idempotency_key,payload_hash,data,notification) VALUES(?,?,?,?,?)').run(quote.id,quote.idempotencyKey,quote.payloadHash,JSON.stringify(quote),quote.notification);
      if(result.changes===0){
        await Promise.all(saved.map(p=>unlink(join(dataDirectory(),'uploads',p))));
        const existing=await this.findQuote(quote.idempotencyKey);
        if(!existing||existing.payloadHash!==quote.payloadHash)throw new BackendError('idempotency_conflict',409);
        return {quote:existing,duplicate:true};
      }
      return {quote,duplicate:false};
    }catch(error){await Promise.all(saved.map(p=>unlink(join(dataDirectory(),'uploads',p)).catch(()=>{})));throw error;}
  }
  async listQuotes(){return localDatabase().prepare('SELECT data,notification FROM quotes ORDER BY rowid DESC LIMIT 200').all().map(row=>decodeQuote(row)!);}
  async getQuote(id:string){return decodeQuote(localDatabase().prepare('SELECT data,notification FROM quotes WHERE id=?').get(id));}
  async updateQuote(id:string,status:QuoteStatus,actor:Actor){await (await import('./crm')).changeQuote(id,{status},actor);}
  async readFile(file:StoredFile){if(!/^[a-f0-9-]{36}$/.test(file.path))throw new BackendError('not_found',404);return readFile(join(dataDirectory(),'uploads',file.path));}
  async content():Promise<ContentState>{
    const row=localDatabase().prepare('SELECT published,draft,version FROM content WHERE id=1').get() as {published:string|null;draft:string|null;version:number};
    return {published:row.published?contentSchema.parse(JSON.parse(row.published)):null,draft:row.draft?contentSchema.parse(JSON.parse(row.draft)):null,version:row.version};
  }
  async saveContent(value:ContentState['draft'],publish:boolean,actor:Actor,expectedVersion:number,sourceId?:number){
    const clean=contentSchema.parse(value),db=localDatabase();db.exec('BEGIN IMMEDIATE');
    try {
      const urls=contentAssets(clean).map(item=>item.image);
      for(const row of db.prepare('SELECT url FROM media_assets WHERE archived_at IS NOT NULL').all() as {url:string}[])if(urls.includes(row.url))throw new BackendError('asset_in_use',409);
      const result=publish?db.prepare('UPDATE content SET published=?,draft=?,version=version+1 WHERE id=1 AND version=?').run(JSON.stringify(clean),JSON.stringify(clean),expectedVersion):db.prepare('UPDATE content SET draft=?,version=version+1 WHERE id=1 AND version=?').run(JSON.stringify(clean),expectedVersion);
      if(!result.changes)throw new BackendError('version_conflict',409);
      appendContentVersion(db,JSON.stringify(clean),expectedVersion+1,publish,actor.id,sourceId);
      audit(db,actor,sourceId?'content.restore':publish?'content.publish':'content.draft','site');db.exec('COMMIT');return expectedVersion+1;
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  async markNotification(id:string,sent:boolean,error?:string){
    const db=localDatabase();
    if(sent)db.prepare("UPDATE quotes SET notification='sent',last_error=NULL WHERE id=?").run(id);
    else db.prepare("UPDATE quotes SET notification='pending',attempts=attempts+1,next_attempt=?,last_error=? WHERE id=?").run(Date.now()+300000,error||'provider_unavailable',id);
  }
  async pendingNotifications(){return localDatabase().prepare("SELECT data,notification FROM quotes WHERE notification<>'sent' AND attempts<10 AND next_attempt<=? ORDER BY rowid LIMIT 20").all(Date.now()).map(row=>decodeQuote(row)!);}
  async audit(actor:Actor,action:string,target:string){audit(localDatabase(),actor,action,target);}
}
export function hashSession(token:string){return createHash('sha256').update(token).digest('hex');}
