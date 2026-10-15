import type { SiteContent } from '../content/types';
import type { QuoteStatus } from './schema';
export type AdminRole='viewer'|'editor'|'admin';
export type Actor={id:string;email:string;role:AdminRole;aal:'aal1'|'aal2'};
export type StoredFile={id:string;name:string;mime:string;size:number;path:string};
export type Quote={id:string;locale:string;service:string;name:string;email:string;phone:string;message:string;company?:string;dimensions?:string;quantity?:string;deadline?:string;sourcePath?:string;createdAt:string;status:QuoteStatus;files:StoredFile[];notification:'pending'|'sent'|'not_configured';payloadHash:string;idempotencyKey:string};
export type IncomingFile={name:string;mime:string;bytes:Buffer};
export type ContentState={published:SiteContent|null;draft:SiteContent|null;version:number};
export interface Storage {
  secret(name:string):Promise<string>;
  consumeRate(key:string,limit:number,windowMs:number,now?:number):Promise<boolean>;
  findQuote(key:string):Promise<Quote|null>;
  createQuote(quote:Quote,files:IncomingFile[]):Promise<{quote:Quote;duplicate:boolean}>;
  listQuotes():Promise<Quote[]>;
  getQuote(id:string):Promise<Quote|null>;
  updateQuote(id:string,status:QuoteStatus,actor:Actor):Promise<void>;
  readFile(file:StoredFile):Promise<Buffer>;
  content():Promise<ContentState>;
  saveContent(value:SiteContent,publish:boolean,actor:Actor,expectedVersion:number,sourceId?:number):Promise<number>;
  markNotification(id:string,sent:boolean,error?:string):Promise<void>;
  pendingNotifications():Promise<Quote[]>;
  audit(actor:Actor,action:string,target:string):Promise<void>;
}
