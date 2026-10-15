import { requireActor } from '@/lib/server/auth';
import { BackendError } from '@/lib/server/config';
import { AdminConsole } from './ui';
import { storageMode } from '@/lib/server/config';
export const dynamic='force-dynamic';
export default async function AdminPage(){let actor=null;let unavailable=false;let mfaAvailable=false;try{mfaAvailable=storageMode()==='supabase';actor=await requireActor();}catch(error){if(!(error instanceof BackendError&&error.code==='unauthorized'))unavailable=true;}return <AdminConsole actor={actor} unavailable={unavailable} mfaAvailable={mfaAvailable}/>;}
