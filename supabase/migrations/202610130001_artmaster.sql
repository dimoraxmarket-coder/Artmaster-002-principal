-- Run with the Supabase migration owner. No anonymous access to personal data.
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer','editor','admin'))
);
create table if not exists public.admin_sessions (
  session_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.admin_sessions enable row level security;
revoke all on public.admin_sessions from anon,authenticated;
grant all on public.admin_sessions to service_role;
create table if not exists public.quotes (
  id uuid primary key,
  idempotency_key uuid not null unique,
  payload_hash text not null,
  data jsonb not null,
  notification text not null check (notification in ('pending','sent','not_configured')),
  attempts integer not null default 0,
  next_attempt timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now()
);
create table if not exists public.site_content (
  id integer primary key check (id=1),
  published jsonb,
  draft jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.site_content(id) values(1) on conflict do nothing;
create table if not exists public.rate_events (bucket text not null, time timestamptz not null default now());
create index if not exists rate_events_lookup on public.rate_events(bucket,time);
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  action text not null,
  target text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_roles enable row level security;
alter table public.quotes enable row level security;
alter table public.site_content enable row level security;
alter table public.rate_events enable row level security;
alter table public.audit_log enable row level security;
-- Read-only policies; all mutations go through the validated server using service_role.
create policy "Users may inspect their own assigned role" on public.admin_roles for select to authenticated using (user_id=auth.uid());
create policy "Assigned team may read quotes" on public.quotes for select to authenticated using (exists(select 1 from public.admin_roles where user_id=auth.uid()));
create policy "Assigned team may read CMS" on public.site_content for select to authenticated using (exists(select 1 from public.admin_roles where user_id=auth.uid()));
create policy "Administrators may read audit" on public.audit_log for select to authenticated using (exists(select 1 from public.admin_roles where user_id=auth.uid() and role='admin'));
revoke all on public.admin_roles, public.quotes, public.site_content, public.rate_events, public.audit_log from anon;
grant select on public.admin_roles, public.quotes, public.site_content, public.audit_log to authenticated;
revoke insert, update, delete on public.admin_roles, public.quotes, public.site_content, public.rate_events, public.audit_log from authenticated;
grant all on public.admin_roles, public.quotes, public.site_content, public.rate_events, public.audit_log to service_role;
grant usage,select on sequence public.audit_log_id_seq to service_role;

create or replace function public.consume_rate(p_bucket text,p_limit integer,p_window_ms integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare requests integer;
begin
  if p_limit<1 or p_window_ms<1 or length(p_bucket)>200 then raise exception 'invalid rate configuration'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_bucket,0));
  delete from public.rate_events where bucket=p_bucket and time<now()-make_interval(secs=>p_window_ms/1000.0);
  select count(*) into requests from public.rate_events where bucket=p_bucket and time>now()-make_interval(secs=>p_window_ms/1000.0);
  if requests>=p_limit then return false; end if;
  insert into public.rate_events(bucket) values(p_bucket);
  return true;
end $$;

create or replace function public.save_site_content(p_content jsonb,p_publish boolean,p_actor uuid,p_expected_version integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare next_version integer;
begin
  if not exists(select 1 from public.admin_roles where user_id=p_actor and role in ('editor','admin'))
    or (p_publish and not exists(select 1 from public.admin_roles where user_id=p_actor and role='admin')) then raise exception 'forbidden' using errcode='42501'; end if;
  update public.site_content set draft=p_content,published=case when p_publish then p_content else published end,version=version+1,updated_at=now() where id=1 and version=p_expected_version returning version into next_version;
  if next_version is null then raise exception 'version conflict' using errcode='40001'; end if;
  insert into public.audit_log(actor_id,action,target) values(p_actor,case when p_publish then 'content.publish' else 'content.draft' end,'site');
  return next_version;
end $$;

create or replace function public.mark_quote_notification(p_id uuid,p_sent boolean,p_error text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.quotes set notification=case when p_sent then 'sent' else 'pending' end,
    attempts=case when p_sent then attempts else attempts+1 end,
    next_attempt=case when p_sent then next_attempt else now()+interval '5 minutes' end,
    last_error=case when p_sent then null else left(p_error,100) end where id=p_id;
end $$;
revoke all on function public.consume_rate(text,integer,integer) from public,anon,authenticated;
revoke all on function public.save_site_content(jsonb,boolean,uuid,integer) from public,anon,authenticated;
revoke all on function public.mark_quote_notification(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.consume_rate(text,integer,integer) to service_role;
grant execute on function public.save_site_content(jsonb,boolean,uuid,integer) to service_role;
grant execute on function public.mark_quote_notification(uuid,boolean,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('quote-files','quote-files',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('portfolio','portfolio',true,5242880,array['image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- No client upload or quote-file access policy is created. quote-files are fetched only
-- by the server after session and role checks. Portfolio holds sanitized public images.
