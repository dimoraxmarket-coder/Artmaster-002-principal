# Phase 6 validation evidence — 15 October 2026

Final implementation: `feature/artmaster-content-studio`, based on verified PR #6 commit `c023f807be7a9a2abde7cec85fe9a1a8a346d1f2`. Existing PR #2–#6 remote tips were rechecked and preserved.

**Hosted Supabase integration was not run or validated.** These results are local production-server/browser tests, synthetic HTTP Auth fixtures and actual SQL migration execution in PGlite. No production/customer data, external staging configuration, deployment, DNS or Host.md changes were used.

| Completed check | Actual result |
| --- | --- |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` (`next typegen` + TypeScript) | Passed |
| `npm run test` | **87 passed**, 0 failed, 0 skipped |
| `ARTMASTER_ALLOW_LOCAL_PRODUCTION=true npm run build` | Passed; new protected routes are dynamic |
| Full `CI=true npm run test:e2e`, isolated temporary `ARTMASTER_DATA_DIR`, Chromium | **77 passed**, 0 failed, 0 skipped; retries disabled; about 4.5 minutes |
| Browser bundle inspection | No `SUPABASE_SERVICE_ROLE_KEY`, `ARTMASTER_SESSION_SECRET` or `node:sqlite` markers in `.next/static` JavaScript |
| Git/diff review | No environment files, databases, backups, attachments, test traces or customer data in the change; previous PR branches preserved |
| Real Supabase staging / hosted TOTP / hosted database + storage recovery | **Not run — still required before release** |

Reproduce the browser checks only on isolated loopback local storage, after building:

```sh
ARTMASTER_DATA_DIR="$(mktemp -d /tmp/artmaster-phase6.XXXXXX)" \
ARTMASTER_CONTENT_SCREENSHOTS=1 CI=true npm run test:e2e
```

The existing local-production flag is restricted to explicit loopback smoke testing. The Playwright server forces local storage and disables email; it does not weaken public production authentication. Do not point bootstrap browser tests at hosted or production services. The environment uses Node 24 and `/usr/bin/chromium`; no dependency or lockfile updates were needed.

## New coverage

`content-studio.test.ts` covers authenticated history reads, viewer restrictions, origin checks, immutable snapshots, real actors/timestamps, draft/public distinction, CAS restoration into a new draft, retained source versions, media replacement history, archived/missing-byte rejection without partial writes, revoked access, strict multilingual copy compatibility, bounded comparisons, additive baseline migration and atomic capacity refusal.

`mfa.test.ts` now includes history/list/detail/restore and saved-draft preview in password-only denials for viewer/editor/admin, with zero protected data reads before verified MFA. These use the maintained Supabase client against synthetic HTTP fixtures, not hosted GoTrue.

`security-postgres.test.ts` executes the full ordered migration stack through `202610150005_content_studio.sql` in PGlite. New checks cover browser-role denial of history and RPCs, service-role write restrictions, immutable history, the legacy writer contract, editor/admin publication restrictions, source/content equality, restoration CAS, new-draft-only semantics, storage-metadata availability, archived assets and capacity rollback. Real Supabase storage permissions/physical bytes still need staging validation.

`backup.test.ts` now verifies that synthetic restored SQLite history retains its content and immutable protection, alongside existing attachments, private media, CRM, audit, account state, permissions, checksum/symlink checks and copied-session revocation. This is a local backup/restore test, not a hosted disaster-recovery certification.

The seven new `content-studio.e2e.ts` workflows use actual persisted local records and the built production application:

1. Anonymous history, HTML/RSC preview and private-image requests fail; the public image optimizer cannot obtain authenticated media.
2. Saved draft RO/RU/EN text renders in the real public layouts; private bytes load through protected unoptimized images; the mobile iframe viewport is 390px with no horizontal overflow. About and unpublished-project previews work; the new unpublished project remains 404 on the public route.
3. Structured multilingual editing retains dirty state and selects a real existing Media Studio asset; restoration stays disabled while unsaved edits exist.
4. Comparison and confirmed restoration produce a new draft/version; published content is unchanged, stale CAS fails, and the restored record links to its source.
5. Explicit administrator publication renders new copy on all three public homepages. Only currently published image references grant public gateway access; restoring the public document and retaining the draft makes the image gateway private again.
6. Viewer preview works, viewer restoration and editor publication fail, and revoked sessions cannot reload preview or history.
7. Editor and preview checks have no serious/critical WCAG A/AA findings. The expanded comparison panel is also checked in the restoration scenario. These automated checks are not a complete manual accessibility certification.

All 70 previous browser cases also passed in the final 77-test run: CRM, Media Studio, actual session revocation, team role changes, last-admin protection, security audit, reauthentication, public navigation/metadata, multilingual responsive layouts, quote forms/private attachments, contact/map consent, floating controls and accessibility checks. The new fixture removes only its own synthetic accounts so it does not change the following last-admin scenario; immutable history and audit remain intact.

## Screenshots

Captured from actual Chromium workflows against the synthetic local production server. No staged screenshots, customer records, MFA seeds, credentials or tokens are included. Full-size images are retained; browser traces and temporary databases remain ignored.

| View | Artifact |
| --- | --- |
| Content Studio desktop, new Homepage/About controls | [Desktop editor](screenshots/admin-phase6/content-editor-desktop.png) |
| Content Studio mobile after restoration | [Mobile editor](screenshots/admin-phase6/content-editor-mobile.png) |
| Unsaved editing and disabled restoration | [Unsaved state](screenshots/admin-phase6/content-editor-unsaved.png) |
| Immutable history and real comparison | [History/comparison](screenshots/admin-phase6/content-history-desktop.png) |
| Romanian desktop public-layout preview | [RO preview](screenshots/admin-phase6/preview-ro-desktop.png) |
| Russian desktop public-layout preview | [RU preview](screenshots/admin-phase6/preview-ru-desktop.png) |
| English 390px mobile public-layout preview | [EN mobile preview](screenshots/admin-phase6/preview-en-mobile.png) |

The screenshots were visually inspected for charcoal/yellow consistency, readable comparison paths, multilingual rendering, preserved public appearance and mobile sizing. Prior-phase screenshots were not overwritten.

## Limitations and release gate

See [the complete public-page audit, source map and exact staging configuration](content-studio.md) and [the release-readiness checklist](release-readiness-phase6.md). Partners, multi-image galleries, social links, hero/About image controls and some static/layout/legal/SEO text remain outside this increment. Historical remote public-image versions cannot yet be restored; archived/unavailable assets fail closed. History has finite capacity and no automatic deletion. Older strict-schema binaries need a forward-compatible rollback plan. Real Supabase staging, hosted cache/storage behavior and hosted database/object restoration remain release blockers.

## Changed-file inventory

```text
README.md
docs/content-studio-validation.md
docs/content-studio.md
docs/release-readiness-phase6.md
docs/screenshots/admin-phase6/content-editor-desktop.png
docs/screenshots/admin-phase6/content-editor-mobile.png
docs/screenshots/admin-phase6/content-editor-unsaved.png
docs/screenshots/admin-phase6/content-history-desktop.png
docs/screenshots/admin-phase6/preview-en-mobile.png
docs/screenshots/admin-phase6/preview-ro-desktop.png
docs/screenshots/admin-phase6/preview-ru-desktop.png
src/app/[locale]/[...segments]/page.tsx
src/app/[locale]/page.tsx
src/app/admin-preview/[locale]/[[...segments]]/page.tsx
src/app/admin-preview/[locale]/[[...segments]]/workbench.module.css
src/app/admin-preview/[locale]/[[...segments]]/workbench.tsx
src/app/admin/cms-editor.tsx
src/app/admin/content-history.tsx
src/app/admin/content-studio.module.css
src/app/admin/media-selector.tsx
src/app/api/admin/content/history/[id]/route.ts
src/app/api/admin/content/history/route.ts
src/components/floating-actions.tsx
src/components/footer.tsx
src/components/header.tsx
src/components/home.tsx
src/components/location-section.tsx
src/components/page-parts.tsx
src/components/portfolio-gallery.tsx
src/components/public-content.tsx
src/components/public-runtime.tsx
src/components/quote-form.tsx
src/lib/content/compare.ts
src/lib/content/history-types.ts
src/lib/content/page-copy.ts
src/lib/content/types.ts
src/lib/server/content-history-local.ts
src/lib/server/content-history.ts
src/lib/server/content-preview.ts
src/lib/server/local.ts
src/lib/server/schema.ts
src/lib/server/supabase.ts
src/lib/server/types.ts
src/proxy.ts
supabase/migrations/202610150005_content_studio.sql
tests/backup.test.ts
tests/content-studio.e2e.ts
tests/content-studio.test.ts
tests/mfa.test.ts
tests/security-postgres.test.ts
```
