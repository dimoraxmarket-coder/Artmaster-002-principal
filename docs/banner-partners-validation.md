# Banner / partners validation

Environment: Linux, Node.js 24.19.0, npm 11.9.0, Chromium `/usr/bin/chromium`, Next.js production server on loopback. Test data was synthetic and isolated in newly created temporary SQLite directories. No production/customer storage, DNS, Host.md or hosted service was modified.

## Automated checks

- Backend/security: **102 passed**, zero failed/skipped. This includes nine new tests covering candidate safety, strict validation, lossless panorama pixel preservation/alpha/dimensions, permissions, validated artwork upload purpose/backward-compatible photo uploads, private bytes, inventory/archival, selective publication, draft replacements, immutable restoration/conflicts/missing assets and the additive PostgreSQL trigger.
- New browser workflows: **11 passed**, zero skipped, against a real local production server. Actual browser uploads, editor save, 15-candidate import, private RO/RU/EN layouts at 320/390/768/1440 px, role denial, optimizer denial, permission recording, ordering, publication, logo decoding/colors/links, mobile source selection, hiding/archiving and restoration are exercised. Draft assets return 404 publicly and 401 from protected endpoints anonymously. Expected optimizer-denial 404 diagnostics are intentional test outcomes.
- Full browser suite: **106 passed**, zero failed/skipped. Includes all existing public forms in all three languages, PDF/private attachment handling, duplicate/idempotency behavior, backend errors/retry, CRM status/assignment/notes/history, CMS publication/restoration, role/session/team protections, accessibility and responsive public pages.
- ESLint with zero warnings: passed. TypeScript/Next route generation: passed. Production build: passed. Runtime dependency audit: **0 vulnerabilities** (`npm audit --omit=dev`).
- Tests exercise local storage and real PostgreSQL semantics in PGlite. They do **not** validate hosted Supabase, real JWT/TOTP/provider/storage HTTP or native Windows.

Reproduce from a development checkout:

```bash
npm ci
npm run lint
npm run typecheck
npm test
ARTMASTER_ALLOW_LOCAL_PRODUCTION=true npm run build
CI=1 ARTMASTER_DATA_DIR="$(mktemp -d /tmp/artmaster-review.XXXXXX)" npm run test:e2e
```

Set `ARTMASTER_VISUAL_SCREENSHOTS=1` when running `tests/banner-partners.e2e.ts` to recapture synthetic workflow screenshots. Use disposable local storage only; the fixture rejects non-loopback origins.

## Screenshots and honest asset status

Seven actual Chromium screenshots are included in [screenshots/banner-partners](screenshots/banner-partners):

- `before-desktop.png`, `before-mobile.png`: verified PR #7 default homepage before changes.
- `admin-candidates-needing-confirmation.png`: new administration cards with screenshot transcriptions, no imported logos or confirmed relationships.
- `admin-banner-synthetic-test.png`: actual upload/selection controls, using an explicitly labelled test fixture.
- `private-preview-desktop-synthetic-test.png`, `private-preview-mobile-synthetic-test.png`: protected drafts with the same real public layout and an explicitly synthetic full panorama.
- `public-published-synthetic-test.png`: local explicit-publication test, visibly labelled synthetic. Fixture publication is restored afterward and does not seed the package.

The exact owner banner was **not imported**: its binary attachment is unavailable in the workspace. Its optimized size and final visual approval are pending. No official partner logos were downloaded: every attempted candidate domain was blocked by the network proxy with 403. The [source register](partner-source-register.md) distinguishes transcribed names and candidate URLs from verified sources. No real before/after using those unavailable assets is claimed.

## Package verification

The downloadable archive is created only from a clean committed Git tree with the existing allowlist packager. It must include START.bat, CREATE-ADMIN.bat, source/lockfile/assets, both content migrations, the new editor and Romanian documentation. It excludes environment files except templates, node_modules, .next, databases, attachments, backups, traces and temporary test directories. Source SHA is embedded in PACKAGE-INFO.json; external SHA256 verifies transport.

Fresh extraction, dependency installation, local SQLite preparation, lint/types/backend/build/browser results and actual portable-launcher smoke evidence are recorded in the distribution branch's VERIFICARE.md. The ZIP is not advertised as native-Windows certified. Actual cmd.exe/PowerShell console behavior and Windows native Sharp/SWC packages require a Windows machine.

## Release gates

1. Import the exact original banner, measure stored bytes and review all service/telephone details and viewport sizes.
2. Verify official companies/resources and permissions; replace pending text entries only with the correct authorized logos.
3. Review stacked/sibling PR integration, including PR #8; no merge is performed here.
4. Apply reviewed additive migrations only in separate synthetic Supabase staging and exercise real AAL2, roles, revoked/disabled sessions, RLS/direct storage and draft publication/privacy.
5. Confirm backups/restoration, hosting Node compatibility, real-asset LCP/CLS, accessibility and native Windows startup. Deployment requires a separate approval.
