# Phase 1 validation — 15 October 2026

Base: verified remote `website-variant-1`, `dec6067e50cede26ee872573d99badcdb35f5af7`.
Branch: `feature/artmaster-security-foundation`.
Runtime: Node.js 24.19.0, npm 11.9.0, Chromium 154.

| Check | Observed result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 41 passed, 0 failed, 0 skipped |
| `ARTMASTER_ALLOW_LOCAL_PRODUCTION=true npm run build` | Passed |
| Contact-panel accessibility test, repeated three times | 3 passed; each checks RO/RU/EN |
| Full `CI=true npm run test:e2e` with a fresh temporary `ARTMASTER_DATA_DIR` | 58 passed, 0 failed, no skips; 3.1 minutes |
| Synthetic backup + restore through helper and actual CLI | Passed within backend suite |
| `git diff --check` | Passed |

The original browser failure was caused by the contact panel fading through translucent low-contrast text states. Removing only its opacity transition retains existing colors, layout and slide motion. The initial color-only approach did not resolve it; final repeated accessibility checks and the complete suite passed with the transition fix. No assertion or accessibility rule was disabled.

Security tests cover every current protected admin data handler before MFA, all assigned roles, enrollment, wrong codes, rejection of an AAL1 verification result, account/challenge rate-limit decisions, expired or revoked pending sessions, replay after completion/logout, forged cookies, removed roles and Auth rejection. AAL2 guards are exercised in production and development, including with the local-smoke flag present. Role restrictions remain enforced after MFA.

PGlite executes the base migration and additive MFA migration using real PostgreSQL RLS. AAL1, absent and invalid claims return no protected administrative rows; AAL2 preserves team/role access. Private-object restrictions remain effective alongside a permissive test policy; public portfolio access is unaffected. Supabase-provided Auth/Storage prerequisites are stubbed.

Restoration checks round-trip a synthetic enquiry, attachment, media fixture, published CMS content, account and private signing secret. They confirm source sessions stay active, copied sessions are revoked, permissions are private, and corrupt/incomplete/symlinked backups and overwrites are refused. No existing database or customer files were used for restoration. Existing main and earlier E2E storage row counts were unchanged; browser validation used newly created temporary storage.

Not executed: real Supabase Auth/TOTP enrollment, QR scanning, provider JWT validation, PostgREST/Storage integration, off-host backup recovery, production migration or deployment. These require a separately configured staging project and approved operational procedures. The documented direct-JWT expiry, controlled MFA recovery, local password-development and public draft-media limitations remain in [security-foundation.md](security-foundation.md).

No deployment, DNS change, real-data overwrite, premium UI redesign or automatic merge is part of this work.
