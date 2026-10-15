import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { storageMode,dataDirectory,BackendError } from './config';
import { supabaseService } from './supabase';
import { getStorage } from './storage';
import { validateUploads } from './uploads';
export async function storeMedia(file:File){
  const uploads=await validateUploads([file]);
  if(uploads.length!==1||uploads[0].mime==='application/pdf')throw new BackendError('invalid_file',400);
  try{
    const pipeline=sharp(uploads[0].bytes,{limitInputPixels:30000000,animated:false,failOn:'warning'}).rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85});
    const {data,info}=await pipeline.toBuffer({resolveWithObject:true});
    if(!info.width||!info.height||data.length>5*1024*1024)throw new BackendError('invalid_file',400);
    const id=randomUUID(),name=`${id}.webp`;
    let url:string;
    if(storageMode()==='local'){
      const directory=join(dataDirectory(),'media');await mkdir(directory,{recursive:true,mode:0o700});await writeFile(join(directory,name),data,{mode:0o600,flag:'wx'});url=`/api/media/${name}`;
    }else{
      const client=supabaseService(),{error}=await client.storage.from('portfolio-private').upload(name,data,{contentType:'image/webp',upsert:false});
      if(error)throw new BackendError('unavailable',503);url=`/api/media/${name}`;
    }
    return {url,width:info.width,height:info.height};
  }catch(error){if(error instanceof BackendError)throw error;throw new BackendError('invalid_file',400);}
}
export async function readLocalMedia(name:string){if(!/^[a-f0-9-]{36}\.webp$/.test(name)||storageMode()!=='local')throw new BackendError('not_found',404);try{return await readFile(join(dataDirectory(),'media',name));}catch{throw new BackendError('not_found',404);}}

export async function readMedia(name:string){
  if(!/^[a-f0-9-]{36}\.webp$/.test(name))throw new BackendError('not_found',404);
  if(storageMode()==='local')return readLocalMedia(name);
  const {data,error}=await supabaseService().storage.from('portfolio-private').download(name);
  if(error||!data)throw new BackendError('not_found',404);
  return Buffer.from(await data.arrayBuffer());
}
export async function readPublishedMedia(name:string){
  if(!/^[a-f0-9-]{36}\.webp$/.test(name))throw new BackendError('not_found',404);
  // Fail closed on storage errors. Drafts and unpublished projects never grant
  // public byte access; UUID secrecy is not an authorization mechanism.
  const {published}=await getStorage().content(),url=`/api/media/${name}`;
  const visible=published&&[...published.services,...published.equipment,...published.projects.filter(project=>project.published)].some(item=>item.image===url);
  if(!visible)throw new BackendError('not_found',404);
  return readMedia(name);
}
