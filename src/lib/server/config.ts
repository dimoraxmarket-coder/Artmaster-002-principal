import { resolve } from 'node:path';

export class BackendError extends Error {
  constructor(public code: string, public status = 400, public fieldErrors?: Record<string, string[]>) { super(code); }
}
export function storageMode(): 'local' | 'supabase' {
  const selected = process.env.ARTMASTER_STORAGE;
  if (selected === 'supabase' || (!selected && process.env.SUPABASE_URL)) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_ANON_KEY) throw new BackendError('unavailable', 503);
    return 'supabase';
  }
  if (process.env.NODE_ENV === 'production' && !(selected === 'local' && process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION === 'true')) throw new BackendError('unavailable', 503);
  if (selected && selected !== 'local') throw new BackendError('unavailable', 503);
  return 'local';
}
export function dataDirectory() { return resolve(/* turbopackIgnore: true */ process.env.ARTMASTER_DATA_DIR || '.data'); }
export function publicOrigin() { return new URL(process.env.SITE_URL || 'http://localhost:3000').origin; }
export const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_FILE_BYTES = 10 * 1024 * 1024;
