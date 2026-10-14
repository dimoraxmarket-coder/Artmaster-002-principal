import type { Localized } from './content/types';

export type Partner = {
  name: string;
  logo: string;
  website?: string;
  alt: Localized;
};

// Add only verified partners and logos you have permission to publish.
// Example: { name: 'Name approved by the company', logo: '/partners/company.svg',
//   website: 'https://company.example', alt: { ro: 'Logo ...', ru: 'Логотип ...', en: 'Logo ...' } }
export const partners: Partner[] = [];

// Preview assets are examples, never testimonials or claimed clients.
export const examplePartners: Partner[] = Array.from({ length: 6 }, (_, index) => ({
  name: `LOGO ${String(index + 1).padStart(2, '0')}`,
  logo: `/partners/example-${index + 1}.svg`,
  alt: { ro: `Logo demonstrativ ${index + 1}`, ru: `Демонстрационный логотип ${index + 1}`, en: `Example logo ${index + 1}` },
}));

export function safePartnerWebsite(value?: string) {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}
