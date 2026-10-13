import type { Locale } from './content/types';
export const siteUrl = (process.env.SITE_URL || 'https://artmaster.md').replace(/\/$/, '');
export const isIndexable = process.env.SITE_INDEXABLE === 'true' && siteUrl.startsWith('https://');
export function localizedPath(locale: Locale, path = '') { return `/${locale}${path ? '/' + path.replace(/^\/+|\/+$/g,'') : ''}`; }
