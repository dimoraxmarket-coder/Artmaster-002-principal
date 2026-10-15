# Phase 1: data protection and mandatory administrative MFA

This change prepares code for review. It does not deploy, alter DNS, apply a migration to a real service, enroll actual administrators, or migrate customer data. Apply and verify it in a separate staging project before an approved production rollout.

## Storage and configuration inventory

| Resource | Location / dependency | Protection and preservation |
| --- | --- | --- |
| Local customer enquiries | `ARTMASTER_DATA_DIR/artmaster.sqlite`, default `.data/artmaster.sqlite`; `quotes` table | Includes enquiry JSON, notification state and idempotency keys. Never commit or replace with a test database. |
| Private attachments | `<data-dir>/uploads/<UUID>`; paths referenced by enquiry JSON | Authenticated download API only. Preserve together with the database. |
| Uploaded portfolio media | `<data-dir>/media/<UUID>.webp` | Public by URL; unpublished project images are not confidential. No deletion is introduced. |
| CMS | SQLite `content` table, `published`, `draft`, `version` | Preserve both states and the concurrency version. Repository defaults are a fallback, not a backup of saved CMS content. |
| Accounts and security | `admins`, hashed `sessions`, `meta`, `audit`, `rate_events` | Local password hashes and generated form/session secrets are sensitive. Backup excludes active sessions; keeps accounts, secrets and audit records. |
| SQLite runtime | `artmaster.sqlite-wal`, `artmaster.sqlite-shm` | Do not copy only the main file while writers run. Use SQLite's backup API. |
| Local configuration | ignored `.env.local` or injected variables | Not copied into the backup and never committed. Preserve bindings separately in a secure secrets manager. |
| Supabase | `SUPABASE_URL`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ARTMASTER_STORAGE=supabase` | PostgreSQL: roles, sessions, enquiries, CMS, audit and rate limits. Storage: private `quote-files`, public `portfolio`. Database backup alone does not cover object storage. |
| Signing/encryption | `ARTMASTER_FORM_SECRET`, `ARTMASTER_SESSION_SECRET` | Required server-side secrets in Supabase mode, minimum 32 characters; local mode generates private values in `meta`. Never print them. |
| Site and proxy | `SITE_URL`, `SITE_INDEXABLE`, `ARTMASTER_TRUST_PROXY`, `ARTMASTER_IP_HEADER` | Exact origin is used for CSRF checks. Trust IP headers only when the hosting proxy overwrites them. |
| Optional services | Resend sender/key/recipient variables; GA/GSC configuration | Not required for local storage. No real e-mail delivery or external authentication is claimed by offline tests. |

The onboarding instance had no customer records or administrator accounts in the main `.data` database. Existing synthetic browser fixtures were under `.data/e2e`. This is an observation of the development instance, not an inventory of production. No existing data was removed by Phase 1 setup. Restoration verification uses newly generated, non-sensitive temporary data exclusively.

## Backup: pause writes and preserve the source

1. Stop application processes, notification workers and any scripts that write to the same storage. Keep writers stopped until the backup finishes. `ARTMASTER_WRITES_PAUSED=true` is an operator acknowledgement, not an automatic lock across processes.
2. From the repository root, with the intended local storage configuration loaded:

   ```bash
   ARTMASTER_WRITES_PAUSED=true npm run backup
   ```

3. The command creates a **new** private `backups/<timestamp>` directory. It opens the source database read-only and uses Node 24's SQLite backup API, copies uploads and media, removes sessions from the copy, checks database integrity and attachment references, and writes a SHA-256 manifest last. The source database and source sessions are unchanged.
4. A failed backup is incomplete. Do not restore from it or resume assuming a recovery point exists. Diagnose the issue and create a new backup directory. No existing directory is overwritten or automatically deleted.
5. Transfer complete backups to access-controlled, encrypted storage outside the checkout/server. They contain personal data, password hashes and signing secrets. SHA-256 detects corruption, not malicious replacement of both files and manifest; trusted storage and encryption remain necessary.

Symlinks and special files inside the selected uploads/media trees are refused. Configuration files are deliberately excluded. Backups need adequate private disk space for the database snapshot and file copies.

## Restore: always into a new directory

Use an existing private parent directory and a target that does not yet exist:

```bash
ARTMASTER_BACKUP_DIR=/absolute/private/backup \
ARTMASTER_RESTORE_DIR=/absolute/private/new-restoration \
npm run restore
```

The CLI refuses the active data directory or its ancestors/descendants. Restoration verifies the manifest, file checksums, database integrity and attachment references before creating the target. Existing directories are never overwritten. Copied sessions are removed so restored accounts must log in again. Retain the original storage and backup unchanged.

Validate the restored copy in an isolated process with `ARTMASTER_DATA_DIR` pointing to the new directory; keep e-mail disabled and use a different port. Verify enquiries, private attachments, CMS draft/publication and media before considering a separately approved cutover. Do not replace live files or rename storage under running processes. Production restoration and retention decisions require owner approval.

`tests/backup.test.ts` exercises the actual helper and CLI with a synthetic enquiry, attachment, uploaded-media fixture, CMS content, account and session. It checks round-trip data, permissions, preserved source sessions, revoked copied sessions, corruption, missing manifests, symlinks and overwrite refusal. It never uses the existing `.data` directories. This does not constitute a tested production restore or Supabase recovery.

## Mandatory MFA in Supabase mode

The application uses maintained `@supabase/supabase-js` Auth MFA APIs, not a custom TOTP implementation.

- All administrative roles (`viewer`, `editor`, `admin`) must complete TOTP. The same requirement applies in development, test and production whenever `ARTMASTER_STORAGE=supabase`.
- Password login without a verified TOTP factor issues only an encrypted, HttpOnly, SameSite=Strict, five-minute MFA-enrollment cookie. No administrative cookie is granted.
- A user with a verified factor receives a similarly restricted challenge cookie. Enrollment and challenge sessions have purpose `mfa` in the server-only `admin_sessions` table.
- Before MFA, the only available administrative operations are login/verification, TOTP enrollment and logout. `/admin` displays the gate, not customer records or CMS. Public website endpoints retain their public behavior.
- Enrollment is available to every assigned role. The enrollment endpoint uses a valid restricted cookie, fresh Auth validation and a fresh role lookup; it does not require an already privileged session.
- `verifyAdminMfa` validates the resulting access token with Supabase Auth and explicitly requires its AAL2 claim before granting access. A pending session is atomically consumed once. Wrong codes, expired/revoked sessions, role removal and unavailable checks fail closed.
- Every protected admin API and `/admin` use the mandatory guard. AAL2 does not bypass the existing viewer/editor/admin authorization rules.
- Both full and restricted sessions are revocable through the application registry. Logout revokes their entries and asks Auth to sign out. Cookies remain Secure in production. No browser-visible access/refresh tokens or service-role credentials are introduced.
- Limits cover source IP, a hashed account identifier for password attempts, user enrollment and per-session code verification. The hosting proxy still needs correct configuration.

The additive `202610150001_admin_mfa.sql` migration adds the session-purpose column and restrictive AAL2 RLS policies for roles, enquiries, CMS and audit. They combine with existing team/role policies; clients cannot turn themselves into administrators. A restrictive Storage policy also prevents AAL1 access to private quote objects even if a permissive policy is added later. No permissive private-object policy is introduced. Public portfolio assets and server-side public form/content workflows remain available.

Apply the migration **before** running the new authentication code against a Supabase project. Old AAL1 application sessions will be denied and users must sign in again; no customer rows or objects are deleted. Test real PostgREST, Storage and Auth with a staging viewer/editor/admin after applying it. The application uses service-role access on the server, which bypasses RLS, so server-side MFA/role checks remain essential.

Supabase access JWTs can remain valid until expiry after Auth sign-out. App session revocation immediately blocks application APIs; direct AAL2 JWT access follows Supabase's token-expiry semantics. Do not expose bearer tokens, use suitable Auth expiry settings and verify provider session/revocation behavior in staging. This phase does not add per-user tenancy or change the existing team-wide visibility of enquiries.

## Local development MFA strategy

SQLite mode retains the existing local password authentication for isolated development with synthetic data. It is not represented as MFA and must not be used to host a public administrative production service. The existing explicit `ARTMASTER_ALLOW_LOCAL_PRODUCTION=true` option is for local build/E2E smoke tests only; it does not disable AAL2 checks in Supabase mode. No new skip-MFA setting or test-only production path exists.

To exercise real MFA on a developer machine, use a **separate development Supabase project**, apply both migrations, configure its own server-side credentials and random signing secrets securely, and assign synthetic viewer/editor/admin accounts. Enable TOTP in Auth, enroll each account through `/admin`, verify wrong/expired codes and blocked API/direct-database access before MFA, then verify role restrictions after MFA. Test logout/replay and role removal. Never use production credentials or customer records for these checks.

Offline regression tests use the actual Supabase client with a deterministic mocked HTTP transport; PostgreSQL RLS runs in PGlite with Supabase Auth/Storage prerequisites stubbed. They verify application decisions and SQL enforcement but cannot establish real TOTP issuance, QR scanning, provider JWT verification, delivery, distributed concurrency or production configuration. A real staging Auth/PostgREST/Storage test remains required before production rollout.

MFA recovery/reset is deliberately not exposed as an AAL1 bypass. A locked-out user requires a documented, identity-verified owner/provider procedure; revoke application sessions and provider refresh sessions during a controlled reset, then require enrollment again. Do not disable the guard, assign temporary non-MFA privileges, share TOTP seeds or create default accounts. Self-service recovery codes, factor replacement and a premium administration UI are outside this phase.

## Validation and remaining work

Run `npm run lint`, `npm run typecheck`, `npm test`, `ARTMASTER_ALLOW_LOCAL_PRODUCTION=true npm run build`, then `CI=true npm run test:e2e`. Keep port 3100 free; use synthetic isolated E2E storage, never production. The contact panel keeps its existing colors and slide motion, but no longer fades text through translucent low-contrast states over underlying content. The public layout is unchanged.

Before an approved production rollout: verify off-host encrypted backup and real restore, apply and test the migration in staging, validate real TOTP and provider settings, establish controlled account recovery, verify TLS/proxy headers and monitor security events. Existing portfolio draft-image visibility, attachment malware scanning, backup retention automation and session refresh/idle-timeout UX remain separate work. No premium UI redesign, deployment or DNS change is included.

Phase 2 extends these rules with idle/absolute expiry, session-bound direct RLS reads and confidential new media uploads. See [the current security review](admin-security-validation.md); historical Phase 1 validation does not validate the new hosted integration.
