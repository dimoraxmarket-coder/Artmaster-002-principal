# Homepage banner and managed partners

> Integrare ulterioară: branch-ul `feature/artmaster-complete-integration` reunește acest PR cu PR #8. Vezi [versiunea completă](../VERSIUNEA-COMPLETA.md). Mențiunile de mai jos privind ramurile separate descriu livrarea istorică a PR #9.

Base: verified PR #7, `feature/artmaster-content-studio`, commit `c63ad4100bc014e440b056daf4b2a40e76e330c7`. Feature branch: `feature/artmaster-banner-partners`. PR #8 is separate and is not imported into this branch. No parent PR, live website, DNS or production data is changed.

## Delivery status — assets still pending

The original panoramic banner and partner screenshot are visible in the conversation. **Their binary files were not mounted or made downloadable in this execution workspace.** `/workspace`, its shared/library/download directories, `/tmp` and `/mnt` were checked. The existing `artmaster-machete.zip` contains only two older page mockups, not these uploads. No replacement was generated and no screenshot was reconstructed as a fake source image. The published/default hero is deliberately preserved until the exact original is imported.

The screenshot contains 16 thumbnails: 15 external brand candidates and ARTMASTER's own logo. The latter is excluded from partner imports. All 15 candidates remain unconfirmed drafts; no claimed customer relationship, downloaded official logo or usage license is invented. All attempted candidate domains returned **HTTP proxy tunnel 403 Forbidden**. A blocked request is not evidence that a domain is the official website. See [the source register](partner-source-register.md).

The software workflows are implemented; the final asset replacement and authentic-logo review are **not complete**. Screenshots with “synthetic-test” in their names explicitly show fixtures, not the owner's banner or real partners. Synthetic assets and accounts are generated only in isolated test storage and are not seeded into the Windows ZIP.

## Owner workflow

1. Open **Conținut → Banner Acasă**. Upload the original PNG/JPEG (maximum 5 MiB), or select a managed image with known dimensions in Media Studio. Optionally upload a separate mobile composition containing the same information. No image is cropped automatically. Enable the banner, fill accessible RO/RU/EN descriptions and save the draft.
2. Open the saved **private preview**, switch languages and desktop/mobile sizes. Check the telephone number, full composition and all five service highlights. Publish separately as an administrator. The banner is a complete image, with no overlaid/duplicated CTA or navigation. The existing structured title remains an accessible H1; other homepage sections, animations, header, contact controls, equipment photographs and forms are preserved.
3. Open **Conținut → Parteneri**. Import the screenshot candidates once or add a new record. Confirm spelling, actual company identity and the ARTMASTER relationship independently. Optional website links accept HTTPS, without embedded credentials, query secrets or fragments.
4. Upload/choose an authorized logo; record provenance, source URL and permission. Official permission requires an HTTPS source. Owner permission requires a recorded explanation. Changing an image clears its permission/provenance and returns the entry to draft. This also applies to bulk replacement in Media Studio.
5. Use Up/Down to order records. Select draft, published, hidden or archived; save, preview and then explicitly publish the whole document. Publishing one version includes other saved content changes: review the common history first. Editors save drafts; only admins publish. Viewers are read only.
6. Names can be published as text after identity/relationship confirmation, without a logo. Unconfirmed candidates are shown only in authenticated review previews. Hidden/archived entries are omitted from both public and preview galleries. Archiving preserves the record, files, history and references. To detach an asset, choose “Folosește doar numele”; current references block archival of the file.
7. Restore old versions through existing history. Restoration creates a new draft, verifies referenced assets and never silently republishes.

## Rendering, optimization and privacy

- Native responsive `<picture>` uses exact intrinsic desktop/mobile dimensions, `height:auto` and `object-fit:contain`. No fixed-height/cropped cover treatment, gradients or competing text are applied to a configured banner. Full panorama is the fallback on every device. Browser pinch zoom remains available; a supplied mobile composition can improve small-screen text size.
- Eager/high-priority banner loading reserves intrinsic space. Saved media is WebP, maximum 2400 × 2400 inside bounds, without enlargement. The supplied 1944 × 809 composition would retain those dimensions. PNG/JPEG originals uploaded through the new banner/partner controls use a validated `artwork` purpose: they are decoded, auto-oriented, metadata stripped and encoded **losslessly** to preserve text, colors and transparency; files exceeding the 5 MiB output cap are rejected. AVIF is not used for this workflow because lossless WebP avoids text ringing and format-specific authenticated derivatives. Ordinary Media Studio/CMS photo uploads retain their existing WebP quality-85 behavior and size limits; selecting an already encoded library asset does not recover its original pixels. Use the banner/partner upload controls for lossless artwork. Actual owner-banner bytes/sizes cannot be reported before importing its original.
- Uploaded SVG is rejected by the existing upload validator. Export an authorized official SVG to transparent PNG for upload; no executable vectors or arbitrary HTML are introduced. No external asset fetching API or SSRF surface is added.
- Logos use `object-fit:contain`, transparent image support, intrinsic card bounds and original colors; grayscale filters are removed. Small real lists remain static and unique. Long lists use exactly one inert, aria-hidden visual clone for seamless animation; it is not a duplicate CMS record or focusable link. Hover/focus and the pause control stop motion. Reduced motion removes animation and clones entirely.
- Banner/logo bytes are public only while referenced by an enabled/published, approved entry in the published document. Draft/hidden/archived references do not grant public access. Protected previews use authenticated `/api/admin/media/…` and never the public image optimizer. Both new image renderers avoid optimizer caching. Public media remains `private, no-store` and is reauthorized on every request.
- Public partner props contain only approved display name, logo, link and localized alt text. Provenance, rights notes and unpublished candidates are not sent in public HTML/RSC.

## Storage and authorization

Optional strict `SiteContent.banner` and `SiteContent.partners` fields preserve compatibility with old documents and immutable history. No automatic seed or rewrite is performed on any existing database. SQLite uses the existing transactional JSON content store, Zod validation, version CAS, append-only snapshots and audit; no SQLite DDL change is needed. PostgreSQL migration `202610160002_homepage_visuals.sql` adds an insert/update document guard with no data rewrite or client grant. It prevents duplicate identifiers/names and unconfirmed partner publication. Existing recursive `.image` SQL checks protect banner and logo references during restoration and archival. Apply only after review in synthetic staging, never automatically against production.

Inventory, draft replacement, archival checks and restoration share the new `contentAssets()` definition. Banner replacement also updates reserved dimensions. No new authentication endpoints or permission path are introduced: the existing protected content/media routes retain Same-Origin checks, role checks, Supabase AAL2 and live-session verification. No service-role credential enters client code. Existing session, team, audit, CRM, security and contact features remain in the same Next.js project.

## Remaining release gates

- Obtain the original downloadable banner file or import it through the local CMS, then measure its actual optimized bytes and visually review real desktop/tablet/mobile assets.
- Permit official-source research, establish the exact company identities, obtain authenticated official logo resources and record actual usage permission before publication. Candidate domains in the register must not be treated as verified sources.
- Review and apply the additive migration to a separate synthetic Supabase staging project. Run actual TOTP enrollment/challenge/AAL2, logout/revocation, roles/RLS and storage checks; local tests/PGlite do not certify hosted Supabase.
- Review stacked PR integration, backups/restoration, hosting compatibility, real asset LCP/CLS, accessibility and native Windows startup. See the existing [release checklist](release-readiness-phase6.md). Do not deploy without approval.

PR #8 is a sibling based on PR #7 and contains separate SEO/equipment/hero work. It is preserved unchanged. Integrating both siblings later requires a reviewed reconciliation of content types, editor controls and media-reference logic; this feature does not silently replace its code or merge either PR.
