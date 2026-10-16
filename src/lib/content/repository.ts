import 'server-only';
import { publicContent } from './assets';
import { defaultContent } from './defaults';
import type { SiteContent } from './types';
import { getStorage } from '../server/storage';
import { BackendError } from '../server/config';
export async function getContent(): Promise<SiteContent> {
  try { return publicContent((await getStorage().content()).published || defaultContent); }
  catch(error) {
    // Public pages can use repository content while the production provider is not configured.
    // Other failures are reported without data, credentials, or user contact details.
    if(!(error instanceof BackendError&&error.code==='unavailable'))console.error('Published content unavailable; repository content selected.');
    return defaultContent;
  }
}
