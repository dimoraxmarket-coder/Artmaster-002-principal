import { z } from 'zod';
import type { SiteContent } from '../content/types';

const text = (max: number) => z.string().trim().min(1).max(max);
const localized = z.object({ro: text(12000), ru: text(12000), en: text(12000)}).strict();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const image = z.string().max(500).refine(value => {
  if(/^\/(?:images|media|api\/media)\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpg|jpeg|avif|svg)$/.test(value))return true;
  try{const url=new URL(value),configured=new URL(process.env.SUPABASE_URL||'https://unconfigured.invalid');return url.protocol==='https:'&&!url.username&&!url.password&&url.origin===configured.origin&&/^\/storage\/v1\/object\/public\/portfolio\/[a-f0-9-]{36}\.webp$/.test(url.pathname)&&!url.search&&!url.hash;}catch{return false;}
});
const refs = z.array(slug).max(30);
const localizedList = z.object({ro:z.array(text(1000)).max(30),ru:z.array(text(1000)).max(30),en:z.array(text(1000)).max(30)}).strict();
const faq = z.object({question:localized,answer:localized}).strict();
const base = {slug,title:localized,summary:localized};
export const contentSchema: z.ZodType<SiteContent> = z.object({
  copy:z.object({hero:z.object({eyebrow:localized,title:localized,accent:localized,description:localized,quoteLabel:localized,servicesLabel:localized}).strict(),about:z.object({title:localized,summary:localized,heading:localized,body:localized,approach:localized,equipmentHeading:localized}).strict()}).strict().optional(),
  services:z.array(z.object({...base,description:localized,applications:localizedList,quoteHints:localizedList,faqs:z.array(faq).max(20),image,relatedSlugs:refs,equipmentSlugs:refs}).strict()).min(1).max(40),
  equipment:z.array(z.object({...base,description:localized,image,serviceSlugs:refs,facts:z.array(localized).max(30)}).strict()).max(60),
  projects:z.array(z.object({...base,description:localized,image,serviceSlugs:refs,kind:z.enum(['concept','real']),published:z.boolean()}).strict()).max(250),
  articles:z.array(z.object({...base,paragraphs:localizedList,serviceSlugs:refs,published:z.boolean()}).strict()).max(100),
  faqs:z.array(faq).max(40),
  contact:z.object({phone:z.string().regex(/^\+?[0-9 ()-]{7,25}$/),email:z.email().max(254),address:localized,whatsapp:z.string().regex(/^\+?[0-9]{7,16}$/).or(z.literal('')),areas:localized,companyName:text(120)}).strict(),
}).strict().superRefine((content,ctx)=>{
  for(const key of ['services','equipment','projects','articles'] as const) {
    const seen=new Set<string>();
    content[key].forEach((entry,i)=>{if(seen.has(entry.slug))ctx.addIssue({code:'custom',path:[key,i,'slug'],message:'Duplicate slug'});seen.add(entry.slug);});
  }
  const services=new Set(content.services.map(s=>s.slug)),equipment=new Set(content.equipment.map(e=>e.slug));
  content.services.forEach((s,i)=>{if(s.relatedSlugs.some(x=>!services.has(x))||s.equipmentSlugs.some(x=>!equipment.has(x)))ctx.addIssue({code:'custom',path:['services',i],message:'Unknown reference'});});
  for(const key of ['equipment','projects','articles'] as const)content[key].forEach((entry,i)=>{if(entry.serviceSlugs.some(x=>!services.has(x)))ctx.addIssue({code:'custom',path:[key,i,'serviceSlugs'],message:'Unknown reference'});});
});

export const quoteSchema=z.object({
  locale:z.enum(['ro','ru','en']),service:z.string().min(1).max(100),name:text(100),
  email:z.email().max(254).transform(v=>v.toLowerCase()),phone:z.string().trim().max(30).regex(/^[+0-9 ()-]{6,30}$/),
  message:text(5000),consent:z.literal('true'),website:z.literal(''),
  company:z.string().trim().max(150).default(''),dimensions:z.string().trim().max(200).default(''),
  quantity:z.string().regex(/^(?:|[1-9]\d{0,6})$/).default(''),
  deadline:z.string().refine(value=>value===''||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)).default(''),
  sourcePath:z.string().max(100).regex(/^(?:|\/(?:ro|ru|en)(?:\/(?:contact|solicita-oferta))?\/?)$/).default(''),
  token:z.string().min(20).max(2000),idempotencyKey:z.uuid(),
}).strict();
export type QuoteInput=z.infer<typeof quoteSchema>;
export type QuoteStatus='new'|'in_progress'|'completed'|'archived';
export const quoteStatusSchema=z.enum(['new','in_progress','completed','archived']);
