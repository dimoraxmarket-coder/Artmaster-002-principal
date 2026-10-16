-- Additive application schema: hero assets and equipment metadata live in the existing versioned JSON document.
-- No customer rows, files or history are rewritten/deleted. Run only after reviewed backup + approved staging setup.
begin;
create or replace function public.write_site_content(p_content jsonb,p_publish boolean,p_actor uuid,p_expected_version integer,p_source_id bigint default null)
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
  if exists(select 1 from jsonb_path_query(p_content,'$.** ? (@.type() == "object").keyvalue() ? (@.key == "image" || @.key == "video").value') i where i#>>'{}' like '/api/media/%' and not exists(
   select 1 from public.media_assets m join storage.objects o on o.bucket_id='portfolio-private' and '/api/media/'||o.name=m.url
   where m.url=i#>>'{}' and m.archived_at is null)) then raise exception 'unavailable asset' using errcode='23514'; end if;
 end if;
 if exists(select 1 from public.media_assets m where m.archived_at is not null and exists(select 1 from jsonb_path_query(p_content,'$.** ? (@.type() == "object").keyvalue() ? (@.key == "image" || @.key == "video").value') i where i#>>'{}'=m.url)) then raise exception 'archived asset' using errcode='23514'; end if;
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

create or replace function public.archive_media(p_url text,p_actor uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.admin_roles where user_id=p_actor and enabled and role='admin') then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.site_content where id=1 for update;
 if exists(select 1 from public.site_content c,jsonb_path_query(jsonb_build_array(c.draft,c.published),'$.** ? (@.type() == "object").keyvalue() ? (@.key == "image" || @.key == "video").value') i where i#>>'{}'=p_url) then raise exception 'asset in use' using errcode='23514'; end if;
 update public.media_assets set archived_at=now() where url=p_url and archived_at is null;
 if not found then raise exception 'not found' using errcode='P0002'; end if;
 insert into public.audit_log(actor_id,action,target) values(p_actor,'media.archive',p_url);
end $$;
-- The existing bucket remains private. No client storage policy is added.
update storage.buckets set file_size_limit=20971520,allowed_mime_types=array['image/webp','video/mp4','video/webm'] where id='portfolio-private';
create function public.seo_conversion_days(p_start date,p_end date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>92 or p_end>current_date then raise exception 'invalid range' using errcode='22023'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('day',report_day,'count',n) order by report_day),'[]'::jsonb) from (
 select (created_at at time zone 'UTC')::date as report_day,count(*) as n from public.quotes
 where created_at>=p_start::timestamp at time zone 'UTC' and created_at<(p_end+1)::timestamp at time zone 'UTC' group by 1) daily);
end $$;
revoke all on function public.seo_conversion_days(date,date) from public,anon,authenticated;
grant execute on function public.seo_conversion_days(date,date) to service_role;
commit;
