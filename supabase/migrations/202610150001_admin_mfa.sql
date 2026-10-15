-- Additive security migration. Apply after 202610130001_artmaster.sql.
-- Keep existing rows, roles, customer records and storage objects intact.
begin;
alter table public.admin_sessions
  add column purpose text not null default 'admin' check (purpose in ('admin','mfa'));

-- Restrictive policies AND with existing and future permissive policies.
-- Auth-signed JWT AAL is authoritative; client-supplied headers/metadata are not.
create policy "MFA required for assigned roles" on public.admin_roles
  as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy "MFA required for enquiries" on public.quotes
  as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy "MFA required for CMS" on public.site_content
  as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');
create policy "MFA required for audit" on public.audit_log
  as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2')
  with check ((select auth.jwt()->>'aal') = 'aal2');

-- quote-files stays private and server-only. Authenticated clients have no
-- permissive access policy; this also blocks AAL1 if one is added later.
create policy "MFA required for private quote objects" on storage.objects
  as restrictive for all to authenticated
  using (bucket_id <> 'quote-files' or (select auth.jwt()->>'aal') = 'aal2')
  with check (bucket_id <> 'quote-files' or (select auth.jwt()->>'aal') = 'aal2');
commit;
