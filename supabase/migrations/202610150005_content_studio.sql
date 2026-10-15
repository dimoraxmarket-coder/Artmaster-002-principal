-- Additive history. No data, content, objects or existing history are deleted.
begin;
-- Serialize baseline capture with existing content writers and media archival.
select id from public.site_content where id=1 for update;
create table public.content_versions(
 id bigint generated always as identity primary key,
 version integer not null, action text not null check(action in ('baseline-published','baseline-draft','draft','publish','restore')),
 actor uuid, created_at timestamptz not null default now(),
 source_id bigint references public.content_versions(id), bytes integer not null, content jsonb not null
);
create index content_versions_order on public.content_versions(id desc);
alter table public.content_versions enable row level security;
-- No browser-facing policies, including for AAL2. Access is mediated by the server.
revoke all on public.content_versions from public,anon,authenticated,service_role;
grant select on public.content_versions to service_role;
insert into public.content_versions(version,action,bytes,content)
 select version,'baseline-published',octet_length(published::text),published from public.site_content where published is not null;
insert into public.content_versions(version,action,bytes,content)
 select version,'baseline-draft',octet_length(draft::text),draft from public.site_content where draft is not null;
create function public.content_history_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'content history is immutable' using errcode='42501'; end $$;
create trigger content_versions_immutable before update or delete on public.content_versions for each row execute function public.content_history_immutable();
revoke all on function public.content_history_immutable() from public,anon,authenticated,service_role;

create function public.write_site_content(p_content jsonb,p_publish boolean,p_actor uuid,p_expected_version integer,p_source_id bigint default null)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare next_version integer; usage_bytes bigint; usage_count bigint; new_bytes integer; source_content jsonb;
begin
 if not exists(select 1 from public.admin_roles where user_id=p_actor and enabled and role in ('editor','admin'))
 or (p_publish and not exists(select 1 from public.admin_roles where user_id=p_actor and enabled and role='admin')) then raise exception 'forbidden' using errcode='42501'; end if;
 -- Same lock as media archival and all content writes. CAS, quota, snapshot and audit are atomic.
 perform 1 from public.site_content where id=1 for update;
 if p_source_id is not null then
  select content into source_content from public.content_versions where id=p_source_id;
  if source_content is null or source_content<>p_content or p_publish then raise exception 'invalid restoration' using errcode='22023'; end if;
  if exists(select 1 from jsonb_path_query(p_content,'$.**.image') i where i#>>'{}' like '/api/media/%' and not exists(
   select 1 from public.media_assets m join storage.objects o on o.bucket_id='portfolio-private' and '/api/media/'||o.name=m.url
   where m.url=i#>>'{}' and m.archived_at is null)) then raise exception 'unavailable asset' using errcode='23514'; end if;
 end if;
 if exists(select 1 from public.media_assets m where m.archived_at is not null and exists(select 1 from jsonb_path_query(p_content,'$.**.image') i where i#>>'{}'=m.url)) then raise exception 'archived asset' using errcode='23514'; end if;
 new_bytes:=octet_length(p_content::text);
 select count(*),coalesce(sum(bytes),0) into usage_count,usage_bytes from public.content_versions;
 if new_bytes>2097152 or usage_count>=10000 or usage_bytes+new_bytes>536870912 then raise exception 'history capacity reached' using errcode='P0450'; end if;
 update public.site_content set draft=p_content,published=case when p_publish then p_content else published end,version=version+1,updated_at=now() where id=1 and version=p_expected_version returning version into next_version;
 if next_version is null then raise exception 'version conflict' using errcode='40001'; end if;
 insert into public.content_versions(version,action,actor,source_id,bytes,content) values(next_version,case when p_source_id is not null then 'restore' when p_publish then 'publish' else 'draft' end,p_actor,p_source_id,new_bytes,p_content);
 insert into public.audit_log(actor_id,action,target) values(p_actor,case when p_source_id is not null then 'content.restore' when p_publish then 'content.publish' else 'content.draft' end,'site');
 return next_version;
end $$;
revoke all on function public.write_site_content(jsonb,boolean,uuid,integer,bigint) from public,anon,authenticated;
grant execute on function public.write_site_content(jsonb,boolean,uuid,integer,bigint) to service_role;
-- Retain the existing RPC contract; old callers also create history.
create or replace function public.save_site_content(p_content jsonb,p_publish boolean,p_actor uuid,p_expected_version integer)
returns integer language sql security definer set search_path=public,pg_temp as $$
 select public.write_site_content(p_content,p_publish,p_actor,p_expected_version,null)
$$;
create function public.content_history_usage() returns bigint language sql security definer set search_path=public,pg_temp as $$select coalesce(sum(bytes),0)::bigint from public.content_versions$$;
revoke all on function public.content_history_usage() from public,anon,authenticated;
grant execute on function public.content_history_usage() to service_role;
commit;
