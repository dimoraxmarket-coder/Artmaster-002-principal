# Phase 3 — ARTMASTER administration cabinet

Base: PR #3, `feature/artmaster-admin-security-validation`, verified at `bf52ef7dec6a443df9e6312dcec39cc6af9a3756`. This phase uses `feature/artmaster-premium-admin` and targets the PR #3 branch. PRs #2/#3 are preserved; no merge, deployment, Host.md access, DNS change or external-service configuration is included.

## Visual and navigation architecture

The cabinet has an isolated charcoal/yellow design system, an ARTMASTER sidebar, a compact top bar and responsive content areas. It reuses the approved brand symbol and existing local fonts. Custom decorative icons are inline SVG; no new runtime dependencies, icon packages, chart libraries or external font services are introduced.

`/admin` remains the protected server entry point. Modules use hash navigation (`#overview`, `#inbox`, `#portfolio`, `#media`, `#content`, `#settings`, `#team`, `#security`); changing a hash does not grant access or add a public data route. The server still resolves the current actor through the existing MFA/session guard. Mobile navigation uses an inert background, a keyboard focus loop, Escape dismissal and focus restoration. Native request-detail dialogs preserve keyboard focus and Escape behavior. Reduced-motion preferences are honored.

All cabinet styling is scoped under the admin CSS module. Public CSS, public components, API handlers, authentication/storage implementations and SQL migrations are unchanged. The admin page passes only the existing verified actor, storage-mode label and non-secret session-policy durations to the client. Tokens, cookie contents, service credentials and session registry data are not exposed.

## Real functionality and explicit limits

| Module | Available now | Later backend work |
| --- | --- | --- |
| Dashboard | Real loaded request totals/status counts, newest submissions and working shortcuts | Global totals beyond the latest 200 requests; audit-based activity and richer analytics |
| Client Inbox | Search/filter/page the loaded requests; read message/contact/order details; private attachment download; authorized status changes; confirmed archive; existing notification retry | Server-side search/pagination, assignments, notes, client entities, outbound reply workflow and bulk actions |
| Portfolio Studio | Existing project create/edit, multilingual content, private upload, draft save and authorized publication | Advanced project workflow and richer asset relationships |
| Media Library | List images referenced by saved published/draft content; search; authorized private upload/preview; copy a canonical image address | Complete unreferenced-file inventory, folders, replacement and safe deletion; these controls are disabled |
| Content Studio | Existing services, equipment, articles and FAQ editor in RO/RU/EN | Content types or rich text not supported by the current schema |
| Website Settings | Existing company name, phone, e-mail, address, areas and WhatsApp fields | Settings not present in the existing content schema |
| Team | Current authenticated account and the actual role-permission matrix | Team directory, invitations, account editing and role changes; invitation is disabled |
| Security Center | Actual AAL2/local-auth state, current account/role, server-policy idle/absolute durations and real logout | Session listing/revocation, audit browsing and self-service recovery; explicitly disabled |

Statistics are calculated exclusively from `GET /api/admin/quotes`, whose existing limit is 200. The dashboard and inbox state this scope. Loading uses placeholders; failed loading displays unavailable values, not zero or invented growth. No demo clients, chart data, trends or fabricated audit events are included in application code. Dates use `Europe/Chisinau`.

The media view is based on authorized `GET /api/admin/content` and uploads made in the current tab. A new unassociated upload must be linked to content and saved as a draft to be rediscovered in the referenced-asset list. A module switch preserves this tab's upload list. The interface distinguishes new private media from pre-existing public resources; it does not claim legacy public images are confidential.

## Draft and security behavior

The existing CMS is loaded only when a studio is first opened. It stays mounted while switching modules, preserving unsaved text, language selection and version-conflict handling. Portfolio, content and settings share the same site-wide content/version transaction. Saving/publishing applies the shared editor state, not a separate per-module database. The existing confirmation, schema validation, role restrictions, conflict-copy export and before-unload protection remain. Logout asks before discarding unsaved editor work. Unsaved changes are held only in the current tab; durable drafts require the existing save action.

Uploads and previews continue through the protected media APIs. Unpublished media and private attachments retain their server authorization. The frontend never grants authorization based on its navigation or role presentation: all protected operations still depend on the unchanged PR #2/#3 controls. MFA enrollment/challenge retain their restricted server flow. Session timeout values are sourced from the existing server policy; there is no fabricated active-session count or remaining-time countdown.

The UI supports the current local development workflow and labels it honestly. It does not prove real Supabase TOTP, hosted RLS/Storage, session revocation or recovery integration. Phase 2's staging prerequisites and unrun checks still apply. The current UI does not add automatic session-renewal polling.

## Files

- `src/app/admin/admin.module.css`: scoped tokens, shell, responsive layouts, controls and existing-editor styling.
- `components.tsx`: shared actions, icons, statuses, notices, loading and empty-state components.
- `api.ts`: same-origin, uncached administrative requests and user-facing errors.
- `ui.tsx`: authentication/MFA presentation, workspace navigation and dashboard.
- `inbox.tsx`: request table, filters/pagination and authorized detail actions.
- `modules.tsx`: referenced media, current-account/team and Security Center presentation.
- `cms-editor.tsx`: small integration changes for module-specific sections and dirty-state notification.
- `page.tsx` / `layout.tsx`: protected server wiring and isolated styling.
- `tests/admin.e2e.ts`: updated existing workflows and new semantic/browser/accessibility checks.

## Screenshots and reproduction

The [screenshot index](screenshots/admin-phase3/README.md) contains actual browser captures of the cabinet. All account/request identifiers shown are synthetic `.invalid` fixtures in a fresh temporary SQLite directory. Passwords, session cookies, bearer tokens, QR seeds, customer databases and private attachment payloads are not included.

To regenerate screenshots on the current build with installed Chromium:

```bash
ARTMASTER_ALLOW_LOCAL_PRODUCTION=true npm run build
ARTMASTER_DATA_DIR="$(mktemp -d /tmp/artmaster-admin-review.XXXXXX)" \
ARTMASTER_ADMIN_SCREENSHOTS=1 CI=true npm run test:e2e -- tests/admin.e2e.ts
```

Use only a fresh synthetic directory and keep port 3100 free. Never run this fixture suite against production or a Supabase project. The tests preserve the application's Secure cookie flags; their loopback transport fixture is not application authentication code. Browser artifacts containing real credentials or TOTP enrollment must never be committed.
