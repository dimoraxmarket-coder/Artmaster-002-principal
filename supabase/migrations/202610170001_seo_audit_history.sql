-- Additive, bounded diagnostic history. No existing customer/content/audit data changes.
-- Review and apply ONLY in approved synthetic Supabase staging first.
begin;
create table public.seo_audit_history (
 id bigint generated always as identity primary key,
 origin text not null check(length(origin)<=250),
 path text not null check(path ~ '^/(ro|ru|en)(/[a-z0-9-]+)*$'),
 formula integer not null check(formula=2),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 actor uuid not null,
 created_at timestamptz not null default now(),
 result jsonb not null check(octet_length(result::text)<=65536)
);
create index seo_history_lookup on public.seo_audit_history(origin,formula,id desc);
alter table public.seo_audit_history enable row level security;
revoke all on public.seo_audit_history from public,anon,authenticated;
grant select on public.seo_audit_history to service_role;
create function public.record_seo_audit(p_origin text,p_path text,p_result jsonb,p_actor uuid,p_fingerprint text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.admin_roles where user_id=p_actor and enabled and role in ('viewer','editor','admin')) then raise exception 'forbidden' using errcode='42501'; end if;
 if not coalesce(p_origin is not null and p_result->>'path'=p_path and (p_result->>'formulaVersion')::integer=2 and jsonb_typeof(p_result->'checks')='array' and jsonb_array_length(p_result->'checks')=14 and (p_result->>'score')::integer between 0 and 100 and p_fingerprint ~ '^[a-f0-9]{64}$',false) then raise exception 'invalid audit' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(189133017);
 insert into public.seo_audit_history(origin,path,formula,fingerprint,actor,result) values(p_origin,p_path,2,p_fingerprint,p_actor,p_result);
 delete from public.seo_audit_history where created_at<now()-interval '30 days' or id not in(select id from public.seo_audit_history order by id desc limit 2000);
end $$;
revoke all on function public.record_seo_audit(text,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.record_seo_audit(text,text,jsonb,uuid,text) to service_role;
commit;
