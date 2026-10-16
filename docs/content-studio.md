# Phase 6 — Content Studio

Base: verified PR #6 commit `c023f807be7a9a2abde7cec85fe9a1a8a346d1f2`, branch `feature/artmaster-security-center`. Changes are isolated on `feature/artmaster-content-studio`. This phase prioritizes durable history, safe restoration and authenticated real-layout preview. It does not complete every website-management feature in the long-term brief.

> Extensie ulterioară: [bannerul și partenerii administrați](banner-partners.md) adaugă câmpurile opționale `banner`/`partners`. Tabelul de mai jos descrie auditul istoric al PR #7; gestionarea acestor două secțiuni este acum implementată. Importul bannerului original și verificarea logo-urilor sunt încă în așteptare.

## Public content audit

All public routes are served by `[locale]/page.tsx` and `[locale]/[...segments]/page.tsx`, in RO/RU/EN. The latter now delegates unchanged page markup to `components/public-content.tsx` so preview and published pages share it. Public requests still read **only published** storage through `content/repository.ts`.

| Public surface | Editable now | Remaining source/configuration dependencies |
| --- | --- | --- |
| Homepage hero | New structured `copy.hero`: eyebrow, title, accented title, description, quote/services button text, all three languages | Responsive background images, location label and CTA destinations remain fixed |
| Homepage service, portfolio, equipment, FAQ cards | Existing services/equipment/projects/FAQs determine visible text, images and links | Section introductions/headings, advantages, process, industries, order/visibility rules and equipment-count caption in `lib/i18n.ts` / `home.tsx` |
| `/servicii` and `/servicii/:slug` | Titles, summaries, descriptions, applications, quote requirements, image, related equipment/services, service FAQs, slug | Listing hero and shared interface labels; indexed slug redirects need review |
| `/echipamente` and `/echipamente/:slug` | Titles, summaries, descriptions, image, technical facts, associated services, slug | Listing introduction and shared labels |
| `/portofoliu` and `/portofoliu/:slug` | Project title/summary/description, one image, type, service associations, publication flag, slug | Multi-image galleries, image captions/order and redirect management need a later schema/workflow |
| `/blog` and `/blog/:slug` | Article title, summary, paragraph lists, service associations, publication flag and slug | Listing introduction; no arbitrary HTML/embedded scripts |
| `/despre-noi` | New `copy.about`: page title/summary, company heading/body, approach paragraph, equipment heading | Workshop image and concept caption remain fixed |
| `/intrebari-frecvente` | Global questions/answers in RO/RU/EN | Page introduction and common labels remain fixed |
| `/contact` | Company name, public phone/email/address, areas, WhatsApp; links derive from these validated fields | Form labels, visit/map copy, map configuration and Viber environment setting remain code/configuration |
| `/solicita-oferta` | Service options and business contact data | Form structure, labels, validation, consent and explanatory text remain code-owned |
| Header, footer, floating contact panel | CMS contact data and service/equipment navigation entries | Branding, navigation/translation labels, footer tagline, legal links, fixed CTA destinations and channel UI remain code-owned |
| Partners on homepage | Existing verified partner configuration only | `lib/partners.ts`, approved logos and multilingual marquee descriptions need a dedicated structured module. Demo logos retain their explicit example labels |
| `/confidentialitate`, `/termeni`, `/cookies` | Contact email interpolated from CMS | Legal wording stays reviewed source text; cookie-consent behavior is code-owned |
| SEO, 404, robots, sitemap, manifest | Structured item titles/summaries and About summary/title feed existing metadata; published items feed routes | Home SEO title, global metadata, branding, indexing/analytics settings, 404 copy, technical routes and redirects remain code/configuration |

Optional `copy` is a strict schema extension. Existing database documents and historical snapshots without it retain their exact old rendering through `websiteCopy()` defaults. Merely viewing/editing another section does not write defaults into existing content. All new fields are bounded plain text in all three languages. React escapes text; there is no HTML import, HTML editor, `eval`, or `dangerouslySetInnerHTML` path for CMS input. Existing service/project image URLs and routes remain compatible.

## History and restoration

- Additive SQLite initialization and migration `202610150005_content_studio.sql` create `content_versions`. Existing persisted published and draft documents are copied once as migration baselines, with migration time and an explicitly unknown actor. Their original author/time cannot be reconstructed. Repository defaults remain version-controlled source until a content document is actually saved.
- Every central `saveContent` call—including Media Studio replacement—records a snapshot and an audit event in the **same transaction** as the version-CAS update. PostgreSQL's existing `save_site_content` RPC remains a wrapper around the new transactional writer, so old callers also record history.
- Each snapshot retains a durable ID, document version, action, actor ID, timestamp, source-version ID for restoration, JSON document and byte size. Actor IDs are account identifiers, never session identifiers. The UI shows the account reference; an account may later be unavailable.
- History is append-only: SQLite UPDATE/DELETE triggers; PostgreSQL UPDATE/DELETE trigger plus no client grants/policies and no service-role INSERT/UPDATE/DELETE/TRUNCATE grants. The service role can SELECT history and call reviewed writer functions. A database owner can alter schema; this is not tamper-proof storage against the database owner.
- Retention has **no automatic deletion**. Limit: 10,000 snapshots, 512 MiB cumulative document bytes, 2 MiB per new snapshot (provider serialization determines byte accounting). Baseline imports preserve existing documents even if they already exceed a limit. Reaching a limit aborts the entire save/restore/publish, preserving existing content/history/audit. Review capacity before high-frequency editing; expanding limits or building an archival workflow needs a reviewed change. There is no history deletion endpoint.
- GET `/api/admin/content/history?page=1&pageSize=10` returns bounded summary pagination and capacity; GET `/api/admin/content/history/:id` returns a validated snapshot. Both require a current authorized administrative session, including verified AAL2 in Supabase mode.
- POST `/api/admin/content/history/:id` requires editor/admin, same-origin JSON `{version, confirm:true}` and a live session. It creates a **new draft/version** linked to the immutable source; published content stays unchanged. Publication remains a separate admin-only confirmed action. Concurrent edits return 409. Editor fields are locked during restoration, and local unsaved changes disable it.
- Restoration validates the schema, all managed private-image registry entries and image bytes, static-file availability, and archived assets. The live session is rechecked after byte reads. The transactional writer rechecks archived state; PostgreSQL also rechecks private object metadata under the same content-row lock as archival. Missing/archived assets cause no partial write. Legacy remote public `portfolio` images cannot provide a managed availability guarantee: historical restoration of those versions is refused until a separate reviewed repair/import workflow exists. Existing published URLs and saved snapshots are retained.
- Historical media references remain intact in JSON. Archival remains a non-destructive soft archive, allowed only when no current draft/published reference exists. A history-only image can be archived; its historical version then becomes unavailable for restoration. This limitation is explicit in the editor. No automatic unarchive, replacement, or byte deletion occurs.
- Compare shows actual field paths and before/after plain text against the current editor, limited to the first 80 changed leaves and 2,000 characters per side. This is a bounded review aid, not a full semantic merge or complete diff export.

## Protected public-layout preview

`/admin-preview/:locale/[[...segments]]` requires `requireActor` on **every document/RSC request**, before reading draft storage. All administrative roles may inspect; Supabase AAL2, live Auth/session binding, enabled role/generation, idle and absolute deadlines remain enforced by the existing auth architecture. There is no public preview token, signed sharing URL, authentication bypass, or cookie that changes public rendering.

- Uses saved draft, then published/default fallback if there is no saved draft. Local unsaved editor changes are clearly excluded until saved.
- Reuses `Home`, `PublicContent`, header, footer and floating controls. Existing public routes keep published-only data and their original design. Direct protected project/article previews can show unpublished entries; public routes and listing visibility still respect publication flags.
- Toolbar selects any existing page/item, RO/RU/EN and desktop/mobile. The mobile canvas is a real same-origin iframe with a 390px viewport. Public-layout internal links stay in the protected canvas; language switches preserve it. Enquiry submission is explicitly disabled in preview, and analytics consent/loading is omitted.
- `force-dynamic`, `revalidate=0`, private/no-store response headers and `noindex,nofollow,noarchive` metadata prevent normal shared caching/indexing. Proxy also marks redirects, errors and RSC responses private/no-store/noindex. No preview routes are added to the sitemap.
- Managed private images become `/api/admin/media/:name` and are **unoptimized**, keeping authenticated bytes out of the public Next image optimizer/cache. Every image request has the existing server-side authorization check and private/no-store headers. Already-public legacy/static assets remain public; they cannot acquire confidentiality retroactively.
- Only `/admin-preview/…` permits same-origin framing (`frame-ancestors 'self'`, `SAMEORIGIN`, `frame-src 'self'`). Other pages keep `frame-ancestors 'none'` and `DENY`. Cross-origin framing remains denied. This narrow exception enables the viewport canvas without opening admin framing.
- Preview reflects the latest saved version on each request; the canvas banner shows its version. It is not a historical-version preview. Already delivered content cannot be recalled from an authorized user's browser after revocation, but subsequent requests fail authorization.

## Editor and source map

Content Studio retains the charcoal/yellow UI, multilingual controls, schema validation, dirty-navigation warnings, separate draft/publication, role restrictions and copy-export recovery. New source-owned Homepage/About fields have a dedicated section. The Media Studio selector queries the actual protected inventory with search/pagination and selects active assets; new uploads continue through the maintained secure image pipeline.

Main additions: `content-history*.ts`, `history-types.ts`, `compare.ts`, history API routes, `admin/content-history.tsx`, `admin/media-selector.tsx`, protected preview route/workbench, `components/public-runtime.tsx` and extracted `public-content.tsx`. `cms-editor.tsx`, existing central storage writers, schema and a few public link/image imports connect these pieces. No credentials, production data or customer records are required for local tests.

## Staging and rollout requirements

**Hosted Supabase remains unvalidated.** Local HTTP Auth fixtures and PGlite SQL execution do not verify hosted GoTrue, PostgREST, storage behavior, grants or hosting caches. No external project, DNS or deployment has been changed.

1. Obtain owner approval for a separate Supabase staging project and HTTPS application origin. Use synthetic users/content/media only. Follow `supabase-staging-validation.md` and `admin-security-validation.md` for the previous phases' Auth/TOTP, role, bucket, session and RLS setup.
2. Set server-only `ARTMASTER_STORAGE=supabase`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ARTMASTER_SESSION_SECRET`, `ARTMASTER_FORM_SECRET`, and HTTPS `SITE_URL` securely in the staging environment. Session/form secrets need at least 32 random characters. Never put service credentials in `NEXT_PUBLIC_*`, client code, Git, chat or screenshots. Keep indexing and external mail/analytics disabled for synthetic verification.
3. Review/apply every migration in order through `202610150005_content_studio.sql` to staging, checking baseline counts, storage capacity, private buckets and grants. This is an external-service change requiring approval; these instructions are not a claim it ran.
4. Enroll actual TOTP for viewer/editor/admin. Test password-only denials for all history/restore/preview/image endpoints; authenticated and anonymous direct database/storage denials; disabled/revoked/idle/expired sessions; role restrictions; actual saved translations; draft/public isolation; RSC responses; optimizer and CDN/cache behavior; restore CAS; missing/archived images; quotas; and separate publication.
5. Verify backup and restoration of snapshots, linked media, audit and permissions in a separate staging restore target before considering a production rollout. Do not run local bootstrap browser tests against hosted or production services.

See [validation evidence and screenshots](content-studio-validation.md) and `release-readiness-phase6.md` for the integration/release gate. Remaining CMS modules above must be scoped separately; no nonfunctional controls were added for them.
