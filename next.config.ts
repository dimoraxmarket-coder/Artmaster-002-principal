import type { NextConfig } from 'next';
import redirects from './src/lib/legacy-redirects.json';
const config: NextConfig = {
 poweredByHeader: false,
 allowedDevOrigins: ['127.0.0.1', 'localhost'],
 outputFileTracingExcludes: { '*': ['./.data/**/*', './.env*', './backups/**/*', './artmaster-machete/**/*', './artmaster-machete.zip', './tests/**/*', './docs/**/*'] },
 images: { formats: ['image/avif', 'image/webp'], qualities: [70, 75, 85], localPatterns: [{ pathname:'/branding/**',search:'' },{ pathname:'/images/**',search:'' },{ pathname:'/media/**',search:'' },{ pathname:'/partners/**',search:'' }], remotePatterns: process.env.SUPABASE_URL ? [{ protocol: 'https', hostname: new URL(process.env.SUPABASE_URL).hostname, pathname: '/storage/v1/object/public/portfolio/**' }] : [] },
 experimental: { cpus: 2, inlineCss: true },
 serverExternalPackages: ['node:sqlite'],
 async redirects() {
  return [
   { source: '/', destination: '/ro', permanent: true },
   ...redirects.map((r: { source: string; destination: string }) => ({ ...r, statusCode: 301 as const })),
  ];
 },
};
export default config;
