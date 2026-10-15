# Phase 2 offline validation — 15 October 2026

Base: security foundation `5fca3825d50dfe8fe486e48b81c60e62bf4db825` (PR #2 remains open and unchanged).
Branch: `feature/artmaster-admin-security-validation`.
Runtime: Node.js 24.19.0, npm 11.9.0, Chromium 154.

| Check | Observed outcome |
| --- | --- |
| Lint | Passed |
| TypeScript | Passed |
| Backend/security/SQL suite | 50 passed, 0 failed, 0 skipped |
| Local production build | Passed, with `ARTMASTER_STORAGE=local` and explicit loopback-smoke configuration |
| Build secret-boundary check | Non-secret synthetic service-key marker absent from `.next/static`; no real key used |
| Full Playwright suite | 58 passed, 0 failed, 0 skipped; 3.2 minutes; fresh temporary storage |
| Synthetic backup/restore | Passed in backend suite, including actual CLI, private media references, session invalidation and source preservation |
| Whitespace/conflict checks | `git diff --check` passed |

The browser administration test exercises private upload, unauthenticated preview denial, public gateway and Next image-optimizer denial before publication, publication, then actual image loading on RO/RU/EN portfolio pages. Existing contact forms, private attachments, role restrictions, logout, CMS version conflicts, responsive pages and accessibility checks all passed. The optimizer's logged prepublication 404 is an intentional negative test, not a broken published image.

Offline MFA tests use the maintained Supabase client with an in-process synthetic HTTP fixture. They cover all current protected data handlers (including new previews), missing MFA, incorrect roles, wrong codes, expiration, revoked sessions, Auth/session mismatch, registry failure and early rejection of unauthenticated malformed CMS writes. Private-media transport checks assert that new uploads use only the private bucket and public requests do not download draft bytes. No real provider credentials or network Auth/Storage operations are used.

PGlite executes all three migrations with real PostgreSQL RLS. Tests cover AAL1/absent/invalid claims, live Auth-session binding, missing/expired/revoked/pending/unbound sessions, removed roles, server-only session-touch grants, non-renewable idle/absolute expiry and server-only new-image storage despite broad permissive fixture policies. Public portfolio behavior and existing role restrictions remain available. These are policy/SQL tests with stubbed Supabase prerequisites, not hosted JWT verification or a distributed concurrency/load test.

Existing `.data` and earlier `.data/e2e` row counts remained unchanged. Restoration and browser tests used synthetic temporary directories exclusively. No production database, service configuration, DNS, deployment, factor reset or customer backup was accessed or changed.

**Real Supabase staging: UNRUN / NOT PROVISIONED.** Runtime and ignored-local-file checks found the project URL, Auth/service credentials and signing secrets unset or empty. No live enrollment, authenticator scan, challenge, provider logout, hosted SQL/Storage access, off-host restoration or operational recovery rehearsal is claimed. Exact secure setup and acceptance requirements are in [supabase-staging-validation.md](supabase-staging-validation.md), with recovery in [mfa-recovery.md](mfa-recovery.md). External-service actions require separate owner approval and securely supplied staging configuration.

Remaining limits include legacy public media, caches of previously published images, provider token expiry before the absolute deadline, credentials with service-role RLS bypass, and in-flight operations already authorized before revocation. The build marker check is evidence for that build, not a universal guarantee against future client-secret leakage. See [the security review](admin-security-validation.md) for rollout and operational requirements.
