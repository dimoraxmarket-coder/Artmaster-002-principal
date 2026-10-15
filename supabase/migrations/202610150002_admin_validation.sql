-- Apply after the foundation migrations, in staging first. No customer data is changed.
begin;
alter table public.admin_sessions
  add column created_at timestamptz not null default now(),
  add column last_seen_at timestamptz not null default now(),
  add column auth_session_id uuid;
create index admin_sessions_auth_session on public.admin_sessions(user_id, auth_session_id);

-- Only trusted server code may touch a session. The atomic predicate prevents
-- an idle/absolute-expired or concurrently revoked session from being revived.
create function public.touch_admin_session(p_session_hash text, p_user_id uuid, p_auth_session_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.admin_sessions set last_seen_at=statement_timestamp()
  where session_hash=p_session_hash and user_id=p_user_id and auth_session_id=p_auth_session_id
    and purpose='admin' and expires_at>statement_timestamp()
    and created_at>statement_timestamp()-interval '8 hours'
    and last_seen_at>statement_timestamp()-interval '15 minutes';
  return found;
end $$;
revoke all on function public.touch_admin_session(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.touch_admin_session(text,uuid,uuid) to service_role;

-- Bind direct JWT reads to a live application session as well as AAL2.
-- SECURITY DEFINER is needed because session hashes are server-only. No hash,
-- token, or user-selected identity is accepted or returned by this function.
create function public.has_active_admin_session()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select auth.jwt()->>'aal')='aal2',false)
  and exists (select 1 from public.admin_roles r where r.user_id=(select auth.uid()) and r.role in ('viewer','editor','admin'))
  and exists (
    select 1 from public.admin_sessions s where s.user_id=(select auth.uid())
      and s.auth_session_id::text=(select auth.jwt()->>'session_id')
      and s.purpose='admin' and s.expires_at>statement_timestamp()
      and s.created_at>statement_timestamp()-interval '8 hours'
      and s.last_seen_at>statement_timestamp()-interval '15 minutes'
  )
$$;
revoke all on function public.has_active_admin_session() from public,anon;
grant execute on function public.has_active_admin_session() to authenticated,service_role;

create policy "Live session required for roles" on public.admin_roles as restrictive for all to authenticated
  using ((select public.has_active_admin_session())) with check ((select public.has_active_admin_session()));
create policy "Live session required for enquiries" on public.quotes as restrictive for all to authenticated
  using ((select public.has_active_admin_session())) with check ((select public.has_active_admin_session()));
create policy "Live session required for CMS" on public.site_content as restrictive for all to authenticated
  using ((select public.has_active_admin_session())) with check ((select public.has_active_admin_session()));
create policy "Live session required for audit" on public.audit_log as restrictive for all to authenticated
  using ((select public.has_active_admin_session())) with check ((select public.has_active_admin_session()));
create policy "Live session required for private quote objects" on storage.objects as restrictive for all to authenticated
  using (bucket_id<>'quote-files' or (select public.has_active_admin_session()))
  with check (bucket_id<>'quote-files' or (select public.has_active_admin_session()));

-- All NEW uploads go here. Do not change or remove legacy public objects.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portfolio-private','portfolio-private',false,5242880,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Even an accidentally added permissive policy cannot expose draft bytes.
create policy "Portfolio originals are server only" on storage.objects as restrictive for all to anon,authenticated
  using (bucket_id<>'portfolio-private') with check (bucket_id<>'portfolio-private');
commit;
