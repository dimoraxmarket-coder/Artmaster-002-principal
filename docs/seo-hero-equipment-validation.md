# SEO / Hero / Equipment validation

Source baseline: PR #7 `c63ad4100bc014e440b056daf4b2a40e76e330c7`. Feature branch: `feature/artmaster-seo-hero-equipment`, stacked onto `feature/artmaster-content-studio`. No parent PR is rewritten or merged. No deploy, DNS or production/Host.md operation occurred.

## Executed working-copy checks

On Linux, Node 24.19.0, npm 11.9.0, Chromium:

- ESLint: passed, zero warnings.
- TypeScript: passed.
- Backend/security/unit/PostgreSQL/backup suite: **113 passed, zero failed/skipped**.
- Production build: passed with the existing explicit loopback-only production smoke-test flag.
- Focused new browser suite: **12 passed, zero failed/skipped**, 23.1 seconds, actual local production server with a new isolated temporary SQLite directory.
- An additional public-origin guard rejects IP literals and reserved/local PageSpeed destinations without outbound requests.
- Client bundle scan: no GOOGLE_PRIVATE_KEY, GOOGLE_CLIENT_EMAIL or google-auth-library in `.next/static`.

The browser suite verifies real rendered RO/RU/EN SEO scores and recommendations, unconnected metrics/null values/date filters, Axe serious/critical checks and mobile overflow, actual Sharp crop uploads for both hero sizes, a valid generated silent MP4, authenticated ranges, anonymous/public draft denial, actual private preview playback, explicit multilingual publication, reduced motion, catalog/specification translations and rights/model publication guards, real public gallery images and sitemap, role checks and logout revocation.

The first browser pass found a low-contrast documentation code label, fixed within the new dark module. Visual review then found zero-height image containers in the existing equipment cards; a scoped equipment-gallery aspect ratio now makes the intended images visible, with concept/illustration labels. Regression checks require each actual image to become visible and decode. No unrelated public layout was redesigned.

The final complete Windows archive is tested by fresh extraction, frozen dependency installation, lint, TypeScript, backend suite, production build and the **full** browser suite, including all previous public form/CRM/CMS/security workflows. Final extracted-copy results, exact source SHA, archive hash/download verification and PR URL are recorded in the PR/delivery report; no result is claimed before it executes.

## Screenshots

Nine real screenshots use isolated synthetic storage, generated pictures and a generated 32×32 silent test MP4. They are workflow evidence, not real manufacturer photographs or demonstration customer records in the distributed database. Sources and fixtures remain committed; runtime data is excluded.

| Screenshot | Actual workflow |
| --- | --- |
| [SEO dashboard desktop](screenshots/seo-hero-equipment/seo-dashboard-desktop.png) | Real empty CRM counts and unconnected Google metrics/date filter |
| [SEO audit desktop](screenshots/seo-hero-equipment/seo-audit-desktop.png) | Ten actual rendered-page checks and honest local indexing failures |
| [SEO audit mobile](screenshots/seo-hero-equipment/seo-audit-mobile.png) | Responsive module and results |
| [Hero editor desktop](screenshots/seo-hero-equipment/hero-editor-desktop.png) | Separate desktop/mobile poster/crop uploads in a saved draft |
| [Hero private preview](screenshots/seo-hero-equipment/hero-private-preview.png) | Protected actual homepage layout with a synthetic silent MP4 |
| [Hero public mobile](screenshots/seo-hero-equipment/hero-public-mobile.png) | Explicit publication, separate mobile image, reduced motion |
| [Equipment editor desktop](screenshots/seo-hero-equipment/equipment-editor-desktop.png) | Candidate, model/rights metadata, three-language specification and private image |
| [Equipment gallery desktop](screenshots/seo-hero-equipment/equipment-gallery-desktop.png) | Actual decoded images after synthetic catalog publication |
| [Equipment gallery mobile](screenshots/seo-hero-equipment/equipment-gallery-mobile.png) | Existing responsive public gallery preserved |

## Required real-world validation

- Native Windows/cmd console/native dependencies are not available and not certified. Test START/CREATE-ADMIN, crop/video and existing local workflows on the owner's PC.
- Hosted Supabase/TOTP/RLS/private Storage/new MIME migration/cache behavior remain unvalidated. Offline PGlite/fixtures are not hosted evidence.
- GA4, GSC and PageSpeed are optional and **not live-connected**. Exact readonly service-account/API/consent steps and reporting timezone limits are in [the implementation/runbook](seo-analytics-hero-equipment.md).
- Official manufacturer research requests were blocked with 403 by the cloud egress proxy. No manufacturer photograph/model/usage license was independently verified or downloaded. The owner's confirmation of the equipment list/photo rights is recorded, with exact variants still requiring recordable evidence. The CMS uses explicit draft templates and rights/model gates rather than importing a lookalike image.
- Source compatibility/retention/hosting and separate deployment approval remain covered by [release readiness](release-readiness-phase6.md).
