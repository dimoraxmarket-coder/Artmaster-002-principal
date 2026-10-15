import './environment';
import { backup,DatabaseSync } from 'node:sqlite';
import { mkdir,cp,writeFile,chmod } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { dataDirectory,storageMode } from '../src/lib/server/config';
import { localDatabase } from '../src/lib/server/local';

async function main(){
  if(storageMode()!=='local')throw new Error('backup.ts face copii SQLite locale. Pentru Supabase configurează backup PostgreSQL/PITR și exportul separat al bucketurilor quote-files și portfolio în panoul furnizorului.');
  const directory=resolve('backups',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(directory,{recursive:true,mode:0o700});
  await backup(localDatabase(),join(directory,'artmaster.sqlite'));
  await chmod(join(directory,'artmaster.sqlite'),0o600);
  const snapshot=new DatabaseSync(join(directory,'artmaster.sqlite'));snapshot.exec('DELETE FROM sessions;');snapshot.close();
  for(const name of ['uploads','media'])await cp(join(dataDirectory(),name),join(directory,name),{recursive:true,errorOnExist:true}).catch((error:NodeJS.ErrnoException)=>{if(error.code!=='ENOENT')throw error;});
  await writeFile(join(directory,'README.txt'),'ARTMASTER local backup. Contains personal data and local administrator password hashes. Active sessions are omitted. Keep private. Stop the server before restoration. Restore artmaster.sqlite and uploads/media into ARTMASTER_DATA_DIR. Do not commit this directory.\n',{mode:0o600});
  console.log(`Copie locală creată: ${directory}. Păstrează directorul privat.`);
}
main().catch((error:Error)=>{console.error(error.message);process.exitCode=1;});
