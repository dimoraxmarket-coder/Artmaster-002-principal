'use client';

import Image from 'next/image';
import { websiteCopy } from '@/lib/content/page-copy';
import { ContentHistory } from './content-history';
import { MediaSelector } from './media-selector';
import { useEffect, useId, useState } from 'react';
import type { Article, Equipment, Faq, Locale, Localized, Project, Service, SiteContent } from '@/lib/content/types';
import type { Actor } from '@/lib/server/types';

type Section = 'copy' | 'contact' | 'services' | 'equipment' | 'projects' | 'articles' | 'faqs';
type EntitySection = Exclude<Section, 'copy' | 'contact' | 'faqs'>;
type ContentResponse = { published: SiteContent; draft: SiteContent | null; version: number };
const sectionLabels: Record<Section, string> = {
  copy: 'Acasă și Despre noi', contact: 'Date de contact', services: 'Servicii', equipment: 'Echipamente',
  projects: 'Galerie și proiecte', articles: 'Articole', faqs: 'Întrebări frecvente',
};
const localeLabels: Record<Locale, string> = { ro: 'Română', ru: 'Rusă', en: 'Engleză' };
const emptyLocalized = (): Localized => ({ ro: '', ru: '', en: '' });
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function safeImage(value: string) {
  if (/^\/(?:images|media|api\/media)\/[a-zA-Z0-9/_-]+\.(?:webp|png|jpg|jpeg|avif|svg)$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password && /^\/storage\/v1\/object\/public\/portfolio\/[a-f0-9-]{36}\.webp$/.test(url.pathname) && !url.search && !url.hash;
  }
  catch { return false; }
}

function imageURLs(content: SiteContent) { return [...content.services, ...content.equipment, ...content.projects].map(item => item.image); }

class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const code = typeof body.code === 'string' ? body.code : typeof body.error === 'string' ? body.error : '';
    const messages: Record<string, string> = {
      mfa_required: 'Activează autentificarea cu doi factori și autentifică-te din nou pentru această operație.',
      asset_unavailable: 'Restaurarea folosește imagini indisponibile. Conținutul actual este păstrat.',
      asset_in_use: 'Imaginea este arhivată sau indisponibilă. Alege un fișier activ din Media Studio.',
      history_limit: 'Istoricul a atins limita de stocare. Salvarea este oprită fără pierdere de date; contactează proprietarul.',
      version_conflict: 'Un alt membru al echipei a salvat o versiune nouă. Modificările tale sunt păstrate aici; descarcă o copie înainte să încarci versiunea actuală.',
      unauthorized: 'Sesiunea a expirat. Autentifică-te din nou înainte să salvezi.',
      forbidden: 'Rolul contului tău nu permite această operație.',
      rate_limited: 'Prea multe încercări. Așteaptă puțin și încearcă din nou.',
      invalid_input: 'Unele date nu sunt valide. Verifică toate cele trei limbi, adresele paginilor și imaginile.',
      invalid_media: 'Imagine neacceptată. Încarcă un fișier PNG sau JPEG valid, de maximum 5 MB.',
      invalid_file: 'Imagine neacceptată. Încarcă un fișier PNG sau JPEG valid, de maximum 5 MB.',
      file_too_large: 'Imaginea depășește limita de 5 MB.',
    };
    throw new ApiError(messages[code] || (response.status === 409 ? messages.version_conflict : 'Operația nu a reușit. Verifică datele și configurația serviciului.'), response.status, code);
  }
  if (!data || typeof data !== 'object') throw new Error('Serverul a răspuns într-un format neașteptat.');
  return data as T;
}

function TextField({ label, value, onChange, multiline = false, hint, type = 'text', maxLength = 12000 }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean;
  hint?: string; type?: 'text' | 'tel' | 'email'; maxLength?: number;
}) {
  const id = useId();
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    {multiline ? <textarea id={id} value={value} rows={5} maxLength={maxLength} onChange={event => onChange(event.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} /> : <input id={id} type={type} value={value} maxLength={maxLength} onChange={event => onChange(event.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>;
}

function LocalizedField({ label, value, locale, onChange, multiline = false, hint }: {
  label: string; value: Localized; locale: Locale; onChange: (value: Localized) => void;
  multiline?: boolean; hint?: string;
}) {
  return <TextField label={`${label} — ${localeLabels[locale]}`} value={value[locale]} multiline={multiline} hint={hint} onChange={text => onChange({ ...value, [locale]: text })} />;
}

function LinesField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  return <TextField label={label} value={value.join('\n')} multiline hint="Câte un element pe linie. Liniile goale sunt eliminate la salvare." onChange={text => onChange(text.split('\n'))} />;
}

function SlugField({ slug, onCommit, disabled, readOnly }: { slug: string; onCommit: (value: string) => void; disabled: boolean; readOnly: boolean }) {
  const [value, setValue] = useState(slug);
  const id = useId();
  const invalid = !slugPattern.test(value) || value.length > 100;
  return <div className="field">
    <label htmlFor={id}>Identificatorul din adresa paginii</label>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <input id={id} value={value} maxLength={100} onChange={event => setValue(event.target.value)} aria-invalid={invalid} aria-describedby={`${id}-hint`} style={{ flex: '1 1 220px' }} />
      {!readOnly && <button type="button" className="button" disabled={disabled || invalid || value === slug} onClick={() => onCommit(value)}>Aplică adresa</button>}
    </div>
    <small id={`${id}-hint`}>Litere mici fără diacritice, cifre și cratime. Schimbarea actualizează legăturile interne; redirecționările adreselor deja indexate trebuie verificate înainte de publicare.</small>
  </div>;
}

function ReferenceFields({ label, options, selected, onChange }: {
  label: string; options: { slug: string; title: Localized }[]; selected: string[]; onChange: (value: string[]) => void;
}) {
  return <fieldset style={{ border: '1px solid var(--line)', borderRadius: 7, padding: 15, marginBottom: 20 }}>
    <legend style={{ fontSize: '.83rem', fontWeight: 600 }}>{label}</legend>
    {options.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
      {options.map(option => <label key={option.slug} style={{ display: 'flex', gap: 9, alignItems: 'start', fontSize: '.82rem' }}>
        <input type="checkbox" checked={selected.includes(option.slug)} onChange={event => onChange(event.target.checked ? [...selected, option.slug] : selected.filter(slug => slug !== option.slug))} />
        <span>{option.title.ro || option.slug}</span>
      </label>)}
    </div> : <p className="field-hint">Nu există elemente disponibile.</p>}
  </fieldset>;
}

function FaqFields({ items, locale, onChange, readOnly }: { items: Faq[]; locale: Locale; onChange: (value: Faq[]) => void; readOnly: boolean }) {
  function edit(index: number, key: keyof Faq, value: Localized) {
    onChange(items.map((item, position) => position === index ? { ...item, [key]: value } : item));
  }
  return <div>
    {items.map((item, index) => <section key={index} style={{ border: '1px solid var(--line)', padding: 18, borderRadius: 8, marginBottom: 16 }}>
      <h4>Întrebarea {index + 1}</h4>
      <LocalizedField label="Întrebare" locale={locale} value={item.question} onChange={value => edit(index, 'question', value)} />
      <LocalizedField label="Răspuns" locale={locale} value={item.answer} multiline onChange={value => edit(index, 'answer', value)} />
      {!readOnly && <button type="button" className="button" onClick={() => { if (window.confirm('Ștergi această întrebare din toate cele trei limbi?')) onChange(items.filter((_, position) => position !== index)); }}>Șterge întrebarea</button>}
    </section>)}
    {!readOnly && <button type="button" className="button" onClick={() => onChange([...items, { question: emptyLocalized(), answer: emptyLocalized() }])}>Adaugă o întrebare</button>}
  </div>;
}

function cleanContent(value: SiteContent): SiteContent {
  const result = structuredClone(value);
  const lines = (items: string[]) => items.map(item => item.trim()).filter(Boolean);
  for (const service of result.services) {
    for (const locale of ['ro', 'ru', 'en'] as const) {
      service.applications[locale] = lines(service.applications[locale]);
      service.quoteHints[locale] = lines(service.quoteHints[locale]);
    }
  }
  for (const article of result.articles) for (const locale of ['ro', 'ru', 'en'] as const) article.paragraphs[locale] = lines(article.paragraphs[locale]);
  return result;
}

function findIncomplete(value: SiteContent): string | null {
  const allLocales: Locale[] = ['ro', 'ru', 'en'];
  const check = (text: Localized, label: string) => allLocales.find(locale => !text[locale].trim()) ? `${label}: completează româna, rusa și engleza.` : null;
  for (const [section, label] of [['services', 'Serviciu'], ['equipment', 'Echipament'], ['projects', 'Proiect'], ['articles', 'Articol']] as const) {
    const seen = new Set<string>();
    for (const item of value[section]) {
      if (!slugPattern.test(item.slug) || seen.has(item.slug)) return `${label}: identificator invalid sau folosit de mai multe ori.`;
      seen.add(item.slug);
      for (const field of ['title', 'summary'] as const) { const error = check(item[field], `${label} „${item.title.ro || item.slug}”, ${field === 'title' ? 'titlu' : 'rezumat'}`); if (error) return error; }
      if ('description' in item) { const error = check(item.description, `${label} „${item.title.ro || item.slug}”, descriere`); if (error) return error; }
      if ('image' in item && !safeImage(item.image)) return `${label} „${item.title.ro || item.slug}”: încarcă o imagine validă sau folosește o adresă de imagine din biblioteca site-ului.`;
    }
  }
  if(value.copy) for(const group of Object.values(value.copy)) for(const item of Object.values(group)){const error=check(item,'Acasă / Despre noi');if(error)return error;}
  const allFaqs = [...value.faqs, ...value.services.flatMap(service => service.faqs)];
  for (const faq of allFaqs) for (const field of ['question', 'answer'] as const) { const error = check(faq[field], 'Întrebare frecventă'); if (error) return error; }
  for (const equipment of value.equipment) for (const fact of equipment.facts) { const error = check(fact, `Detaliu pentru „${equipment.title.ro || equipment.slug}”`); if (error) return error; }
  for (const field of ['address', 'areas'] as const) { const error = check(value.contact[field], field === 'address' ? 'Adresa' : 'Localitățile deservite'); if (error) return error; }
  if (!value.contact.companyName.trim() || !/^\+?[0-9 ()-]{7,25}$/.test(value.contact.phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contact.email)) return 'Completează corect numele companiei, telefonul și e-mailul de contact.';
  if (value.contact.whatsapp && !/^\+?[0-9]{7,16}$/.test(value.contact.whatsapp)) return 'WhatsApp: folosește formatul internațional fără spații sau lasă câmpul gol.';
  return null;
}

export function CmsEditor({ actor, workspaceSection, onDirtyChange }: { actor: Actor; workspaceSection?: 'projects'|'contact'|'services'; onDirtyChange?: (dirty:boolean)=>void }) {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [version, setVersion] = useState(0);
  const [contentSection, setSection] = useState<Section>(workspaceSection?'services':'contact');
  const section:Section=workspaceSection&&workspaceSection!=='services'?workspaceSection:contentSection;
  const [locale, setLocale] = useState<Locale>('ro');
  const [selected, setSelected] = useState<Record<EntitySection, number>>({ services: 0, equipment: 0, projects: 0, articles: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [verifiedImages, setVerifiedImages] = useState<string[]>([]);
  const readOnly = actor.role === 'viewer';

  useEffect(() => {
    const controller = new AbortController();
    request<ContentResponse>('/api/admin/content', { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      const loaded = data.draft || data.published;
      setContent(loaded); setVerifiedImages(imageURLs(loaded)); setVersion(data.version); setHasDraft(Boolean(data.draft)); setLoading(false);
    }).catch(failure => { if (!controller.signal.aborted) { setError(failure instanceof Error ? failure.message : 'Conținutul nu a putut fi încărcat.'); setLoading(false); } });
    return () => controller.abort();
  }, [actor.id]);

  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const protectChanges = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', protectChanges);
    return () => window.removeEventListener('beforeunload', protectChanges);
  }, [dirty]);

  function mutate(callback: (next: SiteContent) => void) {
    if (readOnly || busy) return;
    setContent(previous => { if (!previous) return previous; const next = structuredClone(previous); callback(next); return next; });
    setDirty(true); setMessage(''); setError('');
  }

  async function reload() {
    if (dirty && !window.confirm('Încarci versiunea serverului? Modificările locale nesalvate vor fi pierdute. Folosește „Descarcă o copie” dacă vrei să le păstrezi.')) return;
    setBusy(true); setError('');
    try {
      const data = await request<ContentResponse>('/api/admin/content');
      const loaded = data.draft || data.published;
      setContent(loaded); setVerifiedImages(imageURLs(loaded)); setVersion(data.version); setHasDraft(Boolean(data.draft)); setDirty(false); setConflict(false); setLoading(false); setMessage('Versiunea actuală a fost încărcată.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Conținutul nu a putut fi încărcat.'); }
    finally { setBusy(false); }
  }

  function downloadCopy() {
    if (!content) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `artmaster-continut-v${version}-copie.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function save(action: 'save-draft' | 'publish') {
    if (!content || readOnly || busy || conflict || (action === 'publish' && actor.role !== 'admin')) return;
    const cleaned = cleanContent(content);
    const incomplete = findIncomplete(cleaned);
    if (incomplete) { setError(incomplete); return; }
    if (action === 'publish' && !window.confirm('Publici această versiune? Vizitatorii vor vedea imediat modificările în toate cele trei limbi.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await request<{ ok: true; version: number }>('/api/admin/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: cleaned, action, version }) });
      setVersion(result.version); setContent(cleaned); setVerifiedImages(imageURLs(cleaned)); setDirty(false); setHasDraft(action === 'save-draft');
      setMessage(action === 'publish' ? 'Versiunea a fost publicată. Modificările sunt vizibile pe site.' : 'Ciorna a fost salvată. Publicarea se face separat de administrator.');
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'version_conflict') setConflict(true);
      setError(failure instanceof Error ? failure.message : 'Salvarea nu a reușit.');
    } finally { setBusy(false); }
  }

  function nextSlug(key: EntitySection, prefix: string) {
    let suffix = 1;
    while (content?.[key].some(item => item.slug === `${prefix}-${suffix}`)) suffix++;
    return `${prefix}-${suffix}`;
  }

  function addEntity(key: EntitySection) {
    if (!content) return;
    const index = content[key].length;
    const base = { slug: nextSlug(key, key === 'services' ? 'serviciu-nou' : key === 'equipment' ? 'echipament-nou' : key === 'projects' ? 'proiect-nou' : 'articol-nou'), title: emptyLocalized(), summary: emptyLocalized() };
    mutate(next => {
      if (key === 'services') next.services.push({ ...base, description: emptyLocalized(), image: '', applications: { ro: [], ru: [], en: [] }, quoteHints: { ro: [], ru: [], en: [] }, faqs: [], relatedSlugs: [], equipmentSlugs: [] });
      if (key === 'equipment') next.equipment.push({ ...base, description: emptyLocalized(), image: '', serviceSlugs: [], facts: [] });
      if (key === 'projects') next.projects.push({ ...base, description: emptyLocalized(), image: '', serviceSlugs: [], kind: 'real', published: false });
      if (key === 'articles') next.articles.push({ ...base, paragraphs: { ro: [], ru: [], en: [] }, serviceSlugs: [], published: false });
    });
    setSelected(previous => ({ ...previous, [key]: index }));
  }

  function rename(key: EntitySection, index: number, slug: string) {
    if (!content || !slugPattern.test(slug) || slug.length > 100) return;
    if (content[key].some((item, position) => position !== index && item.slug === slug)) { setError('Această adresă este deja folosită în aceeași categorie.'); return; }
    const oldSlug = content[key][index].slug;
    mutate(next => {
      next[key][index].slug = slug;
      if (key === 'services') {
        for (const service of next.services) service.relatedSlugs = service.relatedSlugs.map(value => value === oldSlug ? slug : value);
        for (const entity of [...next.equipment, ...next.projects, ...next.articles]) entity.serviceSlugs = entity.serviceSlugs.map(value => value === oldSlug ? slug : value);
      }
      if (key === 'equipment') for (const service of next.services) service.equipmentSlugs = service.equipmentSlugs.map(value => value === oldSlug ? slug : value);
    });
  }

  function deletionReason(key: EntitySection, index: number): string | null {
    if (!content) return null;
    const slug = content[key][index]?.slug;
    if (key === 'services') {
      if (content.services.length <= 1) return 'Site-ul trebuie să păstreze cel puțin un serviciu.';
      if (content.services.some(item => item.relatedSlugs.includes(slug)) || [...content.equipment, ...content.projects, ...content.articles].some(item => item.serviceSlugs.includes(slug))) return 'Serviciul este asociat cu alte elemente. Elimină întâi asocierile din servicii, echipamente, proiecte și articole.';
    }
    if (key === 'equipment' && content.services.some(item => item.equipmentSlugs.includes(slug))) return 'Echipamentul este asociat cu un serviciu. Elimină întâi asocierea din pagina serviciului.';
    return null;
  }

  function deleteEntity(key: EntitySection, index: number) {
    if (!content || deletionReason(key, index)) return;
    const item = content[key][index];
    if (!window.confirm(`Ștergi „${item.title.ro || item.slug}” din toate cele trei limbi? Pentru o pagină deja publicată verifică și redirecționarea adresei.`)) return;
    mutate(next => { next[key].splice(index, 1); });
    setSelected(previous => ({ ...previous, [key]: Math.max(0, index - 1) }));
  }

  async function uploadImage(key: 'services' | 'equipment' | 'projects', index: number, file: File) {
    if (readOnly || busy) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size) { setError('Alege o imagine PNG sau JPEG de maximum 5 MB.'); return; }
    const slug = content?.[key][index].slug;
    setBusy(true); setError(''); setMessage('');
    try {
      const body = new FormData(); body.set('file', file);
      const result = await request<{ url: string; width: number; height: number }>('/api/admin/media', { method: 'POST', body });
      if (!safeImage(result.url)) throw new Error('Serverul nu a furnizat o adresă de imagine validă.');
      setContent(previous => { if (!previous) return previous; const next = structuredClone(previous); const item = next[key].find(entry => entry.slug === slug); if (item) item.image = result.url; return next; });
      setVerifiedImages(previous => [...previous, result.url]);
      setDirty(true); setMessage(`Imagine încărcată (${result.width} × ${result.height}). Salvează ciorna pentru a păstra asocierea.`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Încărcarea nu a reușit.'); }
    finally { setBusy(false); }
  }

  function imageFields(key: 'services' | 'equipment' | 'projects', index: number, image: string) {
    return <section style={{ marginBlock: 20 }}>
      <h4>Imagine</h4>
      <TextField label="Adresa imaginii" value={image} hint="Folosește o imagine din biblioteca site-ului sau fotografia proprie încărcată mai jos. Imaginile conceptuale trebuie identificate ca atare. Adresele externe sunt verificate de server înainte de previzualizare." onChange={value => mutate(next => { next[key][index].image = value; })} />
      {image && safeImage(image) && (image.startsWith('/') || verifiedImages.includes(image)) && <div style={{ maxWidth: 540, marginBottom: 16 }}><Image src={image.startsWith('/api/media/')?image.replace('/api/media/','/api/admin/media/'):image} alt="Previzualizarea imaginii selectate" width={540} height={320} unoptimized style={{ width: '100%', height: 'auto', maxHeight: 320, objectFit: 'cover', borderRadius: 8 }} /></div>}
      {!readOnly && <MediaSelector disabled={busy} onSelect={url=>{mutate(next=>{next[key][index].image=url;});setVerifiedImages(previous=>[...previous,url]);}}/>}
      {!readOnly && <label className="field">Încarcă fotografie PNG / JPEG, maximum 5 MB<input type="file" accept="image/png,image/jpeg" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadImage(key, index, file); }} /></label>}
    </section>;
  }

  function commonFields(key: EntitySection, index: number, entity: Service | Equipment | Project | Article) {
    return <>
      <SlugField key={`${key}:${index}:${entity.slug}`} slug={entity.slug} disabled={readOnly || busy} readOnly={readOnly} onCommit={slug => rename(key, index, slug)} />
      <LocalizedField label="Titlu" value={entity.title} locale={locale} onChange={value => mutate(next => { next[key][index].title = value; })} />
      <LocalizedField label="Rezumat" value={entity.summary} locale={locale} multiline onChange={value => mutate(next => { next[key][index].summary = value; })} />
      {'description' in entity && <LocalizedField label="Descriere" value={entity.description} locale={locale} multiline onChange={value => mutate(next => { const entry = next[key][index]; if ('description' in entry) entry.description = value; })} />}
    </>;
  }

  if (loading) return <section className="admin-cms" aria-busy="true"><h2>Conținutul site-ului</h2><p role="status">Se încarcă editorul…</p></section>;
  if (!content) return <section className="admin-cms"><h2>Conținutul site-ului</h2><p className="form-status form-status-error" role="alert">{error || 'Conținutul nu este disponibil.'}</p><button type="button" className="button" disabled={busy} onClick={() => void reload()}>Reîncearcă încărcarea</button></section>;

  const entityKey: EntitySection | null = section !== 'copy' && section !== 'contact' && section !== 'faqs' ? section : null;
  const index = entityKey ? Math.min(selected[entityKey], Math.max(0, content[entityKey].length - 1)) : 0;
  const entity = entityKey ? content[entityKey][index] : null;
  const blockedDelete = entityKey && entity ? deletionReason(entityKey, index) : null;
  const service = section === 'services' ? content.services[index] : null;
  const equipment = section === 'equipment' ? content.equipment[index] : null;
  const project = section === 'projects' ? content.projects[index] : null;
  const article = section === 'articles' ? content.articles[index] : null;

  return <section className="admin-cms"  aria-busy={busy}>
    <h2>{workspaceSection==='projects'?'Portofoliu Studio':workspaceSection==='contact'?'Informațiile companiei':'Conținut Studio'}</h2>
    <p>Versiunea {version} · {dirty ? 'Modificări nesalvate' : hasDraft ? 'Ciornă încărcată' : 'Versiune publicată'}.</p>
    <p className="field-hint" style={{ marginBottom: 20 }}>Editează fiecare limbă separat. Ciorna și publicarea sunt operații distincte. {readOnly ? 'Contul tău poate consulta conținutul.' : actor.role === 'editor' ? 'Poți salva ciorne; administratorul le publică.' : 'Poți salva ciorne și publica modificări.'}</p>
    {error && <div role="alert" className="form-status form-status-error">{error}</div>}
    {message && <p role="status" className="form-status">{message}</p>}
    {conflict && <div className="banner"><p>Salvarea este oprită pentru a păstra versiunea colegului. Descarcă modificările tale, apoi încarcă versiunea actuală și aplică din nou modificările necesare.</p><button type="button" className="button" onClick={downloadCopy}>Descarcă o copie locală</button></div>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 25 }}>
      {!readOnly && <button type="button" className="button" disabled={busy || conflict} onClick={() => void save('save-draft')}>{busy ? 'Se procesează…' : 'Salvează ciorna'}</button>}
      {actor.role === 'admin' && <button type="button" className="button button-primary" disabled={busy || conflict} onClick={() => void save('publish')}>Publică această versiune</button>}
      <a className="button" href={`/admin-preview/${locale}${entityKey&&entity?'/'+({services:'servicii',equipment:'echipamente',projects:'portofoliu',articles:'blog'})[entityKey]+'/'+entity.slug:section==='contact'?'/contact':section==='faqs'?'/intrebari-frecvente':''}`} target="_blank" rel="noopener noreferrer">Previzualizează ciorna salvată ↗</a>
      <button type="button" className="button" disabled={busy} onClick={() => void reload()}>Încarcă versiunea actuală</button>
      {!conflict && <button type="button" className="button" disabled={busy} onClick={downloadCopy}>Descarcă o copie</button>}
    </div>
    {dirty && <p role="note" className="banner">Previzualizarea folosește ultima ciornă salvată; salvează modificările locale înainte de verificare.</p>}
    <ContentHistory onRestoring={setBusy} content={content} version={version} disabled={busy||dirty||conflict} canRestore={!readOnly} onRestored={(restored,nextVersion)=>{setContent(restored);setVersion(nextVersion);setVerifiedImages(imageURLs(restored));setHasDraft(true);setDirty(false);setConflict(false);setMessage('Versiunea a fost restaurată într-o ciornă nouă. Revizuiește previzualizarea înainte de publicare.');}}/>
    {actor.role === 'admin' && actor.aal !== 'aal2' && <p className="banner">Publicarea și salvarea protejată necesită autentificare cu doi factori. Dacă serverul solicită acest pas, activează-l în cont și autentifică-te din nou.</p>}
    <nav aria-label="Categorii de conținut" style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 24 }}>
      {(workspaceSection?workspaceSection==='services'?['copy','services','equipment','articles','faqs'] as Section[]:[]:Object.keys(sectionLabels) as Section[]).map(key => <button type="button" key={key} className={`button${section === key ? ' button-primary' : ''}`} aria-pressed={section === key} disabled={busy} onClick={() => setSection(key)}>{sectionLabels[key]}</button>)}
    </nav>
    <div role="group" aria-label="Limba conținutului editat" style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 25 }}>
      {(['ro', 'ru', 'en'] as const).map(key => <button type="button" key={key} className={`button${locale === key ? ' button-primary' : ''}`} aria-pressed={locale === key} disabled={busy} onClick={() => setLocale(key)}>{key.toUpperCase()} · {localeLabels[key]}</button>)}
    </div>
    <h3>{sectionLabels[section]} — {localeLabels[locale]}</h3>
    {entityKey && <div className="field">
      <label htmlFor="cms-entity">Alege elementul de editat</label>
      <select id="cms-entity" value={content[entityKey].length ? index : ''} disabled={busy || !content[entityKey].length} onChange={event => setSelected(previous => ({ ...previous, [entityKey]: Number(event.target.value) }))}>
        {content[entityKey].length ? content[entityKey].map((item, position) => <option key={position} value={position}>{item.title.ro || item.slug}</option>) : <option value="">Nu există elemente</option>}
      </select>
    </div>}
    <fieldset disabled={readOnly || busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="sr-only">Editare {sectionLabels[section]}</legend>
      {section === 'copy' && <>
        <p className="field-hint">Texte structurate pentru paginile publice. Aspectul și destinațiile butoanelor sunt păstrate.</p>
        {(['hero','about'] as const).map(group=><section key={group}><h4>{group==='hero'?'Acasă · Hero':'Despre noi'}</h4>{Object.entries(websiteCopy(content)[group]).map(([key,value])=><LocalizedField key={key} label={({eyebrow:'Etichetă',title:'Titlu',accent:'Accentul titlului',description:'Descriere',quoteLabel:'Buton · Ofertă',servicesLabel:'Buton · Servicii',summary:'Rezumat pagină',heading:'Titlu companie',body:'Descrierea companiei',approach:'Cum lucrăm',equipmentHeading:'Titlu echipamente'} as Record<string,string>)[key]||key} value={value} locale={locale} multiline={['description','summary','body','approach'].includes(key)} onChange={localized=>mutate(next=>{next.copy=websiteCopy(next);(next.copy[group] as Record<string,Localized>)[key]=localized;})}/>)}</section>)}
      </>}
      {section === 'contact' && <>
        <div className="form-grid">
          <TextField label="Numele companiei" value={content.contact.companyName} maxLength={120} onChange={value => mutate(next => { next.contact.companyName = value; })} />
          <TextField label="Telefon public" type="tel" value={content.contact.phone} maxLength={25} onChange={value => mutate(next => { next.contact.phone = value; })} />
          <TextField label="E-mail public" type="email" value={content.contact.email} maxLength={254} onChange={value => mutate(next => { next.contact.email = value; })} />
          <TextField label="WhatsApp — opțional" type="tel" value={content.contact.whatsapp} maxLength={17} hint="Format internațional, de exemplu +373…; fără spații. Lasă gol dacă nu este folosit." onChange={value => mutate(next => { next.contact.whatsapp = value; })} />
        </div>
        <LocalizedField label="Adresă" locale={locale} value={content.contact.address} multiline onChange={value => mutate(next => { next.contact.address = value; })} />
        <LocalizedField label="Localități / zone deservite" locale={locale} value={content.contact.areas} multiline onChange={value => mutate(next => { next.contact.areas = value; })} />
      </>}
      {entityKey && entity && commonFields(entityKey, index, entity)}
      {service && <>
        {imageFields('services', index, service.image)}
        <LinesField label={`Aplicații — ${localeLabels[locale]}`} value={service.applications[locale]} onChange={value => mutate(next => { next.services[index].applications[locale] = value; })} />
        <LinesField label={`Informații necesare pentru ofertă — ${localeLabels[locale]}`} value={service.quoteHints[locale]} onChange={value => mutate(next => { next.services[index].quoteHints[locale] = value; })} />
        <ReferenceFields label="Servicii asociate" options={content.services.filter(item => item.slug !== service.slug)} selected={service.relatedSlugs} onChange={value => mutate(next => { next.services[index].relatedSlugs = value; })} />
        <ReferenceFields label="Echipamente folosite" options={content.equipment} selected={service.equipmentSlugs} onChange={value => mutate(next => { next.services[index].equipmentSlugs = value; })} />
        <details style={{ marginBlock: 24 }}><summary>Întrebări frecvente pentru acest serviciu ({service.faqs.length})</summary><div style={{ marginTop: 18 }}><FaqFields items={service.faqs} locale={locale} readOnly={readOnly} onChange={value => mutate(next => { next.services[index].faqs = value; })} /></div></details>
      </>}
      {equipment && <>
        {imageFields('equipment', index, equipment.image)}
        <ReferenceFields label="Servicii realizate cu acest echipament" options={content.services} selected={equipment.serviceSlugs} onChange={value => mutate(next => { next.equipment[index].serviceSlugs = value; })} />
        <h4>Detalii tehnice confirmate</h4>
        <p className="field-hint">Adaugă doar caracteristici verificate, în toate cele trei limbi.</p>
        {equipment.facts.map((fact, position) => <div key={position} style={{ marginBlock: 18 }}><LocalizedField label={`Detaliul ${position + 1}`} value={fact} locale={locale} onChange={value => mutate(next => { next.equipment[index].facts[position] = value; })} />{!readOnly && <button type="button" className="button" onClick={() => { if (window.confirm('Ștergi acest detaliu în toate cele trei limbi?')) mutate(next => { next.equipment[index].facts.splice(position, 1); }); }}>Șterge detaliul</button>}</div>)}
        {!readOnly && <button type="button" className="button" onClick={() => mutate(next => { next.equipment[index].facts.push(emptyLocalized()); })}>Adaugă un detaliu</button>}
      </>}
      {project && <>
        <div className="field"><label htmlFor="cms-project-kind">Tipul proiectului</label><select id="cms-project-kind" value={project.kind} onChange={event => mutate(next => { next.projects[index].kind = event.target.value as Project['kind']; })}><option value="real">Proiect real ARTMASTER</option><option value="concept">Concept / imagine ilustrativă</option></select><small>Marchează „real” doar lucrările realizate și fotografiate de ARTMASTER sau imaginile folosite cu permisiune.</small></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBlock: 20 }}><input type="checkbox" checked={project.published} onChange={event => mutate(next => { next.projects[index].published = event.target.checked; })} />Afișează în portofoliu după publicarea versiunii</label>
        {imageFields('projects', index, project.image)}
        <ReferenceFields label="Servicii realizate în proiect" options={content.services} selected={project.serviceSlugs} onChange={value => mutate(next => { next.projects[index].serviceSlugs = value; })} />
      </>}
      {article && <>
        <LinesField label={`Textul articolului — ${localeLabels[locale]}`} value={article.paragraphs[locale]} onChange={value => mutate(next => { next.articles[index].paragraphs[locale] = value; })} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBlock: 20 }}><input type="checkbox" checked={article.published} onChange={event => mutate(next => { next.articles[index].published = event.target.checked; })} />Afișează articolul după publicarea versiunii</label>
        <ReferenceFields label="Servicii asociate articolului" options={content.services} selected={article.serviceSlugs} onChange={value => mutate(next => { next.articles[index].serviceSlugs = value; })} />
      </>}
      {section === 'faqs' && <FaqFields items={content.faqs} locale={locale} readOnly={readOnly} onChange={value => mutate(next => { next.faqs = value; })} />}
      {entityKey && !readOnly && <div style={{ borderTop: '1px solid var(--line)', paddingTop: 23, marginTop: 25 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button type="button" className="button" onClick={() => addEntity(entityKey)}>Adaugă {entityKey === 'services' ? 'serviciu' : entityKey === 'equipment' ? 'echipament' : entityKey === 'projects' ? 'proiect' : 'articol'}</button>
          {entity && <button type="button" className="button" disabled={Boolean(blockedDelete)} onClick={() => deleteEntity(entityKey, index)}>Șterge elementul selectat</button>}
        </div>
        {blockedDelete && <p className="field-hint" style={{ marginTop: 12 }}>{blockedDelete}</p>}
        <p className="field-hint" style={{ marginTop: 12 }}>Un element nou primește un identificator disponibil și trebuie completat în RO, RU și EN. Modificările se aplică site-ului public numai după publicarea versiunii.</p>
      </div>}
    </fieldset>
  </section>;
}
