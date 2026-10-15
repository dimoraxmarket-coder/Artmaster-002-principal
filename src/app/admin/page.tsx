import { requireActor, pendingMfaState } from '@/lib/server/auth';
import { BackendError } from '@/lib/server/config';
import { AdminConsole } from './ui';
export const dynamic='force-dynamic';
export default async function AdminPage(){
  let actor=null;let unavailable=false;let pendingMfa:null|'enroll'|'challenge'=null;
  try{pendingMfa=await pendingMfaState();actor=await requireActor();}
  catch(error){if(!(error instanceof BackendError&&['unauthorized','mfa_required'].includes(error.code)))unavailable=true;}
  return <AdminConsole actor={actor} unavailable={unavailable} pendingMfa={pendingMfa}/>;
}
