# SEO & Analytics, responsive hero and equipment catalog

This feature branch starts at PR #7 commit `c63ad4100bc014e440b056daf4b2a40e76e330c7`. It preserves the existing public layouts, premium admin shell, eight original modules, forms/CRM, content history/previews, Media Studio and Security Center. New navigation entries are SEO & Analytics and Equipment Studio. No deployment, DNS, production content, Host.md changes or parent PR changes are authorized or performed.

## SEO audit: an explicit 0–100 formula

Select an actual published route in the center and run the audit. The server fetches only the configured application origin and a route from the published route allowlist, plus that application's sitemap.xml and robots.txt. It sends no cookies/tokens, follows no redirects, enforces time/body bounds and does not accept arbitrary hosts, query strings, admin/preview/API paths. Only local synthetic loopback was exercised in this phase; the old production site was not crawled.

Ten independent checks have equal weight: **score = 10 × number of passing checks**. Each failure earns zero; unchecked pages have no score. A failed fetch shows an error, not an invented report. The UI retains per-page results only for the current mounted session and displays the timestamp/coverage. No global site score is claimed from a single page.

| Check | Passing evidence | Limits |
| --- | --- | --- |
| Title | One actual title, 15–70 characters | Length heuristic; cross-page uniqueness and search display are not certified |
| Description | Actual meta description, 50–180 characters | Editorial quality and cross-page uniqueness need review |
| Canonical | Exactly one absolute canonical equal to this route | Does not prove Google's selected canonical |
| Hreflang | Actual RO/RU/EN/x-default alternates match equivalent routes | Uses the app's shared multilingual route inventory |
| Sitemap | Actual rendered XML contains this URL | Concept/private entries can intentionally fail this check |
| Robots | App-generated rules do not block the public page | Interprets this app's emitted basic rules, not arbitrary third-party robots dialects |
| Structured data | JSON-LD exists, parses, and has Schema.org context and type/graph | Not a Google Rich Results eligibility guarantee |
| Alt | Every img has an alt attribute | Empty decorative alt is valid; meaning/quality requires human review |
| Internal links | Actual anchors resolve to published route inventory or repository public asset | External links, redirects outside the allowlist and fragment IDs are not crawled/certified |
| Indexing readiness | Public HTTPS/indexing configuration and no noindex | Local/staging should fail intentionally; actual Google indexing remains unverified |

Recommendations and evidence appear per check/page. The audit is a transparent local heuristic, not a ranking prediction, Google score or comprehensive SEO certification. Audit POST is authenticated/AAL2 in Supabase; read-only roles can audit but cannot upload/publish or trigger paid/quota PageSpeed work. Rate limits bound cost.

## Real metrics, dates and consent

CRM submissions are aggregated from persisted quotes server-side, independently of pagination, without exposing customer fields. Date range is inclusive, at most 93 days, no future dates. Zero-count CRM days are real empty counts. An additive SQLite expression index supports the existing JSON createdAt field; PostgreSQL uses service-only `seo_conversion_days` with no browser grants.

GA4 visitors/sessions/key events are **null until successfully connected**. Empty/failed/disconnected providers have explicit states, never demo customers or fabricated visitor values. GA4 totalUsers is requested in a separate aggregate report; daily users are not summed (that would double-count visitors). Daily charts have accessible exact-value tables. Search Console returns only daily web-search clicks/impressions, not queries or visitor identities. Google reports cache server-side for 15 minutes, bounded to 50 entries, without persistent tokens.

CRM uses UTC; GA4 uses its property timezone; Search Console uses Pacific calendar dates. Google delays, consent exclusions and privacy thresholds apply. The UI does not divide all CRM requests by consented GA4 sessions. GA4 sessionKeyEventRate is the provider's real metric and keyEvents are whatever the owner configured, not automatically all requests.

Existing public consent remains authoritative: gtag loads only after acceptance. Successful quote-save dispatch already emits generate_lead only to the consent-enabled handler; no customer text, email, phone or attachment is sent. No new tracking ID is enabled, no RUM collector is installed, and refusal does not affect CRM. The cookies page retains the existing preference-reset control. Review local legal/privacy obligations before enabling a production integration.

## Exact Google setup — owner operation, not performed here

No live Google credentials are available. Real GA4/GSC/PageSpeed connections have **not** been validated. Adapter tests use controlled synthetic HTTP responses and verify fixed hosts, readonly scopes and sanitized failures. Provisioning/access grants/API enablement must be approved and performed by the owner outside this change.

1. Create/use a dedicated Google Cloud project for approved staging, with a separate synthetic/staging GA4 property and Search Console property for an HTTPS origin under the owner's control. Do not connect the old live Host.md site during local testing.
2. Enable **Google Analytics Data API** (`analyticsdata.googleapis.com`) and **Google Search Console API** (`searchconsole.googleapis.com`). For the optional mobile PageSpeed button also enable **PageSpeed Insights API** (`pagespeedonline.googleapis.com`) and obtain a restricted key with a suitable quota. Review costs/quotas; the app limits PageSpeed to ten requests per actor/hour.
3. Create a dedicated Google service account with no project-wide administrator role. In GA4 Admin → Property access management, grant its email **Viewer** on the intended property. The numeric property ID is different from the public G- measurement ID.
4. Verify the owned Search Console property using Google's supported owner workflow. Add the same service-account email with the minimum read access that exposes Performance reports; test permissions. The app accepts only `https://<SITE_URL host>/` exactly or `sc-domain:<SITE_URL hostname>`; arbitrary properties/hosts are rejected. Parent-domain property mapping is intentionally not guessed.
5. Provision the service-account private key securely, with rotation/revocation procedures. This implementation uses maintained **google-auth-library JWT**, explicit credentials, fixed Google APIs, and readonly scopes `https://www.googleapis.com/auth/analytics.readonly` / `https://www.googleapis.com/auth/webmasters.readonly`. It does not use broad Cloud scopes, public OAuth tokens or browser key entry. The signing key must be a real server runtime secret, not an outbound-proxy placeholder; never paste it into chat or Git.
6. Set server-only runtime variables securely: `ARTMASTER_GOOGLE_REPORTING_ENABLED=true`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` (PEM, real newlines or escaped \n), `GA4_PROPERTY_ID` (numeric), `GSC_SITE_URL` (exact origin with trailing slash, or matching sc-domain property). Never use NEXT_PUBLIC_ for credentials. Egress must allow `oauth2.googleapis.com`, `analyticsdata.googleapis.com`, `searchconsole.googleapis.com`. Errors are returned as unavailable, without upstream bodies, token strings or credentials.
7. For public consented collection separately set the existing `GA_MEASUREMENT_ID=G-...` only on approved staging/production; keep it empty locally. In GA4 configure generate_lead as a key event if this is the desired conversion. Test acceptance, refusal, withdrawal, duplicate submission behavior and DebugView/Realtime without PII. Existing GSC_VERIFICATION is optional public verification metadata, not API authorization.
8. Optionally set `ARTMASTER_PAGESPEED_ENABLED=true` and server-only `PAGESPEED_API_KEY`; allow egress to `pagespeedonline.googleapis.com`. Only an editor/admin can request a test, after UI confirmation, for a known public route. Non-HTTPS origins, IP literals and reserved/local hostnames are rejected; the owner must configure an approved publicly reachable hostname. Lighthouse lab score is separate from **CrUX p75** LCP/INP/CLS; insufficient field data stays null, never zero. No hosted run occurred here.
9. Restart only the approved application environment; test date-filtered real API results against the provider's own reports and timezones. Verify secret-free bundles/logs, session revocation and role/AAL2 restrictions. Record actual hosted evidence before claiming connectivity. The app never changes Google property settings or permissions.

Official references to consult: https://developers.google.com/analytics/devguides/reporting/data/v1 ; https://developers.google.com/webmaster-tools/v1/searchanalytics/query ; https://developers.google.com/speed/docs/insights/v5/get-started . Access to these official domains is currently restricted in the cloud environment; reference URLs are provided without pretending a live documentation review occurred.

## Hero Studio

The existing translated hero title/accent/description/CTA editor remains. Optional versioned `heroMedia` contains a required desktop image/poster and optional separate mobile image/poster, each optionally paired with a managed MP4/WebM video. Without heroMedia, the exact original responsive AVIF/WebP picture and concept caption remain.

Owners can choose an existing image from Media Studio or upload PNG/JPEG and crop it. The browser shows the exact normalized crop rectangle with horizontal/vertical position and zoom; Sharp auto-orients, checks pixels, crops server-side, strips metadata and writes a **new** optimized WebP (at most 2400 px / 5 MB). No source asset is overwritten. Video is signature/MIME checked with maintained file-type, at most 20 MB, stored in the same private bucket/inventory and served with validated single-byte ranges and nosniff. It is not transcoded or codec-certified; use browser-compatible MP4 H.264 or WebM, silent decorative footage, and check preview. Arbitrary remote video embeds/HTML are rejected.

Uploads require editor/admin, live session/AAL2, same-origin, bounded body/rate limit and explicit rights confirmation. Videos/posters are versioned, tracked for usage, protected from in-use archival, checked during restoration, and remain private until referenced by a published visible document. Preview maps to authenticated unoptimized routes; public/private responses remain private/no-store, and authentication precedes range handling. Public poster/video URLs keep the established /api/media pattern and old published URLs work.

Desktop/mobile and reduced-motion behavior preserve the existing layout. Reduced motion renders only the poster. Decorative looping video is muted and has an explicit pause/play control. The default banner's concept caption is retained only for the unchanged conceptual default. A saved draft uses the existing private preview and separate explicit administrator publication; restoration creates a new draft.

## Equipment Studio, sources and rights

The old generic workshop entries and public URLs are preserved. Optional per-equipment catalog metadata adds model/manufacturer, RO/RU/EN category/specification label/value, order, visibility, verification, HTTPS source URL and image-rights status/note. The public card gallery retains the premium existing layout and responsive styling; confirmed entries add categories and specifications. The existing Media Studio picker/upload remains the source of replaceable photos.

Nine **candidate templates** are available through a real add-to-draft action, never silently seeded into the public catalog. They persist through the normal draft/save/history flow. A catalog entry marked for inclusion requires owner_confirmed model, owner/licensed photo status and a rights note (licensed photos additionally require a source). The whole document still needs explicit admin publication. Hidden catalog items are absent from actual public pages, sitemap, SEO route inventory and public media authorization. Private preview can show them. Legacy generic entries keep their old behavior until staff explicitly activates catalog metadata.

On 16 October 2026 the owner stated that the listed machines are theirs and that they have photo usage rights. This owner statement is recorded; it is not an independent model/variant inspection or a blanket manufacturer-license finding. Templates require the operator to confirm the exact machine and record photo evidence before publication. No manufacturer image was downloaded/imported; no other machine's photograph was substituted.

| Candidate | Current evidence / exact missing detail | Official research link, not a verified photo license |
| --- | --- | --- |
| Roland VS-640 | Owner reports list; verify VS-640 vs VS-640i label | https://downloadcenter.rolanddg.com/ |
| Roland RS-540 | Owner reports list; exact label/configuration required | https://downloadcenter.rolanddg.com/ |
| Roland RS-540i | Variant spelling/existence remains independently unverified | https://downloadcenter.rolanddg.com/ |
| Mimaki UJV55-320 | Owner reports list; exact workshop label/configuration still needs recording | https://mimaki.com/product/inkjet/i-roll/ujv55-320/ |
| Harfmak HM-430 | Exact brand/model/specification evidence required | https://www.harfmak.com/ |
| INC-S MAX 3D | Exact manufacturer/model/build volume required | No authoritative source identified |
| Large Yusto laser | Brand/model/power/work area unverified | No authoritative source identified |
| CNC ≈2350 × 2250 mm | Approximate size only, exact maker/model/usable area required | No authoritative source identified |
| Latex printer | Maker/model unknown | No authoritative source identified |

Actual HTTPS research requests to Mimaki, Roland Download Center and Harfmak returned **403 tunnel access denied**, before content was retrieved. No online manufacturer model or photograph verification is claimed. A draft network configuration preserves api.github.com and requests the exact official domains for future review; saving it does not apply/publish network access. Once allowed, consult the exact official model page/manual, record final URL/date/photo credit and license/permission. Public availability is not itself a reuse license. With owner's own photographs, upload through Media Studio and record the owner's authorization. Neutral owned placeholder artwork is explicitly Photo pending, not an alleged machine photo.

## Migration, compatibility and verification

`202610160001_seo_hero_equipment.sql` is additive: extends central content write/archival checks to nested image **and video** references, retains immutable history, CAS, roles and audit; adds service-only aggregate RPC; extends MIME/size configuration of the **private** portfolio bucket without adding client grants. Apply all prior migrations first. No existing rows/files/history are rewritten or deleted. SQLite uses optional JSON fields plus a createdAt expression index; existing documents need no destructive migration.

Review migrations before approved Supabase staging; do not apply them to production here. Hosted Supabase/TOTP/RLS/Storage and real Google remain unvalidated. Preserve ordered stacked PR review, backups and isolated restoration, hosting compatibility and separate deployment approval in release-readiness-phase6.md. Optional new JSON fields can make older strict schemas reject documents; use a compatible rollback, never erase history/fields to force an old binary to run.

Windows startup still enforces isolated development, loopback binding, empty SQLite/bootstrap without default credentials and disables inherited Google/Supabase/mail/analytics settings, including GOOGLE_APPLICATION_CREDENTIALS. The updated ZIP is generated only from the clean committed source allowlist, without runtime data/dependencies/builds/secrets/backups. Native Windows is unavailable; do not label Linux portable-launcher tests as native Windows verification.

Executed final checks, screenshots, PR/source SHA and the final Windows archive checksum are recorded in the PR and delivery report. Backend tests cover scoring defects/date bounds/aggregates/provider parsing, rights/crop/private assets/ranges/revocation, all new API denials before Supabase AAL2, PostgreSQL service grants and video archival. Browser tests exercise actual HTML audit, unconnected metrics/filters, desktop/mobile crop upload, real MP4 preview/ranges, publication, reduced motion, catalog translation/specifications/private preview/publication, denied roles and layout/accessibility. Full regression includes the prior public form-to-CRM flows; no actual external service success is claimed.
