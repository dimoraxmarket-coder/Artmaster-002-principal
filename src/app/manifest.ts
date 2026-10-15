import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'ARTMASTER Advertising Group', short_name: 'ARTMASTER', description: 'Producție publicitară și print în Republica Moldova.', start_url: '/ro', scope: '/', lang: 'ro', display: 'browser', background_color: '#ffffff', theme_color: '#081923', icons: [{ src: '/branding/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/branding/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }] };
}
