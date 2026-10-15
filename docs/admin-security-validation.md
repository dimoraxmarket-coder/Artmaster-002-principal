# Phase 2 — administrative security review and validation

## Scope and current status

Based on PR #2 / `feature/artmaster-security-foundation` at `5fca3825d50dfe8fe486e48b81c60e62bf4db825`. The foundation PR is preserved. This phase is a separate branch and review PR; it does not deploy, change Host.md/DNS, migrate an external service, reset a real factor, or use production customer data. No premium UI work is included.

No Supabase runtime bindings or credentials were available when this work began. Real Auth/TOTP, hosted PostgREST and hosted Storage validation has **not** run. Follow [the staging procedure](supabase-staging-validation.md) after external-service approval. Offline checks cannot establish hosted integration readiness.

## Administrative authorization inventory

| Surface | Required authorization |
| --- | --- |
| `/admin` administrative console | Current assigned role, valid application session, AAL2 in Supabase mode |
| `GET /api/admin/quotes` and `GET /api/admin/content` | Viewer or higher, same session/AAL2 guard |
| `GET /api/admin/quotes/:id/files/:fileId` | Viewer or higher; UUIDs must resolve to that enquiry's own attachment; private download headers and audit |
| `GET /api/admin/media/:name` | Viewer or higher; private, non-cacheable preview |
| `PATCH /api/admin/quotes/:id`, `POST /api/admin/media`, draft `PUT /api/admin/content` | Editor or higher, AAL2, origin validation; writes are validated and uploads bounded |
| Publish `PUT /api/admin/content`, `POST /api/admin/notifications/retry` | Admin, AAL2, origin validation |
| `POST /api/admin/login` | Password exchange or MFA verification; no data authorization before AAL2 |
| `POST /api/admin/mfa/enroll` | Assigned role plus live five-minute restricted enrollment cookie; never authorizes data APIs |
| `POST /api/admin/logout` | Same-origin request; revokes full and restricted sessions; may run without AAL2 to cancel setup |
| `GET /api/media/:name` | Public only for an image referenced by current visible **published** content; never an admin-authentication exception |
| Public forms and website content | Remain public with existing origin, validation, anti-abuse and upload protections |

CMS writes now authenticate before parsing the request body. Role checks still apply after MFA; a viewer cannot edit and an editor cannot publish. All current data handlers are exercised by unauthorized/MFA regression checks; new administrative handlers must use the same guard.

## Session policy and token handling

- Idle: **15 minutes** since the last successful protected application request. Typing without server requests does not renew a session. Existing dirty-content protection/download-copy UI remains available; automatic heartbeat renewal is not introduced.
- Absolute: **8 hours** since full administrative authentication. Touching a session changes only `last_seen_at`; it cannot renew creation or expiry time.
- Supabase access-token expiry can end access earlier, commonly after one hour. This phase does not implement refresh or silently prolong tokens. Re-authentication and TOTP are required again.
- Restricted MFA sessions keep their existing five-minute, single-use lifetime. They cannot touch a full administrative session or authorize direct reads.
- SQLite stores additive creation/activity timestamps; unknown-age legacy sessions have timestamp zero and must log in again. Customer records and attachments are unchanged.
- Supabase uses a service-only atomic `touch_admin_session` RPC. Its predicate includes user, hashed cookie ID, Auth `session_id`, purpose, expiry, absolute age and idle age. Expired or revoked rows cannot be revived by a racing request.
- Protected direct SQL/Storage reads now also require a matching live application session bound to the Auth-signed JWT `session_id`. Possession of an AAL2 token alone is insufficient. Direct reads do not extend idle time. Existing sessions without this new binding must reauthenticate; they are not deleted by the migration.
- Access JWT claims are read only after the exact token is checked with Supabase Auth. Normal session cookies no longer retain the unused refresh token. Restricted setup cookies retain the refresh material required by the official Auth client; AES-GCM, HttpOnly, SameSite and production Secure flags remain in force.
- Logout revokes the application registry and asks Auth to sign out. The new RLS gate closes the previous application-logout/direct-JWT gap. Provider JWTs can still exist until expiry and may access resources outside these policies; provider configuration and factor reset behavior require staging verification.
- Service-role credentials remain server-side. They bypass RLS, so every administrative server entry point must keep authorization. Public server workflows use service credentials only for their existing validated operations and published-image delivery. Never import server storage/auth modules into client components; client imports are types only.
- Local SQLite administration remains password-only isolated development, not MFA. Production-mode local smoke tests now require both explicit local configuration and a loopback `SITE_URL`; a public origin cannot activate this exception.

## Draft image confidentiality

NEW Supabase uploads use the private `portfolio-private` bucket. SQLite originals remain in the private media directory. Uploads return a stable `/api/media/<UUID>.webp` reference; the editor previews it through `/api/admin/media/<UUID>.webp`, using existing cookies and no signed/public URL.

The public media gateway reads only images referenced by current published services/equipment or a project with `published=true`. Uploading, saving a draft, publishing a hidden project, and failed/conflicting publication do not expose image bytes. A database/provider failure fails closed. The storage bucket has a restrictive server-only policy even if a broad permissive client policy exists.

Publication makes the image public through the application gateway without copying it to a public bucket; the database's existing atomic content/version update is the publication boundary. Unpublishing does not delete the original. Gateway and preview responses use `no-store`. Once legitimately published, copies, browser/proxy caches and the Next image optimizer may retain bytes: withdrawal is not a promise of retroactive secrecy.

Existing `portfolio` public-bucket URLs are preserved to avoid breaking existing website content. Any previously uploaded public object may already have been downloaded, including unpublished legacy images. Reclassifying/removing those objects requires a separately approved inventory/migration; this phase does not change their bucket or delete objects. Existing repository public assets remain public.

## Recovery and backup

[MFA recovery](mfa-recovery.md) uses identity verification, dual authorization, application/provider revocation, quarantine and restricted re-enrollment. No password-only data bypass, factor-reset endpoint, universal recovery account or support backdoor is added.

The Phase 1 backup procedure is retained and revalidated with new session fields and published private-media references. Restoration into a fresh temporary directory preserves a synthetic enquiry, its attachment, CMS, uploaded media and account, while invalidating copied sessions. It does not change source records/sessions. Backup traversal now rejects symlinked parents before reading manifest-selected files. Offline tests also reject corruption, incomplete manifests and overwrites. Checksums require trusted backup storage; encrypted off-host custody, retention and an actual Supabase/PostgreSQL+Storage restore are operator prerequisites, not proven by SQLite tests.

## Migration order and rollout limits

Apply `202610130001_artmaster.sql`, `202610150001_admin_mfa.sql`, then `202610150002_admin_validation.sql`, in that order, to an approved synthetic staging project before starting this branch against it. The new migration adds session fields/RPCs/restrictive policies and a new private bucket. It preserves customer rows, roles and legacy public/private objects. It is not automatically executed by this PR.

Staging must verify server-only RPC grants and helper ownership/search path, real JWT/session IDs, reverse-proxy IP and TLS handling, real role/factor revocation, concurrent expiry/revocation, media delivery through Next and provider sign-out. Tests of locally injected JWT claims prove SQL policy logic, not Supabase's token verification. Human identity recovery, account-owner verification, malware scanning, log retention, secret rotation, rate-limit capacity and disaster recovery require separate operational validation. Do not treat this change as a production security certification.
