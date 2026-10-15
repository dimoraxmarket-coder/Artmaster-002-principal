# Complete ARTMASTER local project — continuation of Phase 6

The current feature branch preserves the complete stacked application from PR #2–#6 and Phase 6. PR #7 targets `feature/artmaster-security-center`: https://github.com/dimoraxmarket-coder/Artmaster-002-principal/pull/7. No previous PR was merged or rewritten. The original Phase 6 baseline (`2bd6ddb69b0f893f15877a205c8b1f0de794db17`) already had 87 backend/security and 77 browser tests passing, seven screenshots, immutable history, safe restoration, protected previews and the public-page CMS audit.

This continuation adds complete per-form CRM verification and a sanitized Windows distribution, not a new website or dashboard. The public layout, animations, branding, back-to-top, logo navigation and floating contact controls remain unchanged. The existing `ux.e2e.ts` covers those controls in RO/RU/EN, at responsive widths, including keyboard focus and accessibility. All eight administration modules remain in the same Next.js application: Dashboard, Inbox/CRM, Portfolio, Media, Content, Website Settings, Team and Security.

## Every actual public form

Source audit found three public `QuoteForm` placements: homepage (`components/home.tsx`), Contact and Request Quote (`components/public-content.tsx`). There are no other public lead forms. Service CTAs navigate to the quote form and retain service preselection. All forms use the same real `/api/quotes` backend, signed tokens, validation, idempotency, private attachment storage and persistent CRM.

`tests/form-crm.e2e.ts` adds **18 actual local production-browser cases**, all passed in the focused run:

| Actual form | Romanian | Russian | English |
| --- | --- | --- | --- |
| Homepage `/[locale]` | success + storage failure/retry | success + storage failure/retry | success + storage failure/retry |
| Contact `/[locale]/contact` | success + storage failure/retry | success + storage failure/retry | success + storage failure/retry |
| Quote `/[locale]/solicita-oferta` | success + storage failure/retry | success + storage failure/retry | success + storage failure/retry |

For each successful case, the test submits through the browser, validates empty fields and rejected file types, uploads a real synthetic PDF, checks the saved identity/contact/service/message/company/dimensions/quantity/locale/source, reads the matching CRM entry, verifies global totals independently of pagination, downloads and compares the private PDF bytes, and denies anonymous detail/download access. It then opens that exact request in the admin UI, updates status, assigns an authorized staff member, saves a note and checks persisted activity and filters.

A transparent browser observer serializes the submitted FormData for duplicate replay because Chromium's DevTools protocol omits native multipart file bodies. It does not change the submitted FormData or actual fetch. The same signed request returns the same receipt without a second record; altered content with the same idempotency key returns 409.

The failure cases are **real backend storage failures**, not fabricated success or only a mocked UI response. In the isolated temporary SQLite database, a short-lived trigger rejects INSERT only for that case's synthetic email. The actual endpoint returns 500, no partial request appears, input is preserved, and a retry after removing the test trigger reaches CRM. Tests clean up only their own synthetic records/accounts/files and preserve append-only audit. No customers are seeded into the delivered application or archive.

## Content, portfolio, media and security

Existing `content-studio.e2e.ts` verifies draft → protected multilingual desktop/mobile preview → explicit publication on all three public homepages → immutable comparison/restoration into a new draft, without silent publication. It tests unpublished project previews/public 404, private images, restoration CAS, roles and revocation. `admin.e2e.ts` verifies real portfolio image upload, complete translations and publication, CRM pagination/activity and Media Studio persistence/replacement/archival. `security-center.e2e.ts` and backend/SQL suites verify actual local session revocation, role changes, disabled accounts, last-admin safety, audit, deadlines and password-only Supabase denials via controlled fixtures.

Hosted Supabase, real TOTP, hosted storage/RLS/cache behavior and hosted backup restoration remain **unvalidated**. Local SQLite password authentication is only an isolated testing strategy, never equivalent to verified Supabase AAL2. No production authentication or public website deployment was changed.

## Windows/local delivery

- `START.bat` and the compatible `START-WINDOWS.cmd` run a Node launcher that binds only `127.0.0.1`, checks Node >=24, installs frozen dependencies only when needed, creates a safe configuration without overwriting other environments, and initializes `.data/windows-local` through the existing SQLite schema code.
- `CREATE-ADMIN.bat` reuses the existing hidden-password secure bootstrap. It has no password/account default. The environment is forced to local development, mail/analytics/Supabase credentials are cleared, and the public production-local bypass is false.
- Six portable Node unit cases verify environment isolation, compatible Node, validated port override, repeatable setup, refusal of foreign config/data and symlinks, occupied-port safety, and package exclusions. The backend/unit suite with these additions has **93 passing cases**.
- `README-WINDOWS.md` documents extraction, Node/npm, startup/shutdown, administrator creation, synthetic form/CRM/CMS/portfolio checks, persistence, troubleshooting and limitations in Romanian.
- `scripts/package-windows.mjs` archives a **clean committed Git tree** using an allowlist. It includes actual repository public assets, app/backend/admin source, pinned manifests, migrations, templates, tests, docs and scripts. It excludes `.git`, the unused old source ZIP, `.env` files except the example, runtime DB/files, dependencies/builds, private attachments, backups and test outputs. It adds `PACKAGE-INFO.json` with the exact source commit/tree and writes a SHA-256 sidecar outside the checkout.

The package is validated by extraction into a fresh temporary directory, actual `local:prepare`/`npm ci`, lint, TypeScript, backend tests, production build, full browser suite, and the portable local launcher. Final archive SHA, source commit and completed extraction-run results are recorded in PR #7 and the delivery report. The full suite contains the previous 77 browser cases plus these 18 form cases; results are claimed only after execution.

**No native Windows/cmd.exe environment is available.** Batch entry points retain CRLF; portable Node startup is exercised on Linux. Actual Windows console behavior, password entry and native Windows Sharp/SWC/SQLite execution still require the owner's PC smoke test. The first npm installation requires internet; installed font packages serve fonts locally at runtime. No real private media, customer DB, token or secret is distributed.

See [the CMS scope audit and staging setup](content-studio.md), [Phase 6 screenshots](content-studio-validation.md), [Windows instructions](../README-WINDOWS.md) and [the release checklist](release-readiness-phase6.md). Partners, multi-image galleries, social settings and some static imagery/copy still need dedicated management; this package preserves supported functionality without inventing backend features.
