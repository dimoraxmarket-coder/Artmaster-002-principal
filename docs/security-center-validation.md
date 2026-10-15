# Phase 5 — validation and screenshots

Validation uses synthetic accounts, requests and images in fresh `/tmp` directories. The browser runs the production Next.js build against loopback local storage; no production data, deployment, DNS or hosted Supabase changes are involved.

## Checks

| Check | Result |
| --- | --- |
| ESLint, zero warnings | Passed |
| TypeScript (`npm run typecheck`) | Passed |
| Backend/security/backup/PostgreSQL (`npm run test`) | **79 passed**, 0 failed/skipped |
| Production build (`ARTMASTER_ALLOW_LOCAL_PRODUCTION=true npm run build`) | Passed |
| Focused Security Center browser workflows | **5 passed**, 0 failed/skipped |
| Complete Chromium suite on the final revision | **70 passed** (4.4 minutes), 0 failed/skipped |
| Hosted Supabase/Auth/TOTP/PostgREST/Storage/SMTP | **Not run — staging access/configuration unavailable** |

The final complete run includes the separate MFA-refusal audit event and mobile role-dialog accessibility capture. All 21 desktop/mobile captures contain synthetic data only.

The existing local production smoke flag requires explicit local storage and a loopback origin. It is not a public production authentication bypass. Browser cookies adapt Secure only inside the loopback test fixture; application cookie protection is preserved.

## Regression evidence

- **Session privacy and ownership:** real current/other registry rows, creation/activity/effective expiry, non-authenticating management handles, no cookie/token/hash disclosure, own-only access, administrator managed-account access and current-session protection.
- **Revocation:** own other sessions and managed-account sessions, denial after replay, pending/full revocation on role/disable changes, account generation checks and no old-cookie revival after re-enable.
- **MFA race closure:** real PostgreSQL executes atomic pending promotion, rollback on duplicate successor, pending replay denial, revocation before promotion, and logout using the consumed pending cookie's binding after promotion. The official Supabase client fixture exercises generation changes during MFA completion and Auth/session-binding denial. These are offline tests, not real GoTrue or multi-connection scheduling validation.
- **Permissions and last administrator:** viewer/editor escalation denial, fresh-login enforcement inside transactions, stale role version, self-change rejection, last-enabled-admin protection, transaction rollback of role/session/audit and previously authorized but subsequently demoted actor rejection.
- **RLS and grants:** direct AAL1/disabled/generation-mismatched JWT reads fail; live AAL2 reads remain available. Authenticated/anonymous clients cannot call new security RPCs, the internal helper is not service-callable, service role cannot rewrite/truncate audit or directly update/delete team roles.
- **Audit privacy/integrity:** action/actor/time filtering and pagination; unknown context, supplied credentials, OTPs, seeds, cookies, arbitrary targets and private request content excluded. SQLite audit updates/deletes are rejected; PostgreSQL service grants permit append/read only. MFA refusal has a separate event with no code/secret payload.
- **Restore:** synthetic local backup retains disabled status, account version and security audit alongside CRM notes/assignment/media/content and private files; copied sessions are revoked. No operational backup is committed.
- **Browser behavior:** native confirmation dialogs, persistent role/status changes, revoked-cookie denial, stale edit messaging, audit pagination/filters/empty state, read-only roles, real logout/re-login requirement and mobile layouts. Axe found no serious or critical WCAG A/AA violations in the exercised Security Center and mobile role dialog. This is not a full manual accessibility certification.
- **Preserved workflows:** existing administration, CRM, Media Studio, CMS drafts/publication and public RO/RU/EN pages are part of the complete suite. The expected image-optimizer 404 in the draft-media test is a successful confidentiality denial.

The browser-bundle marker check found no `SUPABASE_SERVICE_ROLE_KEY`, `ARTMASTER_SESSION_SECRET`, `scryptSync` or `createCipheriv` markers in generated client JavaScript. Server secrets remain in the existing server-only environment configuration.

## Screenshots

All account labels and events shown here are synthetic fixtures written through the actual local backend. No hardware/device labels or real customer identities are invented. Captures scroll to the page top to avoid offscreen fixed-element artifacts in full-page browser screenshots.

| Workflow | Screenshot |
| --- | --- |
| Actual current/other sessions and MFA status | [Desktop Security Center](screenshots/admin-phase5/security-sessions-desktop.png) |
| Session revocation confirmation | [Confirmation](screenshots/admin-phase5/revoke-session-confirmation.png) |
| Complete team directory | [Directory](screenshots/admin-phase5/team-directory-all-desktop.png) |
| Server-side directory search | [Filtered directory](screenshots/admin-phase5/team-directory-desktop.png) |
| Role/access confirmation | [Desktop dialog](screenshots/admin-phase5/team-role-confirmation.png) |
| Responsive accessible role/access dialog | [Mobile dialog](screenshots/admin-phase5/team-role-confirmation-mobile.png) |
| Actual filtered security audit | [Desktop audit](screenshots/admin-phase5/security-audit-desktop.png) |
| Session cards, audit and recovery guidance | [Mobile Security Center](screenshots/admin-phase5/security-center-mobile.png) |

The same screenshot folder also contains fresh captures of preserved dashboard, Inbox, Media Studio, settings and authentication regression workflows.

## Reproduce

Use the repository's Node 24+ environment, installed Chromium and lockfile dependencies. Never point these local-data browser tests at a production URL or data directory.

```bash
npm ci
npm run lint
npm run typecheck
npm run test
ARTMASTER_ALLOW_LOCAL_PRODUCTION=true npm run build
ARTMASTER_DATA_DIR="$(mktemp -d /tmp/artmaster-phase5-e2e.XXXXXX)" \
  ARTMASTER_ADMIN_SCREENSHOTS=1 CI=true npm run test:e2e
```

See [the implementation, migration and staging matrix](security-center.md) and [owner-controlled MFA recovery](mfa-recovery.md). Real staging, provider-wide revocation, invitation delivery and recovery execution remain separate, approved validation work.
