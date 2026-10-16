-- Additive JSON document guard. No data rewrite, no new client grants, no policy relaxation.
-- Existing site_content/history JSONB stores optional banner and partners fields.
-- Every logo/banner uses the existing .image key, so recursive archival and
-- restoration checks in write_site_content/archive_media continue to apply.
begin;
create function public.guard_homepage_visuals() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare doc jsonb; p jsonb; b jsonb; ids text[]; names text[]; normalized_name text;
begin
 foreach doc in array array[new.published,new.draft] loop
  if doc is null then continue; end if;
  if doc ? 'partners' then
   if jsonb_typeof(doc->'partners') <> 'array' or jsonb_array_length(doc->'partners')>100 then
    raise exception 'invalid partner list' using errcode='23514';
   end if;
   ids:=array[]::text[]; names:=array[]::text[];
   for p in select value from jsonb_array_elements(doc->'partners') loop
    if jsonb_typeof(p) is distinct from 'object' or coalesce(p->>'slug','')!~'^[a-z0-9]+(-[a-z0-9]+)*$' or (p->>'slug')=any(ids)
     or coalesce(p->>'status','') not in ('draft','published','hidden','archived')
     or coalesce(p->>'identity','') not in ('unconfirmed','confirmed')
     or coalesce(p->>'rights','') not in ('unverified','owner-authorized','official-permission') then
     raise exception 'invalid partner' using errcode='23514';
    end if;
    normalized_name:=lower(btrim(coalesce(p->>'name','')));
    if normalized_name='' or length(normalized_name)>150 or normalized_name=any(names) then
     raise exception 'invalid or duplicate partner name' using errcode='23514';
    end if;
    names:=array_append(names,normalized_name);
    ids:=array_append(ids,p->>'slug');
    if p->>'status'='published' and (
     p->>'identity'<>'confirmed' or coalesce(p->'relationshipConfirmed','null'::jsonb)<>'true'::jsonb
     or (p ? 'image' and (p->>'rights'='unverified' or coalesce(btrim(p->>'provenance'),'')=''
      or (p->>'rights'='official-permission' and coalesce(p->>'sourceUrl','')!~'^https://')))) then
     raise exception 'unconfirmed partner publication' using errcode='23514';
    end if;
   end loop;
  end if;
  if doc ? 'banner' then
   b:=doc->'banner';
   if jsonb_typeof(b) is distinct from 'object' or jsonb_typeof(b->'enabled') is distinct from 'boolean'
    or jsonb_typeof(b->'desktop') is distinct from 'object' then
    raise exception 'invalid banner' using errcode='23514';
   end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.guard_homepage_visuals() from public,anon,authenticated,service_role;
create trigger site_content_homepage_visuals before insert or update of published,draft on public.site_content
 for each row execute function public.guard_homepage_visuals();
commit;
