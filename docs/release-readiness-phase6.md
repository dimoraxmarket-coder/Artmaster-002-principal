# ARTMASTER release readiness after Phase 6

This is a review checklist, **not deployment authorization**. No production deployment, DNS change, Host.md edit or merge was performed. Keep the old Host.md website untouched.

## Integrate and review the stacked changes

- [ ] Record current base/head SHAs and review PR #2 → #3 → #4 → #5 → #6 → Phase 6 in order. Phase 6 starts at PR #6 `c023f807be7a9a2abde7cec85fe9a1a8a346d1f2`; verify remote heads again before integration.
- [ ] Choose a reviewed integration branch and merge/rebase strategy. Do not merge children independently onto an incompatible base, drop parent security changes, force-push other contributors' work, or automatically merge PRs.
- [ ] Resolve conflicts on integration branches, re-review security-sensitive resolutions, then rerun lint/types/backend/PostgreSQL/browser/build against the **combined final commit**, including public RO/RU/EN workflows.
- [ ] Review dependencies, image/public URL compatibility, content-schema compatibility, additive migrations, immutable-history capacity, audit grants, CSP framing exception and application errors. Confirm no secrets/data/backups in source, build or screenshots.
- [ ] Record scope honestly: partners, hero/About images, social links, multi-image galleries and some layout/legal/SEO copy still need dedicated management. Obtain owner review of translations, real images, branding, technical claims and legal text.

## Real Supabase staging — mandatory and still outstanding

- [ ] Approve/provision a separate staging project/origin, configure server-only secrets securely, and use synthetic accounts/documents/media only. Follow the exact prior-phase staging and MFA runbooks.
- [ ] Apply ordered migrations through `202610150005_content_studio.sql`. Record schema/grants/policies, migration logs and imported baseline counts; compare a staging backup before/after.
- [ ] Complete real password → enrollment → TOTP challenge → AAL2 login → logout; wrong/replayed codes; all roles; actual provider/token revocation; app-session revocation; role-generation changes; idle/absolute expiration; last-admin protection and owner-controlled recovery. No password-only reset/bypass.
- [ ] Test anon/AAL1/revoked/disabled users directly against PostgREST and both private storage buckets. Confirm client roles cannot write/read history or call service RPCs; history UPDATE/DELETE/TRUNCATE and audit tampering fail.
- [ ] Test content save/publish, immutable snapshots, restored new drafts, actor/timestamps, CAS conflicts, quota aborts, missing/archived media and private previews with real PostgREST/storage. Verify public published URLs and hidden-project confidentiality.
- [ ] Verify protected preview HTML, RSC, errors, redirects and images with actual hosting/CDN caches. No public tokens, indexing or optimizer caching of authenticated media; cross-origin framing denied, same-origin preview allowed. Verify proxy/host headers cannot override no-store.
- [ ] Keep evidence from **actual hosted runs**, with secrets/customer data redacted. HTTP fixtures and PGlite are offline checks only. Do not reuse the loopback-only bootstrap E2E suite on hosted systems.

## Data, backups and recovery

- [ ] Inventory current SQLite paths, attachments, media, Supabase buckets, configuration, CMS state and history size/count with an authorized operator. Do not copy customer content into Git, screenshots or developer fixtures.
- [ ] Decide the supported production provider and migration plan. Preserve all records/files/history and published URLs; never point a test run at live storage.
- [ ] Take an authorized encrypted/restricted backup with checksums, consistent database/object inventory, retention, location and operator record. Follow the existing paused-write procedure for local filesystem backups.
- [ ] Restore to a separate empty destination; verify content versions, sources, published/draft distinction, private object availability, CRM, attachments, permissions, audit and copied-session revocation. Test application-level content restore separately from disaster recovery. Never overwrite the source.
- [ ] Rehearse Supabase database + object-storage recovery, account quarantine and owner-controlled MFA recovery with two-person verification. Record recovery time/data-loss objectives and responsible operators. Offline SQLite verification does not certify hosted backup recovery.
- [ ] Review 10,000-version/512-MiB/2-MiB snapshot limits and monitoring. No automatic history purge exists; plan capacity expansion before limits stop writes. Do not silently delete history to restore capacity.

## Hosting compatibility and security

- [ ] Use supported Node.js >=24 / Next.js server runtime, not static export or a PHP-only host. API routes, crypto, image processing and proxy headers must work. No second PHP backend.
- [ ] Preserve production Supabase storage mode and secret separation. Local-production mode remains guarded to explicit loopback smoke testing; never bypass it for public production. If staging needs public hosting, use its real Supabase provider.
- [ ] Verify HTTPS, trusted reverse-proxy identity configuration, secure SameSite cookies, nonce CSP, no-store on protected routes, live-session checks, restrictive RLS, rate limits, request sizes and log redaction. Ensure server-only code/service credentials are absent from client bundles.
- [ ] Check Sharp native support, memory/build resources, request/body limits, image/attachment upload/download limits, outbound Supabase/email configuration, timeout behavior and connection pooling. Preview viewport framing must work only on its dedicated routes.
- [ ] For local development/backup tooling use private persistent storage with permissions/WAL support. Never rely on ephemeral serverless disks for authoritative SQLite/files. Supabase staging uses private object storage for private media/attachments.
- [ ] Confirm no production analytics, notification delivery or customer integrations are activated by synthetic checks. Invitations and secure recovery remain explicit owner-controlled operational procedures.
- [ ] Recheck keyboard/screen reader navigation, focus, confirmations, error/loading states, mobile overflow, public quote submission and attachment privacy on supported browsers. Review actual screenshots and performance budgets; automated Axe results do not certify complete accessibility.

## Deployment gate — do not start without separate approval

- [ ] Obtain explicit owner approval of the integrated commit, staging evidence, backup/restore evidence, hosting plan, release scope, maintenance window and monitoring/rollback plan.
- [ ] Assign operators, verify reviewed migration order and backups, and define abort criteria. Database rollback must preserve additive history/data; avoid destructive down-migrations. An older binary may reject the new optional `copy` field because its schema is strict, and may not preserve new-history recording. Rehearse a forward-compatible rollback/roll-forward release; never delete content fields or immutable history to make an old binary run.
- [ ] Prepare a protected post-release smoke test, logs/alerts, session revocation/recovery contacts, public data consistency checks and a rollback drill. Record any remaining risks and who accepted them.
- [ ] Treat DNS, deployment and changes to external/production services as separate authorized actions. This phase authorizes none of them.

## Complete local/Windows distribution gate

- [ ] Review PR #7's final integration/packaged-copy results: each of the three real public forms in RO/RU/EN must reach CRM, including attachments, duplicates, persistence failures/retry, role checks and status/assignment/notes.
- [ ] Verify `PACKAGE-INFO.json` against the reviewed PR #7 source commit and the archive's SHA-256. Confirm no runtime `.env`, customer DB/files, session material, backups, dependencies/builds or unused legacy source archive are distributed.
- [ ] Extract into a new folder, install frozen dependencies, initialize empty isolated SQLite and create a local administrator with the existing hidden-password workflow. Confirm loopback-only listening and persistence without overwriting unrelated configuration/data.
- [ ] Run the owner's **native Windows** smoke test (Node >=24/npm, START/CREATE-ADMIN batch entry points, console shutdown, native dependencies, public/admin routes, form→CRM, CMS draft/preview/publication). Linux extraction and portable Node checks do not certify native Windows.
- [ ] Keep local SQLite password testing separate from required real Supabase AAL2 staging. Downloading or testing this package does not authorize any deployment, DNS change, production migration or merge.
