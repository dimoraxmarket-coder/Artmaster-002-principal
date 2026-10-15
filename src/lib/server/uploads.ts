import { BackendError, MAX_FILE_BYTES, MAX_TOTAL_FILE_BYTES } from './config';
import type { IncomingFile } from './types';
import sharp from 'sharp';
import { PDFDocument,PDFDict,PDFArray,PDFName,PDFRawStream,PDFObject } from 'pdf-lib';

const png=Buffer.from([137,80,78,71,13,10,26,10]);
const forbiddenPDFNames=new Set(['JavaScript','JS','Launch','EmbeddedFile','EmbeddedFiles','RichMedia','AA','OpenAction','Encrypt','XFA','SubmitForm','GoToR','URI','Sound','Movie']);
async function validatePDF(bytes:Buffer){
  if(!bytes.subarray(-1024).toString('latin1').includes('%%EOF'))throw new BackendError('invalid_file',400);
  try{
    const document=await PDFDocument.load(bytes,{ignoreEncryption:false,updateMetadata:false,throwOnInvalidObject:true});
    const visited=new Set<PDFObject>();
    function inspect(object:PDFObject){
      if(visited.has(object))return;visited.add(object);
      if(object instanceof PDFName){if(forbiddenPDFNames.has(object.decodeText()))throw new BackendError('invalid_file',400);}
      else if(object instanceof PDFDict){for(const [key,value] of object.entries()){inspect(key);inspect(value);}}
      else if(object instanceof PDFArray){for(const value of object.asArray())inspect(value);}
      else if(object instanceof PDFRawStream)inspect(object.dict);
    }
    for(const [,object] of document.context.enumerateIndirectObjects())inspect(object);
  }catch{throw new BackendError('invalid_file',400);}
}
export async function validateUploads(values:FormDataEntryValue[]):Promise<IncomingFile[]>{
  const files=values.filter((value):value is File=>typeof value!=='string'&&value.size>0);
  if(files.length>3||values.some(value=>typeof value==='string'))throw new BackendError('invalid_file',400);
  if(files.reduce((sum,file)=>sum+file.size,0)>MAX_TOTAL_FILE_BYTES)throw new BackendError('request_too_large',413);
  const output:IncomingFile[]=[];
  for(const file of files){
    if(file.size>MAX_FILE_BYTES)throw new BackendError('request_too_large',413);
    if(Array.from(file.name).some(character=>character.charCodeAt(0)<32)||/\.(?:exe|dll|com|bat|cmd|js|mjs|html|htm|php|sh|ps1|svg)(?:\.|$)/i.test(file.name))throw new BackendError('invalid_file',400);
    const extension=file.name.split('.').pop()?.toLowerCase(),bytes=Buffer.from(await file.arrayBuffer());
    const actual=bytes.subarray(0,8).equals(png)?'image/png':bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.subarray(0,5).toString('ascii')==='%PDF-'?'application/pdf':null;
    const expected=extension==='png'?'image/png':extension==='jpg'||extension==='jpeg'?'image/jpeg':extension==='pdf'?'application/pdf':null;
    if(!actual||actual!==expected||(file.type&&file.type!==actual))throw new BackendError('invalid_file',400);
    if(actual==='application/pdf')await validatePDF(bytes);
    else try{await sharp(bytes,{limitInputPixels:30000000,animated:false,failOn:'warning'}).raw().toBuffer();}catch{throw new BackendError('invalid_file',400);}
    const name=file.name.normalize('NFKC').replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/^[. ]+/,'').slice(-120)||`file.${extension}`;
    output.push({name,mime:actual,bytes});
  }
  return output;
}
