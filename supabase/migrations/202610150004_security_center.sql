-- Additive security controls. Review and rehearse on synthetic staging first.
begin;
alter table public.admin_roles add column enabled boolean not null default true;
alter table public.admin_roles add column version integer not null default 0;
alter table public.admin_sessions add column reference uuid not null default gen_random_uuid();
alter table public.admin_sessions add column verified_at timestamptz;
alter table public.admin_sessions add column role_version integer not null default 0;
create unique index admin_sessions_reference on public.admin_sessions(reference);
alter table public.audit_log add column context jsonb not null default '{}'::jsonb;
create index audit_security_lookup on public.audit_log(action,created_at desc,id desc);
-- The application service can append/read audit, never rewrite or truncate it.
revoke all on public.audit_log from service_role;
grant select,insert on public.audit_log to service_role;
-- Team mutations must use the serialized, session-bound routine below.
revoke update,delete,truncate on public.admin_roles from service_role;

create function public.security_session_insert() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('artmaster-security-team',0));
 if not exists(select 1 from public.admin_roles where user_id=new.user_id and enabled and version=new.role_version) then raise exception 'account changed' using errcode='P0401'; end if;
 if new.purpose='admin' then
  -- Server writes this only after verifying the exact Auth AAL2 token.
  if new.verified_at is null or new.verified_at>statement_timestamp()+interval '5 seconds' then raise exception 'verification required' using errcode='P0428'; end if;
  new.verified_at:=statement_timestamp();
  insert into public.audit_log(actor_id,action,target) values(new.user_id,'admin.login','session');
 end if;
 return new;
end $$;
create trigger security_session_insert before insert on public.admin_sessions for each row execute function public.security_session_insert();
revoke all on function public.security_session_insert() from public,anon,authenticated,service_role;

create or replace function public.touch_admin_session(p_session_hash text,p_user_id uuid,p_auth_session_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.admin_sessions s set last_seen_at=statement_timestamp()
 where s.session_hash=p_session_hash and s.user_id=p_user_id and s.auth_session_id=p_auth_session_id and s.purpose='admin'
 and s.expires_at>statement_timestamp() and s.created_at>statement_timestamp()-interval '8 hours' and s.last_seen_at>statement_timestamp()-interval '15 minutes'
 and exists(select 1 from public.admin_roles r where r.user_id=s.user_id and r.enabled and r.version=s.role_version);
 return found;
end $$;
create or replace function public.has_active_admin_session() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(auth.jwt()->>'aal'='aal2',false) and exists(
  select 1 from public.admin_sessions s join public.admin_roles r on r.user_id=s.user_id
  where r.user_id=auth.uid() and r.enabled and r.version=s.role_version and r.role in ('viewer','editor','admin')
  and s.auth_session_id::text=auth.jwt()->>'session_id' and s.purpose='admin' and s.expires_at>statement_timestamp()
  and s.created_at>statement_timestamp()-interval '8 hours' and s.last_seen_at>statement_timestamp()-interval '15 minutes'
 )
$$;
-- A helper with no client grants. Sensitive callers acquire the team lock first,
-- then re-read the actor's current role, generation and bound live session.
create function public.security_require(p_hash text,p_actor uuid,p_auth uuid,p_fresh boolean,p_admin boolean)
returns text language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare role_name text; verified timestamptz;
begin
 select r.role,s.verified_at into role_name,verified from public.admin_sessions s join public.admin_roles r on r.user_id=s.user_id
 where s.session_hash=p_hash and s.user_id=p_actor and s.auth_session_id=p_auth and s.purpose='admin' and r.enabled and r.version=s.role_version
 and s.expires_at>statement_timestamp() and s.created_at>statement_timestamp()-interval '8 hours' and s.last_seen_at>statement_timestamp()-interval '15 minutes';
 if not found then raise exception 'unauthorized' using errcode='P0401'; end if;
 if p_admin and role_name<>'admin' then raise exception 'forbidden' using errcode='P0403'; end if;
 if p_fresh and (verified is null or verified<=statement_timestamp()-interval '5 minutes' or verified>statement_timestamp()) then raise exception 'reauthenticate' using errcode='P0428'; end if;
 return role_name;
end $$;
create function public.security_sessions(p_hash text,p_actor uuid,p_auth uuid,p_owner uuid,p_page integer,p_size integer)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor_role text; result jsonb;
begin
 actor_role:=public.security_require(p_hash,p_actor,p_auth,false,false);
 if p_owner<>p_actor and actor_role<>'admin' then raise exception 'forbidden' using errcode='P0403'; end if;
 if p_page not between 1 and 100000 or p_size not between 1 and 50 then raise exception 'invalid query' using errcode='22023'; end if;
 if not exists(select 1 from public.admin_roles where user_id=p_owner) then raise exception 'not found' using errcode='P0002'; end if;
 with active as (
  select s.* from public.admin_sessions s join public.admin_roles r on r.user_id=s.user_id where s.user_id=p_owner and r.enabled and r.version=s.role_version and s.purpose='admin'
  and s.expires_at>statement_timestamp() and s.created_at>statement_timestamp()-interval '8 hours' and s.last_seen_at>statement_timestamp()-interval '15 minutes'
 ),page_rows as(select * from active order by created_at desc,reference limit p_size offset (p_page-1)*p_size)
 select jsonb_build_object('total',(select count(*) from active),'page',p_page,'pageSize',p_size,
 'owner',(select jsonb_build_object('id',r.user_id,'email',coalesce(u.email,'Cont fără e-mail')) from public.admin_roles r join auth.users u on u.id=r.user_id where r.user_id=p_owner),
 'freshUntil',(select verified_at+interval '5 minutes' from public.admin_sessions where session_hash=p_hash),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('reference',reference,'current',session_hash=p_hash,'createdAt',created_at,'lastActivityAt',last_seen_at,'expiresAt',least(expires_at,created_at+interval '8 hours',last_seen_at+interval '15 minutes'),'absoluteExpiresAt',least(expires_at,created_at+interval '8 hours')) order by created_at desc,reference) from page_rows),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.security_revoke(p_hash text,p_actor uuid,p_auth uuid,p_reference uuid,p_owner uuid,p_all boolean)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare actor_role text; target public.admin_sessions; owner_id uuid; removed integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('artmaster-security-team',0));
 actor_role:=public.security_require(p_hash,p_actor,p_auth,true,false);
 if p_reference is null and not p_all or p_reference is not null and (p_all or p_owner is not null) then raise exception 'invalid input' using errcode='22023'; end if;
 if p_reference is not null then
  select * into target from public.admin_sessions where reference=p_reference;
  if not found then raise exception 'not found' using errcode='P0002'; end if;
  owner_id:=target.user_id;
 else owner_id:=coalesce(p_owner,p_actor); end if;
 if owner_id<>p_actor and actor_role<>'admin' then raise exception 'forbidden' using errcode='P0403'; end if;
 if target.session_hash=p_hash then raise exception 'current session' using errcode='P0413'; end if;
 if not exists(select 1 from public.admin_roles where user_id=owner_id) then raise exception 'not found' using errcode='P0002'; end if;
 if p_reference is not null then
  -- Revoke any pending/full rows sharing that Auth session, but never the actor.
  if target.auth_session_id=p_auth and owner_id=p_actor then raise exception 'current session' using errcode='P0413'; end if;
  delete from public.admin_sessions where user_id=owner_id and (session_hash=target.session_hash or auth_session_id=target.auth_session_id);
 else delete from public.admin_sessions where user_id=owner_id and session_hash<>p_hash; end if;
 get diagnostics removed=row_count;
 insert into public.audit_log(actor_id,action,target,context) values(p_actor,'security.sessions.revoke',owner_id::text,jsonb_build_object('scope',case when p_reference is not null then 'single' else 'other_sessions' end,'revoked',removed));
 return removed;
end $$;
create function public.security_accounts(p_hash text,p_actor uuid,p_auth uuid,p_query jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor_role text; result jsonb; page_number integer:=(p_query->>'page')::integer; page_size integer:=(p_query->>'pageSize')::integer;
begin
 actor_role:=public.security_require(p_hash,p_actor,p_auth,false,false);
 if page_number not between 1 and 100000 or page_size not between 1 and 50 or length(p_query->>'q')>200 then raise exception 'invalid query' using errcode='22023'; end if;
 with matched as(select r.*,coalesce(u.email,'Cont fără e-mail') email from public.admin_roles r join auth.users u on u.id=r.user_id where (actor_role='admin' or r.enabled) and strpos(lower(coalesce(u.email,'')),lower(p_query->>'q'))>0),page_rows as(select * from matched order by email,user_id limit page_size offset (page_number-1)*page_size)
 select jsonb_build_object('total',(select count(*) from matched),'page',page_number,'pageSize',page_size,'enabledAdmins',(select count(*) from public.admin_roles where enabled and role='admin'),
 'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'email',email,'role',role,'enabled',enabled,'version',version) order by email,user_id) from page_rows),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.security_change_account(p_hash text,p_actor uuid,p_auth uuid,p_target uuid,p_role text,p_enabled boolean,p_expected integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.admin_roles; removed integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('artmaster-security-team',0));
 perform public.security_require(p_hash,p_actor,p_auth,true,true);
 if p_role is null or p_role not in ('viewer','editor','admin') or p_enabled is null or p_expected is null then raise exception 'invalid input' using errcode='22023'; end if;
 select * into target from public.admin_roles where user_id=p_target;
 if not found then raise exception 'not found' using errcode='P0002'; end if;
 if target.version<>p_expected then raise exception 'version conflict' using errcode='40001'; end if;
 if target.enabled and target.role='admin' and (p_role<>'admin' or not p_enabled) and (select count(*) from public.admin_roles where enabled and role='admin')<=1 then raise exception 'last admin' using errcode='P0409'; end if;
 if p_target=p_actor then raise exception 'self change' using errcode='P0412'; end if;
 if target.role=p_role and target.enabled=p_enabled then raise exception 'no change' using errcode='22023'; end if;
 update public.admin_roles set role=p_role,enabled=p_enabled,version=version+1 where user_id=p_target;
 delete from public.admin_sessions where user_id=p_target;get diagnostics removed=row_count;
 insert into public.audit_log(actor_id,action,target,context) values(p_actor,'security.team.change',p_target::text,jsonb_build_object('previousRole',target.role,'role',p_role,'enabled',p_enabled,'revoked',removed));
 return jsonb_build_object('ok',true,'revoked',removed);
end $$;
create function public.security_audit(p_hash text,p_actor uuid,p_auth uuid,p_query jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; page_number integer:=(p_query->>'page')::integer; page_size integer:=(p_query->>'pageSize')::integer;
begin
 perform public.security_require(p_hash,p_actor,p_auth,false,true);
 if page_number not between 1 and 100000 or page_size not between 1 and 50 then raise exception 'invalid query' using errcode='22023'; end if;
 with matched as (
  select l.*,coalesce(u.email,'Operator / cont indisponibil') actor_label,t.email target_label from public.audit_log l left join auth.users u on u.id=l.actor_id left join auth.users t on t.id::text=l.target
  where l.action in ('admin.login','admin.login.failed','admin.logout','admin.mfa.enroll','admin.mfa.failed','security.sessions.revoke','security.team.change')
  and (p_query->>'action'='all' or l.action=p_query->>'action') and (p_query->>'actor' is null or l.actor_id=(p_query->>'actor')::uuid)
  and (p_query->>'from' is null or l.created_at>=(p_query->>'from')::timestamptz) and (p_query->>'to' is null or l.created_at<=(p_query->>'to')::timestamptz)
 ),page_rows as(select * from matched order by id desc limit page_size offset (page_number-1)*page_size)
 select jsonb_build_object('total',(select count(*) from matched),'page',page_number,'pageSize',page_size,'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'actor',actor_id,'actorLabel',actor_label,'action',action,'target',case when action like 'security.%' and target~'^[a-f0-9-]{36}$' then target else 'session' end,'createdAt',created_at,'targetLabel',target_label,
 'context',(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(context) where
 (key='revoked' and jsonb_typeof(value)='number' and value::text~'^\d{1,10}$') or (key='enabled' and jsonb_typeof(value)='boolean') or (key in ('role','previousRole') and value#>>'{}' in ('viewer','editor','admin')) or (key='scope' and value#>>'{}' in ('single','other_sessions')))) order by id desc) from page_rows),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.security_logout(p_hash text,p_auth uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare person uuid; removed integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('artmaster-security-team',0));
 -- Also catches a pending session promoted concurrently before this lock.
 with deleted as(delete from public.admin_sessions where session_hash=p_hash or auth_session_id=p_auth returning user_id)
 select min(user_id::text)::uuid,count(*)::integer into person,removed from deleted;
 if removed>0 then insert into public.audit_log(actor_id,action,target) values(person,'admin.logout','session'); end if;
end $$;
create function public.complete_admin_mfa(p_pending text,p_hash text,p_actor uuid,p_auth uuid,p_generation integer,p_expires timestamptz)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('artmaster-security-team',0));
 if p_expires<=statement_timestamp() or p_expires>statement_timestamp()+interval '8 hours' or not exists(select 1 from public.admin_roles where user_id=p_actor and enabled and version=p_generation) then raise exception 'unauthorized' using errcode='P0401'; end if;
 delete from public.admin_sessions where session_hash=p_pending and user_id=p_actor and auth_session_id=p_auth and purpose='mfa' and role_version=p_generation and expires_at>statement_timestamp();
 if not found then raise exception 'unauthorized' using errcode='P0401'; end if;
 insert into public.admin_sessions(session_hash,user_id,auth_session_id,purpose,role_version,verified_at,expires_at) values(p_hash,p_actor,p_auth,'admin',p_generation,statement_timestamp(),p_expires);
 return true;
end $$;
create or replace function public.crm_staff() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.user_id,'email',coalesce(nullif(u.email,''),'Cont fără e-mail'),'role',r.role) order by u.email),'[]'::jsonb)
 from public.admin_roles r join auth.users u on u.id=r.user_id where r.enabled
$$;
revoke all on function public.security_require(text,uuid,uuid,boolean,boolean),public.security_sessions(text,uuid,uuid,uuid,integer,integer),public.security_revoke(text,uuid,uuid,uuid,uuid,boolean),public.security_accounts(text,uuid,uuid,jsonb),public.security_change_account(text,uuid,uuid,uuid,text,boolean,integer),public.security_audit(text,uuid,uuid,jsonb),public.security_logout(text,uuid),public.complete_admin_mfa(text,text,uuid,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.security_sessions(text,uuid,uuid,uuid,integer,integer),public.security_revoke(text,uuid,uuid,uuid,uuid,boolean),public.security_accounts(text,uuid,uuid,jsonb),public.security_change_account(text,uuid,uuid,uuid,text,boolean,integer),public.security_audit(text,uuid,uuid,jsonb),public.security_logout(text,uuid),public.complete_admin_mfa(text,text,uuid,uuid,integer,timestamptz) to service_role;

-- Existing business RPCs also reject disabled actors/assignees.
create or replace function public.crm_change(p_id uuid,p_change jsonb,p_actor uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.quotes;
begin
 if not exists(select 1 from public.admin_roles where user_id=p_actor and enabled and role in ('editor','admin')) then raise exception 'forbidden' using errcode='42501'; end if;
 if not (p_change ?| array['status','assignedTo','note']) or (p_change-'status'-'assignedTo'-'note'-'expectedVersion')<>'{}'::jsonb then raise exception 'invalid change' using errcode='22023'; end if;
 if p_change?'status' and (p_change->>'status' is null or p_change->>'status' not in ('new','in_progress','completed','archived')) then raise exception 'invalid status' using errcode='22023'; end if;
 if p_change?'note' and (p_change->>'note' is null or length(trim(p_change->>'note')) not between 1 and 4000 or not p_change?'expectedVersion') then raise exception 'invalid note' using errcode='22023'; end if;
 select * into item from public.quotes where id=p_id for update;
 if not found then raise exception 'not found' using errcode='P0002'; end if;
 if p_change?'expectedVersion' and item.version<>(p_change->>'expectedVersion')::integer then raise exception 'version conflict' using errcode='40001'; end if;
 if p_change->>'assignedTo' is not null and not exists(select 1 from public.admin_roles where user_id=(p_change->>'assignedTo')::uuid and enabled and role in ('editor','admin')) then raise exception 'invalid assignee' using errcode='22023'; end if;
 update public.quotes set data=case when p_change?'status' then jsonb_set(data,'{status}',p_change->'status') else data end,
 assigned_to=case when p_change?'assignedTo' then (p_change->>'assignedTo')::uuid else assigned_to end,version=version+1 where id=p_id;
 if p_change?'status' then insert into public.quote_events(quote_id,actor,kind,body) values(p_id,p_actor,'status',p_change->>'status'); end if;
 if p_change?'assignedTo' then insert into public.quote_events(quote_id,actor,kind,body) values(p_id,p_actor,'assignment',coalesce(p_change->>'assignedTo','')); end if;
 if p_change?'note' then insert into public.quote_events(quote_id,actor,kind,body) values(p_id,p_actor,'note',trim(p_change->>'note')); end if;
 insert into public.audit_log(actor_id,action,target) values(p_actor,'quote.update',p_id::text);
end $$;
create or replace function public.save_site_content(p_content jsonb,p_publish boolean,p_actor uuid,p_expected_version integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare next_version integer;
begin
 if not exists(select 1 from public.admin_roles where user_id=p_actor and enabled and role in ('editor','admin'))
 or (p_publish and not exists(select 1 from public.admin_roles where user_id=p_actor and enabled and role='admin')) then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.site_content where id=1 for update;
 if exists(select 1 from public.media_assets m where m.archived_at is not null and exists(select 1 from jsonb_path_query(p_content,'$.**.image') i where i#>>'{}'=m.url)) then raise exception 'archived asset' using errcode='23514'; end if;
 update public.site_content set draft=p_content,published=case when p_publish then p_content else published end,version=version+1,updated_at=now() where id=1 and version=p_expected_version returning version into next_version;
 if next_version is null then raise exception 'version conflict' using errcode='40001'; end if;
 insert into public.audit_log(actor_id,action,target) values(p_actor,case when p_publish then 'content.publish' else 'content.draft' end,'site');return next_version;
end $$;
create or replace function public.archive_media(p_url text,p_actor uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.admin_roles where user_id=p_actor and enabled and role='admin') then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.site_content where id=1 for update;
 if exists(select 1 from public.site_content c,jsonb_path_query(jsonb_build_array(c.draft,c.published),'$.**.image') i where i#>>'{}'=p_url) then raise exception 'asset in use' using errcode='23514'; end if;
 update public.media_assets set archived_at=now() where url=p_url and archived_at is null;
 if not found then raise exception 'not found' using errcode='P0002'; end if;
 insert into public.audit_log(actor_id,action,target) values(p_actor,'media.archive',p_url);
end $$;
commit;
