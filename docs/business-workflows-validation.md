# Phase 4 validation and screenshots

Local validation uses isolated directories under `/tmp`, synthetic accounts/requests/images and the production Next.js server on loopback. Existing repository data is not used. Screenshots contain no credentials or customer data. No hosted Supabase integration, production deployment, DNS change or Host.md edit was performed.

## Results

| Check | Result |
| --- | --- |
| ESLint (`npm run lint`, zero warnings) | Passed |
| TypeScript (`npm run typecheck`) | Passed |
| Backend, security, backup and real PostgreSQL SQL tests (`npm run test`) | 56 passed; 0 failed/skipped |
| Production build (`ARTMASTER_ALLOW_LOCAL_PRODUCTION=true npm run build`) | Passed, including route generation |
| Focused admin browser suite | 10 passed; 0 failed/skipped |
| Complete Chromium browser suite | 65 passed (3.9 minutes); 0 failed/skipped |
| Hosted Supabase staging / real TOTP / Storage integration | **Not run: staging project and credentials unavailable** |

The local production flag is limited by existing configuration to explicit local storage with a loopback site origin. This smoke-test setting does not allow a public production local-auth deployment.

Coverage includes more than 200 SQLite/PostgreSQL synthetic requests, accurate global totals, Unicode/literal search, pagination, filters, note/assignment persistence, invalid assignees, read-only roles, atomic stale-write rejection and history pagination. New APIs deny missing MFA and revoked/expired sessions. PostgreSQL tests verify new table/RPC client denials, mutation roles and transaction rollback.

Media checks cover persistence across reload, adoption of existing local originals, private upload/preview, visible publication rules, replacement confined to the saved draft, published URL continuity, confirmed administrator-only archive, saved-reference rejection, archived-reference save rejection, and retained bytes. Synthetic backup/restore verifies notes, assignment, registry metadata, content, private files and revocation of restored sessions.

Browser coverage includes notes/assignment/conflict handling, next/previous pages, mobile Inbox/Media, private download, security status/logout, existing content drafts/publication and public-site workflows in RO/RU/EN. Axe scans found no serious or critical WCAG A/AA issues in the exercised views. This is automated coverage, not a complete manual accessibility certification. A table positioning fix keeps visually hidden labels inside the mobile scroll container; dialog focus restoration follows the refreshed request row.

The image-optimizer 404 logged during the confidentiality test is expected: unpublished originals must not be accessible through the public optimizer.

## Screenshots

| Workflow | Desktop | Mobile |
| --- | --- | --- |
| Dashboard with real database totals | [Dashboard](screenshots/admin-phase4/dashboard-desktop.png) | [Dashboard](screenshots/admin-phase4/dashboard-mobile.png) |
| Client Inbox and filters | [Inbox](screenshots/admin-phase4/inbox-desktop.png), [filtered database results](screenshots/admin-phase4/inbox-filtered.png) | [Inbox](screenshots/admin-phase4/inbox-mobile.png) |
| Request details, notes and assignment | [Details](screenshots/admin-phase4/request-detail.png), [notes and activity](screenshots/admin-phase4/crm-notes-activity.png) | Responsive dialog uses the existing full-width mobile layout |
| Persistent Media Studio | [Library](screenshots/admin-phase4/media-library-desktop.png), [private replacement beside published original](screenshots/admin-phase4/media-replacement.png) | [After safe archiving](screenshots/admin-phase4/media-mobile.png) |
| Existing settings / security / authentication | [Settings](screenshots/admin-phase4/website-settings-desktop.png), [Security Center](screenshots/admin-phase4/security-desktop.png), [sign in](screenshots/admin-phase4/sign-in.png) | Mobile navigation exercised in browser tests |

Synthetic flat-color images make old/new draft/public states easy to identify. They are test fixtures, not customer assets or fictional business statistics.

## Reproduce

Use Node 24+, the lockfile installation and installed Chromium. Never supply a production URL or production data directory to browser tests.

```bash
npm ci
npm run lint
npm run typecheck
npm run test
ARTMASTER_ALLOW_LOCAL_PRODUCTION=true npm run build
ARTMASTER_DATA_DIR="$(mktemp -d /tmp/artmaster-phase4-e2e.XXXXXX)" \
  ARTMASTER_ADMIN_SCREENSHOTS=1 CI=true npm run test:e2e
```

The Playwright configuration supplies local storage, a loopback origin and disabled email delivery. Its ephemeral accounts authenticate through the actual local backend. The browser cookie's Secure flag is adapted only in the loopback test fixture, never in application authentication. Public routes and authorization middleware remain active.

See [business-workflows.md](business-workflows.md) for the complete API/schema inventory, source map, safe rollout and exact outstanding staging matrix. Advanced Security Center/role administration, historical content rollback and full-site protected previews remain a later phase; existing controls are preserved and unsupported controls remain disabled.
