-- Additive only. Apply after PR #2/#3 migrations, on synthetic staging first.
alter table public.quotes add column if not exists version integer not null default 0;
alter table public.quotes add column if not exists assigned_to uuid references public.admin_roles(user_id) on delete set null;
create index if not exists quotes_assigned_to on public.quotes(assigned_to);
create index if not exists quotes_status_created on public.quotes((data->>'status'),created_at desc,id);
create table if not exists public.quote_events (
 id bigint generated always as identity primary key,
 quote_id uuid not null references public.quotes(id), actor uuid not null,
 kind text not null check(kind in ('status','assignment','note')),
 body text not null check(length(body)<=4000), created_at timestamptz not null default now()
);
create index if not exists quote_events_lookup on public.quote_events(quote_id,id desc);
create table if not exists public.media_assets (
 url text primary key, name text not null, bytes bigint not null check(bytes>=0),
 width integer not null check(width>=0),height integer not null check(height>=0),
 created_at timestamptz not null default now(),created_by uuid,archived_at timestamptz
);
-- New data is server-only. No client grants/policies: even an AAL2 JWT must use
-- the API, which validates the live application session and required role.
alter table public.quote_events enable row level security;
alter table public.media_assets enable row level security;
revoke all on public.quote_events,public.media_assets from public,anon,authenticated;
grant all on public.quote_events,public.media_assets to service_role;
grant usage,select on sequence public.quote_events_id_seq to service_role;

create or replace function public.crm_staff() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.user_id,'email',coalesce(nullif(u.email,''),'Cont fără e-mail'),'role',r.role) order by u.email),'[]'::jsonb)
 from public.admin_roles r join auth.users u on u.id=r.user_id
$$;
create or replace function public.crm_list(p_query jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; page_number integer:=(p_query->>'page')::integer; page_size integer:=(p_query->>'pageSize')::integer;
begin
 if page_number is null or page_size is null or page_number not between 1 and 100000 or page_size not between 1 and 50 or length(p_query->>'q')>200 then raise exception 'invalid query' using errcode='22023'; end if;
 with matched as (
  select * from public.quotes q where
   strpos(lower(concat_ws(' ',data->>'name',data->>'email',data->>'phone',data->>'company',data->>'service',data->>'message')),lower(p_query->>'q'))>0
   and (p_query->>'status'='all' or data->>'status'=p_query->>'status')
   and (p_query->>'assignee'='all' or (p_query->>'assignee'='unassigned' and assigned_to is null) or assigned_to::text=p_query->>'assignee')
 ), page_rows as (select * from matched order by created_at desc,id desc limit page_size offset (page_number-1)*page_size)
 select jsonb_build_object('quotes',coalesce((select jsonb_agg((data-'payloadHash'-'idempotencyKey')||jsonb_build_object('notification',notification,'version',version,'assignedTo',assigned_to) order by created_at desc,id desc) from page_rows),'[]'::jsonb),
 'total',(select count(*) from matched),'page',page_number,'pageSize',page_size,
 'totals',(select jsonb_build_object('total',count(*),'new',count(*) filter(where data->>'status'='new'),'in_progress',count(*) filter(where data->>'status'='in_progress'),'completed',count(*) filter(where data->>'status'='completed'),'archived',count(*) filter(where data->>'status'='archived')) from public.quotes)) into result;
 return result;
end $$;
create or replace function public.crm_detail(p_id uuid,p_before bigint) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare item public.quotes; result jsonb;
begin
 select * into item from public.quotes where id=p_id;
 if not found then raise exception 'not found' using errcode='P0002'; end if;
 select jsonb_build_object('quote',(item.data-'payloadHash'-'idempotencyKey')||jsonb_build_object('notification',item.notification,'version',item.version,'assignedTo',item.assigned_to),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'actor',actor,'kind',kind,'body',body,'createdAt',created_at) order by id desc) from (select * from public.quote_events where quote_id=p_id and id<p_before order by id desc limit 50) e),'[]'::jsonb),
 'hasMore',(select count(*)>50 from (select id from public.quote_events where quote_id=p_id and id<p_before limit 51) e)) into result;
 return result;
end $$;
create or replace function public.crm_change(p_id uuid,p_change jsonb,p_actor uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.quotes;
begin
 if not exists(select 1 from public.admin_roles where user_id=p_actor and role in ('editor','admin')) then raise exception 'forbidden' using errcode='42501'; end if;
 if not (p_change ?| array['status','assignedTo','note']) or (p_change-'status'-'assignedTo'-'note'-'expectedVersion')<>'{}'::jsonb then raise exception 'invalid change' using errcode='22023'; end if;
 if p_change?'status' and (p_change->>'status' is null or p_change->>'status' not in ('new','in_progress','completed','archived')) then raise exception 'invalid status' using errcode='22023'; end if;
 if p_change?'note' and (p_change->>'note' is null or length(trim(p_change->>'note')) not between 1 and 4000 or not p_change?'expectedVersion') then raise exception 'invalid note' using errcode='22023'; end if;
 select * into item from public.quotes where id=p_id for update;
 if not found then raise exception 'not found' using errcode='P0002'; end if;
 if p_change?'expectedVersion' and item.version<>(p_change->>'expectedVersion')::integer then raise exception 'version conflict' using errcode='40001'; end if;
 if p_change->>'assignedTo' is not null and not exists(select 1 from public.admin_roles where user_id=(p_change->>'assignedTo')::uuid and role in ('editor','admin')) then raise exception 'invalid assignee' using errcode='22023'; end if;
 update public.quotes set data=case when p_change?'status' then jsonb_set(data,'{status}',p_change->'status') else data end,
 assigned_to=case when p_change?'assignedTo' then (p_change->>'assignedTo')::uuid else assigned_to end,version=version+1 where id=p_id;
 if p_change?'status' then insert into public.quote_events(quote_id,actor,kind,body) values(p_id,p_actor,'status',p_change->>'status'); end if;
 if p_change?'assignedTo' then insert into public.quote_events(quote_id,actor,kind,body) values(p_id,p_actor,'assignment',coalesce(p_change->>'assignedTo','')); end if;
 if p_change?'note' then insert into public.quote_events(quote_id,actor,kind,body) values(p_id,p_actor,'note',trim(p_change->>'note')); end if;
 insert into public.audit_log(actor_id,action,target) values(p_actor,'quote.update',p_id::text);
end $$;

-- All mutations use the same content-row lock order. A stale draft cannot
-- reintroduce an archived URL, nor can an archive race with draft publication.
create or replace function public.save_site_content(p_content jsonb,p_publish boolean,p_actor uuid,p_expected_version integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare next_version integer;
begin
 if not exists(select 1 from public.admin_roles where user_id=p_actor and role in ('editor','admin'))
 or (p_publish and not exists(select 1 from public.admin_roles where user_id=p_actor and role='admin')) then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.site_content where id=1 for update;
 if exists(select 1 from public.media_assets m where m.archived_at is not null and exists(select 1 from jsonb_path_query(p_content,'$.**.image') i where i#>>'{}'=m.url)) then raise exception 'archived asset' using errcode='23514'; end if;
 update public.site_content set draft=p_content,published=case when p_publish then p_content else published end,version=version+1,updated_at=now() where id=1 and version=p_expected_version returning version into next_version;
 if next_version is null then raise exception 'version conflict' using errcode='40001'; end if;
 insert into public.audit_log(actor_id,action,target) values(p_actor,case when p_publish then 'content.publish' else 'content.draft' end,'site');return next_version;
end $$;
create or replace function public.archive_media(p_url text,p_actor uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.admin_roles where user_id=p_actor and role='admin') then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.site_content where id=1 for update;
 if exists(select 1 from public.site_content c,jsonb_path_query(jsonb_build_array(c.draft,c.published),'$.**.image') i where i#>>'{}'=p_url) then raise exception 'asset in use' using errcode='23514'; end if;
 update public.media_assets set archived_at=now() where url=p_url and archived_at is null;
 if not found then raise exception 'not found' using errcode='P0002'; end if;
 insert into public.audit_log(actor_id,action,target) values(p_actor,'media.archive',p_url);
end $$;
revoke all on function public.crm_staff(),public.crm_list(jsonb),public.crm_detail(uuid,bigint),public.crm_change(uuid,jsonb,uuid),public.archive_media(text,uuid) from public,anon,authenticated;
grant execute on function public.crm_staff(),public.crm_list(jsonb),public.crm_detail(uuid,bigint),public.crm_change(uuid,jsonb,uuid),public.archive_media(text,uuid) to service_role;

-- Preserve pre-existing private objects, including unassociated uploads. No byte
-- writes/removals; legacy public portfolio objects keep their published URLs.
insert into public.media_assets(url,name,bytes,width,height,created_at)
select '/api/media/'||name,name,case when metadata->>'size' ~ '^\d{1,12}$' then (metadata->>'size')::bigint else 0 end,0,0,created_at
from storage.objects where bucket_id='portfolio-private' and name ~ '^[a-f0-9-]{36}\.webp$'
on conflict(url) do nothing;
create or replace function public.media_inventory(p_refs jsonb,p_search text,p_page integer,p_size integer) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_page not between 1 and 100000 or p_size not between 1 and 40 or length(p_search)>200 then raise exception 'invalid query' using errcode='22023'; end if;
 with legacy as (select url,min(name) name from jsonb_to_recordset(p_refs) as r(url text,name text) group by url),all_assets as (
 select url,name,bytes,width,height,created_at,archived_at,true managed from public.media_assets where archived_at is null
 union all select l.url,l.name,0,0,0,null::timestamptz,null::timestamptz,false from legacy l where not exists(select 1 from public.media_assets m where m.url=l.url)
 ),matched as(select * from all_assets where strpos(lower(name||' '||url),lower(p_search))>0),page_rows as(select * from matched order by created_at desc nulls last,url limit p_size offset (p_page-1)*p_size)
 select jsonb_build_object('total',(select count(*) from matched),'assets',coalesce((select jsonb_agg(jsonb_build_object('url',url,'name',name,'bytes',bytes,'width',width,'height',height,'createdAt',coalesce(created_at::text,''),'archivedAt',archived_at,'managed',managed) order by created_at desc nulls last,url) from page_rows),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.media_inventory(jsonb,text,integer,integer) from public,anon,authenticated;
grant execute on function public.media_inventory(jsonb,text,integer,integer) to service_role;
