# Phase 4 — CRM and Media Studio

Base: PR #4, `feature/artmaster-premium-admin` at `a3b0d6f8c2675b4ea7f6a29636e5f4bc91c421ab` (verified against GitHub and the Git remote before branching). This increment prioritizes CRM and Media Studio. PRs #2–#4 remain open and unchanged. No deployment, DNS, Host.md, hosted Supabase configuration or production data access is involved.

## Inventory and constraints

| Existing subsystem | Before this increment | Preserved constraints |
| --- | --- | --- |
| Quotes, SQLite / Supabase | Private JSON requests, statuses, idempotency, notification retries; last 200 rows only | Original message, details, files, notification fields and idempotency remain intact |
| Attachments | Local `uploads/` or private `quote-files` bucket | Authenticated download, record/file membership, audit, no-store, attachment disposition |
| Content | One published snapshot, one draft, shared compare-and-swap version | Editor drafts / administrator publication; RO/RU/EN schema, public routes unchanged |
| Media | Immutable sanitized UUID WebP files in local `media/` or `portfolio-private`; library derived from content | Canonical `/api/media/*.webp` publication gate, protected preview, legacy public URLs |
| Team / sessions | Local admins or Supabase Auth + `admin_roles`; session registry | All Supabase roles require verified AAL2 and live session, 15-minute idle / 8-hour absolute limits |
| Audit / backups | SQLite audit / Supabase audit_log; whole local database + uploads/media backup | No credentials or operational data in Git; tested restore revokes copied sessions |

Server-side modules still use the existing SQLite and official Supabase adapters. No new dependencies or authentication system were added. Supabase service credentials remain server-side. Missing migrations or unavailable services fail closed rather than falling back to local storage.

## Implemented behavior

### Client CRM

- `GET /api/admin/quotes?q=&status=all&assignee=all&page=1&pageSize=8`: bounded, validated search over name, email, phone, company, service and message. Literal search (including `%`/`_`); Unicode case folding. Status and all/unassigned/staff filters. Deterministic pagination (1–50 rows). Counts and global status totals come from the database, independent of page and filter. The dashboard loads five recent requests and global totals, replacing the former 200-row approximation.
- `GET /api/admin/quotes/:id?before=<event-id>`: fresh request details, assignment, version and activity. History pages contain up to 50 immutable events, newest first; older events load on demand.
- `PATCH /api/admin/quotes/:id`: editors/admins update status, assign an editor/admin or clear assignment, and append internal plain-text notes (1–4,000 characters). Viewer and revoked sessions cannot mutate. Assignment rejects missing staff or viewer roles.
- The interface supplies `expectedVersion` for every change. Conflicts return 409 without partially changing status, assignment, notes, version or audit. Unsaved note text survives errors, and closing a nonempty note asks for confirmation. Notes require a version. Legacy status-only callers can omit the version, retaining their explicitly requested atomic last-write behavior.
- Changes and their activity/audit entries commit in one transaction. Existing message JSON is patched only at the status field. Client payload hashes and idempotency keys are omitted from API responses.
- `GET /api/admin/team`: minimal directory (ID, email, role) for authorized viewers/editors/admins, with no password/session/Auth metadata. Directory presentation and request assignment work. Invitation and role editing remain disabled.

All administrative team members retain the existing team-wide ability to read requests, notes and attachments; assignment is a workflow label and does not grant or restrict access. A future per-client access model requires its own authorization/RLS design.

### Media Studio

- Persistent `media_assets` metadata survives navigation/restarts, including unassociated uploads. Server-side name/URL search and bounded pagination (1–40 assets). Cards show draft/published snapshot references and original size when known.
- Uploads validate and decode PNG/JPEG, strip metadata, resize/re-encode to immutable WebP and store privately, using the existing guards, upload quota and roles. The resulting canonical URL becomes public only when referenced by visible published content; saved hidden projects do not expose their originals.
- `POST /api/admin/media/replace`: editors/admins select a newly uploaded registered image and replace exact matching image fields in the saved draft, using the content version. Published content/bytes stay unchanged. The UI confirms the scope, then instructs the operator to reload the editor and review before publishing. A stale mounted editor cannot overwrite the replacement because content CAS remains enforced. A failed replacement retains the new private upload for later use.
- `DELETE /api/admin/media/:uuid.webp` with `{ "confirm": true }` means **archive inventory record**, administrator only. Every reference in both persisted draft and published snapshots blocks the action, including hidden projects. Confirmation is mandatory. Original bytes are retained, and protected administrative previews continue to require authorization. There is no physical-delete endpoint.
- Archive and content save acquire locks in the same order. An archived URL cannot be reintroduced through a stale form or a new content save. Replacement cannot race an archive into publishing an archived asset.
- Legacy public URLs are listed as read-only referenced assets and remain compatible. They are not moved, replaced in place or made private by this increment. Their historical public accessibility is unchanged; upload a new private original for confidential drafts.

Existing local UUID WebP files are discovered without modifying bytes and registered on inventory access (symlinks are excluded). The Supabase migration backfills `portfolio-private` object metadata, including unassociated originals. Old object dimensions may be unknown (0); this does not affect previews. After any failed hosted metadata insert or out-of-band upload, an operator should reconcile private objects with `media_assets` using the migration's idempotent insert query. No automatic object deletion is performed.

## Schema and rollout

Additive migration: [`202610150003_business_workflows.sql`](../supabase/migrations/202610150003_business_workflows.sql).

- Adds `quotes.version` (default 0), nullable `assigned_to`, supporting indexes, append-only `quote_events`, and `media_assets` metadata/archive fields.
- New tables have RLS enabled and **no grants or policies for anon/authenticated**. Client AAL2 tokens must still use protected APIs. Service-only RPCs handle pagination, atomic request changes, directory, inventory and archive.
- `save_site_content` keeps its existing role checks, version conflict, publication and audit behavior, adding a content-row lock and archived-image check. Old migrations are unchanged.
- SQLite performs additive schema initialization, never recreates or truncates existing tables. All old rows start at version 0 and have no assignee. Historical activity starts with this migration; no fictional events are generated.

Before any separately approved rollout: pause writes, take a consistent backup of the existing database **and files**, verify restore in an isolated directory, review/apply all migrations in order on synthetic staging, validate the staging matrix below, then plan the application rollout. Do not run a down migration that drops notes/inventory; retain the additive tables when reverting application code. No deployment is part of this PR.

## Staging configuration and required validation

Hosted Supabase tests have **not** run. Offline PGlite executes real PostgreSQL statements and permissions with synthetic Supabase prerequisites. The Auth/Storage HTTP fixture uses the official client with synthetic responses; it is not hosted integration validation.

Use the separate project and exact secret/environment setup in [the security validation guide](admin-security-validation.md). Never point this test environment at production. Apply migrations `202610130001`, `202610150001`, `202610150002`, then `202610150003` with the migration owner. Verify private `quote-files` / `portfolio-private` buckets; retain existing public `portfolio` compatibility. Add synthetic viewer/editor/admin accounts and role rows, and complete real TOTP enrollment for each.

With staging AAL1, missing/revoked/idle/absolute-expired sessions, confirm denial of the new list/detail/team/media/archive/replacement APIs. Repeat through direct database/Storage clients: new tables/RPCs must deny authenticated clients, and existing protected tables must still enforce verified AAL2 and live-session RLS. With valid AAL2, exercise:

1. More than 200 synthetic requests, multi-page search/filter, accurate dashboard totals, Unicode/literal wildcard search.
2. Editor/admin assignment, notes, status, two-writer stale version rejection; viewer mutation denial and invalid/viewer assignee denial.
3. Private attachment downloads, missing/wrong record membership, logout/replayed-cookie denial.
4. Upload and refresh unassociated inventory; metadata backfill on existing private objects; no public bytes before visible publication.
5. Draft replacement while old published bytes remain available; stale editor save rejection; hidden projects stay private.
6. Confirmed administrator archive only when no draft/published references exist; retained bytes; archived-reference save rejection; concurrent archive/save checks on actual multi-connection PostgreSQL.
7. Database **and Storage** backup/restore into a second isolated project, session revocation, notes/history/inventory/reference preservation. Local backup tests do not certify hosted backup coverage.

Provisioning/configuration and applying hosted migrations need separate approval and staging credentials in environment settings. None are fabricated or committed.

## Deferred work

- Security Center: other-session enumeration/revocation UI, security audit browser, team role mutation/invitations, factor-status refresh. Existing MFA gate, current account status, logout, session policy and audit writes remain operational. No password-only recovery or factor reset was added.
- Content: existing portfolio, RO/RU/EN editing, drafts/publication and business settings remain functional. Full protected website preview, historical version snapshots and rollback need a dedicated schema/authorization design.
- Media: folders, explicit archive restoration UI, per-reference replacement picker and physical garbage collection are not implemented. Archive retains storage usage. Large media libraries need operational capacity monitoring; local legacy discovery scans file names but decodes only unregistered files.
- CRM: no customer email sending, bulk operations, note editing/deletion or per-assignee access partition was added.

## Source map and evidence

| Area | Files |
| --- | --- |
| CRM API / persistence | `src/lib/server/crm.ts`, `workflow-types.ts`; `api/admin/quotes/**`, `api/admin/team/route.ts`; SQLite/Supabase adapters |
| Media persistence / safety | `src/lib/server/media-inventory.ts`, `media.ts`; `api/admin/media/**`; additive SQL migration |
| Admin UI | `inbox.tsx`, `media-studio.tsx`, `modules.tsx`, `ui.tsx`, `api.ts`, scoped `admin.module.css` |
| Regressions | `tests/workflows.test.ts`, `postgres.test.ts`, `mfa.test.ts`, `backup.test.ts`, `admin.e2e.ts` |

Screenshots and final validation results are recorded in [business-workflows-validation.md](business-workflows-validation.md). Screenshots contain only synthetic test data; test databases, sessions, attachments and backups stay outside Git.
