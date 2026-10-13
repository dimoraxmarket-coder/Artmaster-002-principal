import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
export function proxy(request: NextRequest) {
 const nonce = randomBytes(18).toString('base64');
 const production = process.env.NODE_ENV === 'production';
 const csp = [
  "default-src 'self'", `script-src 'self' 'nonce-${nonce}'${production ? '' : " 'unsafe-eval'"}`,
  "script-src-attr 'none'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self'", process.env.GA_MEASUREMENT_ID ? "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com" : "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'self'",
  "form-action 'self'", "object-src 'none'", ...(request.nextUrl.protocol === 'https:' ? ['upgrade-insecure-requests'] : []),
 ].join('; ');
 const headers = new Headers(request.headers);
 headers.set('x-nonce', nonce);
 headers.set('Content-Security-Policy', csp);
 headers.set('x-site-locale', /^\/(ro|ru|en)(?:\/|$)/.exec(request.nextUrl.pathname)?.[1] || 'ro');
 const response = NextResponse.next({ request: { headers } });
 response.headers.set('Content-Security-Policy', csp);
 response.headers.set('X-Content-Type-Options', 'nosniff');
 response.headers.set('X-Frame-Options', 'DENY');
 response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
 response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
 if (request.nextUrl.protocol === 'https:') response.headers.set('Strict-Transport-Security', 'max-age=31536000');
 const isPrivate = /^\/(admin|api)(\/|$)/.test(request.nextUrl.pathname);
 if (isPrivate || process.env.SITE_INDEXABLE !== 'true') response.headers.set('X-Robots-Tag', 'noindex, nofollow');
 if (isPrivate) response.headers.set('Cache-Control','private, no-store, max-age=0');
 return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|media/).*)'] };
