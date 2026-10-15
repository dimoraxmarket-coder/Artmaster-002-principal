# Supabase staging setup and real acceptance procedure

**Status: not provisioned and not run.** No Supabase credentials or project configuration were available for Phase 2. This document prepares the work; it is not evidence of a live test. Obtain explicit approval before creating/changing an external project, applying migrations, creating accounts, changing Auth settings or resetting factors. Do not use Host.md, production project credentials, production domains, real customer records or production backups.

## Configuration required from the owner

1. Approve a dedicated Supabase staging project and any associated cost. Supply its project reference and HTTPS project URL through the environment's secure settings. Record the approved reference in the protected staging checklist and verify it against the dashboard before any operation. Choose a region and project owner with independent provider MFA.
2. Securely inject these into the isolated staging application process (never chat, a PR, a tracked file, CLI argument or log):

   | Name | Requirement |
   | --- | --- |
   | `SUPABASE_URL` | Exact `https://<approved-project-ref>.supabase.co` origin |
   | `SUPABASE_ANON_KEY` | Project anon key supported by the existing client; a compatible publishable key may be used only after verification |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server-only service key with Auth Admin/PostgreSQL/Storage capability; never a browser variable |
   | `ARTMASTER_FORM_SECRET` | Independently generated random secret, at least 32 random bytes, securely injected as actual local signing material |
   | `ARTMASTER_SESSION_SECRET` | Separate random secret with the same requirement; not a proxy replacement placeholder for local encryption |

3. Non-secret application settings: `ARTMASTER_STORAGE=supabase`, `SITE_INDEXABLE=false`, `SITE_URL` set to the exact approved staging HTTPS origin (or `http://127.0.0.1:3200` solely for loopback smoke tests), `ARTMASTER_ALLOW_LOCAL_PRODUCTION=false` for HTTPS staging. Loopback production-build checks need the existing explicit `true` site-URL option; it **never** skips Supabase MFA. Keep `RESEND_API_KEY` and `RESEND_FROM_EMAIL` empty, analytics disabled and public registration disabled. Do not use fake email-delivery success.
4. Allow only the approved project hostname in network settings. Configure the staging HTTPS transport and trusted IP-header contract if needed; leave `ARTMASTER_TRUST_PROXY=false` until the host demonstrably overwrites the selected header. Do not broaden to `*.supabase.co` or trust client-supplied forwarded IPs by default.
5. Enable Auth TOTP enrollment and verification using the provider's supported settings. Use an authenticator controlled by the synthetic account tester. Confirm Auth access-token lifetime (recommend no longer than one hour); application idle/absolute limits are additional, not a substitute. Set site/redirect origins narrowly if used, disable unneeded sign-in providers, and check account/password/rate policies. Do not weaken provider controls just to make a test pass.

Securely injected process variables take precedence over the repository's ignored local example configuration. Do not copy a development `.env.local` to a public host. Proxy credentials may be substituted only on their configured HTTPS destinations; local cryptographic secrets require real private runtime material. Verify service operations before diagnosing a missing binding.

## Approved provisioning sequence

After approval, in the project SQL migration workflow apply these exact files in order:

1. `supabase/migrations/202610130001_artmaster.sql`
2. `supabase/migrations/202610150001_admin_mfa.sql`
3. `supabase/migrations/202610150002_admin_validation.sql`

Use the migration-owner role and inspect errors; do not execute against an unverified project or replace migrations with hand-edited grants. Confirm `quote-files` and `portfolio-private` are private, legacy `portfolio` is public, authenticated clients cannot execute `touch_admin_session` or read session rows, and policy/function ownership is trusted. Existing objects are not removed by these scripts.

Create three unique, synthetic viewer/editor/admin accounts through `npm run admin:create`, with `ADMIN_EMAIL` and `ADMIN_ROLE` set for each. Supply each unique password through private stdin/password-manager injection, not command arguments or `ADMIN_PASSWORD` in shell history. `example.invalid` accounts may be used for owner-created confirmed synthetic accounts; no email delivery is expected. Do not create default/shared credentials, use real client identities or store fixture passwords in the repository. Public sign-up must remain disabled.

From the branch checkout run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, then build and start the staging app with the settings above. For loopback-only builds: `ARTMASTER_ALLOW_LOCAL_PRODUCTION=true npm run build` and start on port 3200 with that same explicit site option; Supabase mode remains mandatory. Processes need their securely injected settings at both build/start. The ordinary `test:e2e` suite provisions SQLite fixtures and must **not** be pointed at Supabase or production. Use the manual/SDK acceptance below for real staging.

## Acceptance matrix — record actual results

For each synthetic role, use separate browser profiles and the actual maintained Supabase client. Disable screenshots, video, trace/network-body capture, shell tracing and verbose SDK logs around passwords, QR codes, OTPs, cookies and tokens. Keep credentials/JWTs in memory only; never paste tokens into a ticket or SQL log. Record test identity/role, project reference, code commit, time, expected result, observed status and pass/fail, without sensitive payloads.

| Check | Required real observed behavior |
| --- | --- |
| Anonymous admin data/previews/attachments | All data APIs deny; `/admin` shows only sign-in |
| Password login without a verified factor | Only enrollment gate; all protected application/direct data access denied |
| Enrollment for all three roles | Actual Auth factor/QR enrollment succeeds; verify with the real authenticator; wrong/expired codes fail |
| Enrolled login | Password leads to challenge; no data before correct TOTP; correct code yields AAL2 |
| Direct AAL1 SDK reads | No roles, enquiries, CMS/audit rows or private objects; no mutations/RPC/session-table access |
| Direct AAL2 SDK without registered app session | Still no protected rows; a provider login alone is insufficient |
| Direct AAL2 with its matching active application Auth session | Existing team/role reads succeed; another user's/session's token fails. Use a controlled staging-only test harness with approved server access to bind the SDK's real verified `session_id`; do not fabricate JWT claims or disclose browser session material |
| Roles after MFA | Viewer read/preview/download only; editor draft/upload/status only; admin publication/retry; no self-escalation |
| Logout and replay | Application cookie and pending cookie revoked; bound direct JWT denied by RLS immediately after registry revocation, subject to in-flight requests |
| Session policy | Idle for >15 minutes denies; active requests update only last-seen; creation >8 hours denies even if last-seen is fresh; token expiry may deny earlier. Actual waiting in staging proves real timing; SQL fixture clock manipulation alone does not |
| Role removal / provider revocation | New and existing requests deny appropriately; verify provider JWT expiry and Auth `getUser` behavior rather than assuming it |
| Draft image | Upload goes to private bucket; anonymous gateway and optimizer deny before publication; authorized preview works; hidden project/draft remain private |
| Published image | Visible publication enables public page/image in RO/RU/EN; saving another draft leaves it available; withdrawing reference denies new gateway requests while preserving original |
| Private attachments | Valid role/AAL2 can download only an existing enquiry-associated file; wrong IDs, mismatched enquiry/file pairs, traversal and unauthenticated requests fail; headers prevent inline execution/cache |
| Failed/conflicting publication | Existing visible content unchanged and new unpublished image bytes remain private |
| Backup and recovery | PostgreSQL and both private buckets backed up separately; restore synthetic data into a second approved empty project; compare synthetic records/files/roles and prove copied sessions unusable |
| MFA recovery | Execute the separately approved synthetic rehearsal in `mfa-recovery.md`; never disable MFA or grant password-only data access |

A real direct-read harness must use Supabase-issued access tokens, not `set_config`-injected claims. It must exercise the registered and revoked token pair; offline PGlite results cannot be copied into this table as live results. A harness that creates temporary registry rows is an external staging mutation and needs approval, synthetic account isolation and cleanup of only its own fixtures. No such harness has been run here.

## Evidence, cleanup and stop conditions

Stop on a project-reference mismatch, production-looking data, credential/log exposure, unexpected privileges, missing MFA or inconsistent recovery evidence. Do not auto-correct by relaxing policies. Preserve non-sensitive diagnostics and obtain a reviewed fix. Approve targeted synthetic fixture cleanup separately; do not delete an entire project or bucket as automatic cleanup.

Publish a pass/fail/unrun report with versions, roles, statuses and sanitized case references. Keep QR/seed/token/password material out of browser artifacts and GitHub. Real tests, provider configuration, encrypted off-host backup restoration and human recovery rehearsal remain **UNRUN** until documented evidence exists. Once this project and external actions are approved and securely configured, continue these checks; no claim of live integration success is made by this PR.
