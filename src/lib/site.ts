import type { Locale } from './content/types';

export function resolveSiteUrl(value = process.env.SITE_URL || 'https://artmaster.md') {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('SITE_URL must be a public origin without paths, credentials or query parameters.');
  const local = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(url.hostname);
  if (process.env.NODE_ENV === 'production' && (url.protocol !== 'https:' || local) && !(local && process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION === 'true')) throw new Error('Production requires a public HTTPS SITE_URL. Local smoke tests require ARTMASTER_ALLOW_LOCAL_PRODUCTION=true.');
  return url.origin;
}
export const siteUrl = resolveSiteUrl();
export const isIndexable = process.env.SITE_INDEXABLE === 'true' && siteUrl.startsWith('https:') && !['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(new URL(siteUrl).hostname);
export function localizedPath(locale: Locale, path = '') { return `/${locale}${path ? '/' + path.replace(/^\/+|\/+$/g, '') : ''}`; }
