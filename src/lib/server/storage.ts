import { storageMode } from './config';
import { LocalStorage } from './local';
import { SupabaseStorage } from './supabase';
import type { Storage } from './types';
export function getStorage():Storage{return storageMode()==='local'?new LocalStorage():new SupabaseStorage();}
