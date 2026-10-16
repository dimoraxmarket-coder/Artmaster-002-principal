export const locales = ['ro', 'ru', 'en'] as const;
export type Locale = (typeof locales)[number];
export type Localized = Record<Locale, string>;
export type Faq = { question: Localized; answer: Localized };
export type Service = { slug: string; title: Localized; summary: Localized; description: Localized; applications: Record<Locale, string[]>; quoteHints: Record<Locale, string[]>; faqs: Faq[]; image: string; relatedSlugs: string[]; equipmentSlugs: string[] };
export type EquipmentCatalog = { model: string; manufacturer: string; category: Localized; verification: 'unverified'|'manufacturer_documented'|'owner_confirmed'; sourceUrl: string; imageRights: 'pending'|'owner'|'licensed'|'concept'; licenseNote: string; order: number; published: boolean; specs: {label: Localized; value: Localized}[] };
export type Equipment = { slug: string; title: Localized; summary: Localized; description: Localized; image: string; serviceSlugs: string[]; facts: Localized[]; catalog?: EquipmentCatalog };
export type HeroAsset = { image: string; video?: string };
export type HeroMedia = { desktop: HeroAsset; mobile?: HeroAsset };
export type Project = { slug: string; title: Localized; summary: Localized; description: Localized; image: string; serviceSlugs: string[]; kind: 'concept' | 'real'; published: boolean };
export type Article = { slug: string; title: Localized; summary: Localized; paragraphs: Record<Locale, string[]>; serviceSlugs: string[]; published: boolean };
export type Contact = { phone: string; email: string; address: Localized; whatsapp: string; areas: Localized; companyName: string };
export type WebsiteCopy = { hero: Record<'eyebrow'|'title'|'accent'|'description'|'quoteLabel'|'servicesLabel',Localized>; about: Record<'title'|'summary'|'heading'|'body'|'approach'|'equipmentHeading',Localized> };
export type SiteContent = { services: Service[]; equipment: Equipment[]; projects: Project[]; articles: Article[]; faqs: Faq[]; contact: Contact; copy?: WebsiteCopy; heroMedia?: HeroMedia };
export function isLocale(value: string): value is Locale { return (locales as readonly string[]).includes(value); }
