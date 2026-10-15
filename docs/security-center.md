# Phase 5 — Advanced Security Center

Verified base: PR #5, `feature/artmaster-crm-media` at `8d955e97fe81d15049cdbd35527d45d72412cebe`, checked against GitHub and the remote before creating `feature/artmaster-security-center`. PRs #2–#5 are preserved. No deployment, DNS, Host.md, external Supabase configuration or production data changes are included.

## Initial inventory and implementation order

The existing registry stored local hashed sessions and Supabase application sessions bound to verified Auth JWT session IDs. Both modes already enforced 15-minute idle / 8-hour absolute limits; Supabase required AAL2 for every assigned role. The Security Center displayed account/policy information and logout, while session/audit controls were disabled. Team directory and role rows existed; there were no role/status management APIs, fresh-login marker or last-admin transaction.

Implementation proceeded through session metadata and revocation, security audit reads/integrity, serialized team changes, then UI and regression tests. The existing official Supabase Auth client remains the authentication library. No dependencies, second backend or alternative MFA mechanism were introduced.

## Functional endpoints and permissions

| Endpoint | Authorization and behavior |
| --- | --- |
| `GET /api/admin/security/sessions?owner=&page=1&pageSize=10` | All assigned roles may inspect their own active ARTMASTER sessions; only admins may inspect another managed account. Real creation, activity, effective expiry and absolute cutoff. Maximum 50 rows per page. |
| `DELETE /api/admin/security/sessions` | Valid live session plus a login completed in the previous five minutes. `{reference,confirm:true}` revokes one other session; `{owner?,allOthers:true,confirm:true}` revokes the account's other sessions. Other accounts require admin. Current session is protected; use existing logout to end it. |
| `GET /api/admin/security/accounts?q=&page=1&pageSize=10` | Active directory for viewers/editors; admins also see disabled accounts. Minimal ID, email, role, enabled flag and compare-and-swap version. |
| `PATCH /api/admin/security/accounts/:id` | Admin, fresh login, explicit confirmation and expected account version. Set viewer/editor/admin and enabled/disabled status. Blocks self changes, invalid/no-op changes, stale edits and removal of the last enabled administrator. |
| `GET /api/admin/security/audit?action=all&actor=&from=&to=&page=1&pageSize=10` | Administrators only, verified live session. Paginated allowlisted security events. Exact action/actor and UTC timestamp filters; validated bounds and normalized timestamps. |
| `GET /api/admin/security/mfa` | Current account only. Server-verified AAL, real verified TOTP-factor count from Auth when available, authentication mode and fresh-login deadline. Local mode returns an explicit unavailable MFA count, never a fictional verified factor. |

All reads are private/no-store. All mutations retain same-origin protection, bounded strict JSON schemas and mandatory Supabase AAL2. Sensitive operations re-read the actor's actual role, enabled state, account version and live session binding **inside the database transaction**, rather than trusting a role supplied by the client or an earlier page render. Backend authorization remains authoritative when an already-open UI becomes stale.

### Session references and expiration

Returned `reference` values are independent random management handles. They are not authentication SIDs, Auth session IDs, cookie contents, bearer tokens or secret hashes and cannot authenticate. No device/IP/geolocation labels are inferred. The UI labels actual application sessions without pretending to identify hardware.

Only full, unexpired administrative sessions are listed; restricted five-minute MFA logins do not grant data access and are excluded. Bulk revocation and account changes also revoke pending MFA sessions. Supabase single-session revocation removes registry rows sharing the target Auth session binding, preventing a linked pending session from recreating access.

Effective expiry is the earliest provider/app expiration, absolute cutoff and idle deadline. Activity can advance the idle deadline but never the absolute cutoff. Inspection of the current session counts as authenticated activity, as before. Data is a server snapshot, not a client promise of remaining lifetime.

Revocation controls ARTMASTER application sessions and the existing live-session RLS gate. It does not claim to sign the account out of every independent Supabase application. Provider refresh-session revocation during incident recovery still requires an authorized provider operator. Already-authorized non-security requests may finish during revocation; the new security mutations serialize and recheck authorization at commit. A hard stop across all in-flight work requires separately approved incident/maintenance controls.

### Fresh verification and MFA promotion

Security mutations require a login completed within **five minutes**. In Supabase mode, the marker is written only after password login, TOTP challenge/verification, exact-token Auth validation and AAL2 verification. Legacy sessions retain ordinary authorized access but have no fresh marker until the next complete login. Local development uses its existing explicit password authentication and remains restricted from public production by the existing configuration guard.

The interface disables sensitive controls after the deadline and offers **Reautentifică-te**, which ends the current session and uses the existing complete sign-in flow. There is no password-only step-up in Supabase mode, extra refresh cookie, dummy token or custom factor reset.

`complete_admin_mfa` atomically consumes the pending registry row and creates its full successor under the same PostgreSQL lock used by revocation and team changes. This closes the previous delete/insert gap: revocation cannot be followed by promotion from an already-consumed pending login. Logout also uses the cryptographically protected Auth session binding, so it catches a successor promoted concurrently before logout acquired the lock. Pending replay, stale account generations and mismatched Auth session bindings fail closed.

### Team safety and session revocation

`enabled` and monotonic `version` fields are additive. Existing accounts start enabled at version 0. Every role/status change increments the version, removes all full/pending sessions for the target, and appends its audit event atomically. Re-enabling an account cannot revive old cookies. Authentication, session touch, RLS and pending enrollment check enabled status and matching account/session generations. A stale in-flight login insertion is rejected by the database trigger.

PostgreSQL uses one transaction advisory lock for team mutations, session insertion/promotion, revocation and logout. SQLite uses synchronous `BEGIN IMMEDIATE` transactions. A request authorized before another admin demotes its actor fails the authorization recheck afterward. The last enabled administrator count is checked under the same lock. Self changes are forbidden even when another admin exists, so another freshly authenticated administrator must approve the change through their own account.

The service role no longer has direct UPDATE/DELETE/TRUNCATE grants on `admin_roles`; management goes through the bounded, session-bound routine. Supported account creation through the existing owner/bootstrap tooling remains available. There is no account-deletion UI or customer-data deletion.

## Audit privacy and integrity

The UI/API projects only these real events: confirmed/failed login, logout, MFA enrollment initiation/refusal, session revocation and team access changes. Failed credential submissions are recorded without the supplied email, password or browser context; an unconfirmed identity is labeled accordingly. The existing login rate limits bound these attempts. MFA enrollment seeds/QRs, codes, tokens, cookies and hashes are never included.

Security events retain stable actor/account UUIDs and timestamps. Display labels are resolved from the current directory, so account email edits performed by an external owner can change the display label without rewriting an event. Context is limited to previous/new roles, enabled status, revocation count and scope. General CRM/media audit targets and private request text are excluded from the security view. Unknown context keys and arbitrary targets are not reflected.

SQLite rejects audit UPDATE/DELETE through append-only triggers. The Supabase application service may SELECT/INSERT audit but cannot UPDATE/DELETE/TRUNCATE it; anonymous clients cannot read it and authenticated reads retain existing administrator/AAL2/live-session RLS. No audit-edit/purge API exists. Database owners, filesystem owners and independently privileged provider operators remain trusted boundaries; this is not a cryptographically immutable external ledger. External archival/retention, monitoring and tamper-evident collection require a separately approved service and operational design.

## Additive schema and rollout

Review [`202610150004_security_center.sql`](../supabase/migrations/202610150004_security_center.sql) after the foundation, MFA, validation and business-workflow migrations from the earlier PRs. It adds account status/version, management references, fresh verification/session generation and audit context/indexes. Existing customer records, quote files, media bytes, drafts, publications and published URLs are not rewritten or deleted.

The migration adds service-only session/team/audit RPCs, replaces live-session helpers with enabled/generation checks, and tightens existing CRM/content/media RPC actor checks. MFA promotion/logout are updated together with the application code. **Apply the reviewed migration before enabling the new server code**, using a coordinated, approved maintenance/rollout procedure. Missing columns/RPCs fail closed, without a local-mode fallback. Older application code must not be rolled back independently while expecting removed service table mutation privileges; retain the migration and use a reviewed compatible application rollback. Do not drop the new audit/account fields to roll back.

Before any approved rollout, take a consistent database **and file/Storage** backup, verify an isolated restore, apply all migrations to synthetic staging, and execute the staging matrix below. Existing local backup/restore tests now cover disabled status, account version, security audit and revocation of copied sessions as well as the earlier CRM/media data. PostgreSQL/Storage operational backups still require hosted rehearsal. No operational data, secrets or backups are committed.

## Required hosted staging configuration and validation

**Hosted Supabase remains unvalidated.** Local PostgreSQL/PGlite and deterministic official-client HTTP fixtures do not verify GoTrue, PostgREST, SMTP, real TOTP, multi-connection lock scheduling or hosted Storage.

Reuse the separate synthetic-only project and environment requirements in [admin-security-validation.md](admin-security-validation.md): `ARTMASTER_STORAGE=supabase`, staging `SUPABASE_URL`, server-only anon/service-role bindings, `ARTMASTER_SESSION_SECRET` and `ARTMASTER_FORM_SECRET`, plus the HTTPS staging `SITE_URL`. Supply secret values through environment settings, never chat/Git. Retain the approved private buckets and existing published-URL compatibility. Apply all five migrations with the migration owner after review, in this order: `202610130001_artmaster.sql`, `202610150001_admin_mfa.sql`, `202610150002_admin_validation.sql`, `202610150003_business_workflows.sql`, `202610150004_security_center.sql`. Create at least two independently controlled synthetic administrators plus editor/viewer accounts; complete actual TOTP enrollment and verification.

Required acceptance before approving hosted rollout:

1. Real login/enrollment/challenge for every role; current factor count matches Auth; no administrative session before verified AAL2. Verify provider MFA verification retains the expected Auth session binding.
2. Inspect multiple real application sessions, time/expiry behavior, current-session protection, own-only revocation, administrator managed-account revocation, and denial after replaying revoked cookies or direct signed JWTs through database/Storage clients.
3. Race real MFA completion against single/bulk revocation, logout and role/status changes using multiple connections. A consumed/revoked pending login must not recreate access. Confirm generation checks, lock behavior, transaction failure rollback and provider error handling.
4. After five minutes, reads continue only while the normal session is valid, and security mutations reject without a new complete password/TOTP sign-in. Legacy fresh-marker-null sessions must not authorize mutations.
5. Viewer/editor cannot manage team privileges or audit. Verify invalid/stale/self changes, last-enabled-admin protection, concurrent cross-demotion, account disable and re-enable without revival of old full/pending sessions. CRM assignment excludes disabled accounts.
6. Audit pagination/action/actor/time filters, accurate actor/target context, absence of secrets/customer text, protected reads, and inability of authenticated clients or the application service to rewrite/truncate audit. Verify RPC/helper grants and RLS after all five migrations.
7. Restore database and private Storage into a second isolated environment; verify disabled accounts, account generations, audit, CRM/media/content records and revocation of restored sessions. Rehearse [owner-controlled recovery](mfa-recovery.md) with dual approval and actual provider-owner MFA.

Provisioning, credentials, provider-owner operations, invitations and hosted migrations require separate approval. No real staging or external configuration was invented or executed in this coding phase.

## Explicitly deferred

- **Invitations:** the UI is disabled and no invitation endpoint is exposed. Safe implementation requires approved Auth/SMTP configuration, strict redirect allowlisting, fresh AAL2 authorization, durable invitation state/audit and real delivery/acceptance tests. Existing owner/bootstrap tooling is not presented as a self-service invitation system.
- **MFA recovery execution:** only the owner-controlled runbook and explanatory UI are provided. No password-only reset, emergency password, factor-unenrollment API or fabricated recovery codes were added.
- **Provider-wide sessions / team-factor inventory:** the UI manages ARTMASTER registry sessions and reports the current user's verified factors. It does not invent hardware labels or other users' factor statuses.
- External audit archival/alerting and operational retention remain an approved infrastructure task. Existing portfolio/content historical rollback and full-site protected previews remain outside this security phase.

## Changed areas and evidence

| Area | Files |
| --- | --- |
| Authentication / transaction-bound controls | `src/lib/server/auth.ts`, `security.ts`, `security-types.ts`, `local.ts`, `crm.ts` |
| APIs | `src/app/api/admin/security/**`, safe failed-login audit in `api/admin/login/route.ts` |
| PostgreSQL | `supabase/migrations/202610150004_security_center.sql` |
| Premium interface | `src/app/admin/security-center.tsx`, `modules.tsx`, `ui.tsx`, `api.ts`, scoped `admin.module.css` |
| Regressions | `security-center.test.ts`, `security-postgres.test.ts`, `mfa.test.ts`, `backup.test.ts`, `security-center.e2e.ts`, updated existing `admin.e2e.ts` |

See [validation and desktop/mobile screenshots](security-center-validation.md) for executed checks. The existing public UI and the earlier CRM/Media/CMS workflows are preserved.
