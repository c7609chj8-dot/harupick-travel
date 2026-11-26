-- Existing Auth accounts/sessions only; all Harupick fixtures roll back.
begin;
do $test$
declare
 aid uuid; sid uuid; other_id uuid; marker text:='회원필터_%검증'; result jsonb; old_result jsonb;
 day_start timestamptz:=timestamptz '2026-11-25 15:00:00+00';
 sample_time timestamptz; expected bigint; state text; asc_result jsonb; desc_result jsonb;
 before_audit bigint; before_members bigint; before_auth bigint; baseline jsonb; changed jsonb;
begin
 select a.user_id,s.id into aid,sid from public.harupick_administrators a
 join auth.users u on u.id=a.user_id join auth.sessions s on s.user_id=u.id
 where a.is_active and u.email_confirmed_at is not null and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now()) and (s.not_after is null or s.not_after>now()) limit 1;
 if aid is null then raise exception 'Existing administrator live session required'; end if;
 select u.id into other_id from auth.users u where u.id<>aid and u.deleted_at is null
 and not exists(select 1 from public.harupick_administrators a where a.user_id=u.id and a.is_active) limit 1;
 if other_id is null then raise exception 'Existing nonadministrator Auth account required'; end if;
 select count(*) into before_auth from auth.users;
 select count(*) into before_members from public.harupick_members;
 select count(*) into before_audit from harupick_private.audit_events;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',aid,'session_id',sid,'role','authenticated')::text,true);
 set local role authenticated;
 old_result:=public.harupick_admin_members();result:=public.harupick_admin_members_filtered();
 if old_result<>result then raise exception 'Default compatibility failed'; end if;
 reset role;
 insert into public.harupick_members(id,nickname,created_at) values (aid,marker||'관리자',day_start),(other_id,marker||'회원',day_start)
 on conflict(id) do update set nickname=excluded.nickname,created_at=excluded.created_at;
 -- Each case isolates one member with literal percent/underscore in its nickname.
 foreach sample_time in array array[day_start-interval '1 microsecond',day_start,day_start+interval '1 day'-interval '1 microsecond',day_start+interval '1 day'] loop
  update public.harupick_members set created_at=sample_time where id=aid;
  expected:=case when sample_time>=day_start and sample_time<day_start+interval '1 day' then 1 else 0 end;
  set local role authenticated;
  result:=public.harupick_admin_members_filtered(marker||'관리자',1,20,'all',date '2026-11-26',date '2026-11-26','created_desc');
  if (result->>'total')::bigint<>expected or jsonb_array_length(result->'members')<>expected then raise exception 'KST date boundary failed'; end if;
  reset role;
 end loop;
 update public.harupick_members set created_at=day_start where id in(aid,other_id);
 set local role authenticated;
 asc_result:=public.harupick_admin_members_filtered(marker,1,20,'all',null,null,'created_asc');
 desc_result:=public.harupick_admin_members_filtered(marker,1,20,'all',null,null,'created_desc');
 if (asc_result->>'total')::integer<>2 or (asc_result#>>'{members,0,id}')::uuid<>least(aid,other_id)
 or (desc_result#>>'{members,0,id}')::uuid<>greatest(aid,other_id) then raise exception 'Literal search or deterministic ties failed'; end if;
 result:=public.harupick_admin_members_filtered(marker,999,1,'all',null,null,'created_asc');
 if (result->>'page')::integer<>2 or (result->>'pages')::integer<>2 or jsonb_array_length(result->'members')<>1
 or (result#>>'{members,0,id}')::uuid<>greatest(aid,other_id) then raise exception 'Count/page clipping failed'; end if;
 result:=public.harupick_admin_members_filtered('not-present-'||aid::text,999,20,'all',null,null,'created_desc');
 if result->>'total'<>'0' or result->>'page'<>'1' or result->>'pages'<>'1' or result->'members'<>'[]'::jsonb then raise exception 'Empty results failed'; end if;
 reset role;
 -- Compare every state against existing Auth data without modifying Auth rows.
 foreach state in array array['active','unconfirmed','suspended','deleted'] loop
  select count(*) into expected from public.harupick_members m join auth.users u on u.id=m.id
  where strpos(lower(m.nickname),lower(marker))>0 and
   case when u.deleted_at is not null then 'deleted' when u.banned_until>statement_timestamp() then 'suspended'
    when u.email_confirmed_at is null then 'unconfirmed' else 'active' end=state;
  set local role authenticated;
  result:=public.harupick_admin_members_filtered(marker,1,20,state,null,null,'created_desc');
  if (result->>'total')::bigint<>expected or exists(select 1 from jsonb_array_elements(result->'members') r where r->>'status'<>state) then raise exception 'State filter/count failed: %',state; end if;
  reset role;
 end loop;
 set local role authenticated;
 -- Input failures are errors, never successful empty pages.
 begin perform public.harupick_admin_members_filtered(p_status=>'admin');raise exception 'Invalid status accepted';exception when invalid_parameter_value then null;end;
 begin perform public.harupick_admin_members_filtered(p_status=>null);raise exception 'Null status accepted';exception when invalid_parameter_value then null;end;
 begin perform public.harupick_admin_members_filtered(p_sort=>'created_at;drop');raise exception 'Invalid sort accepted';exception when invalid_parameter_value then null;end;
 begin perform public.harupick_admin_members_filtered(p_page=>0);raise exception 'Invalid page accepted';exception when invalid_parameter_value then null;end;
 begin perform public.harupick_admin_members_filtered(p_page_size=>51);raise exception 'Invalid size accepted';exception when invalid_parameter_value then null;end;
 begin perform public.harupick_admin_members_filtered(p_from=>date '2026-11-27',p_until=>date '2026-11-26');raise exception 'Reversed range accepted';exception when invalid_parameter_value then null;end;
 begin perform public.harupick_admin_members_filtered(p_from=>'infinity'::date);raise exception 'Infinite date accepted';exception when invalid_parameter_value then null;end;
 result:=public.harupick_admin_members_filtered(marker);
 if exists(select 1 from jsonb_array_elements(result->'members') r where (select count(*) from jsonb_object_keys(r))<>6)
 or result::text like '%last_sign_in_at%' or result::text like '%raw_user_meta_data%' then raise exception 'Private fields exposed'; end if;
 reset role;
 baseline:=jsonb_build_object('members',(select count(*) from public.harupick_members),'audit',(select count(*) from harupick_private.audit_events),'auth',(select count(*) from auth.users));
 set local role authenticated;
 perform public.harupick_admin_members_filtered(marker);
 reset role;
 changed:=jsonb_build_object('members',(select count(*) from public.harupick_members),'audit',(select count(*) from harupick_private.audit_events),'auth',(select count(*) from auth.users));
 if baseline<>changed or (select count(*) from auth.users)<>before_auth or (select count(*) from harupick_private.audit_events)<>before_audit then raise exception 'Read API wrote data'; end if;
 if (select prosecdef from pg_proc where oid='public.harupick_admin_members_filtered(text,integer,integer,text,date,date,text)'::regprocedure)
 or has_function_privilege('anon','public.harupick_admin_members_filtered(text,integer,integer,text,date,date,text)','EXECUTE') then raise exception 'Public privilege hardening failed'; end if;
 update public.harupick_administrators set is_active=false where user_id=aid;
 set local role authenticated;
 begin perform public.harupick_admin_members_filtered();raise exception 'Revoked admin accepted';exception when insufficient_privilege then null;end;
 reset role;
 update public.harupick_administrators set is_active=true where user_id=aid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'session_id',sid,'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
 set local role authenticated;
 begin perform public.harupick_admin_members_filtered();raise exception 'Normal member accepted';exception when insufficient_privilege then null;end;
 begin perform harupick_private.admin_members_filtered('',1,20,'all',null,null,'created_desc');raise exception 'Private bypass';exception when insufficient_privilege then null;end;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',aid,'session_id','00000000-0000-4000-8000-000000000000','role','authenticated')::text,true);
 set local role authenticated;
 begin perform public.harupick_admin_members_filtered();raise exception 'Ended session accepted';exception when insufficient_privilege then null;end;
 reset role;
 set local role anon;
 begin perform public.harupick_admin_members_filtered();raise exception 'Anonymous accepted';exception when insufficient_privilege then null;end;
 reset role;
end;
$test$;
rollback;
select 'PASS: member filters, literal search, KST inclusive boundaries, stable sorting, filtered totals/page clipping, old API compatibility, minimal fields/read-only, revoked/normal/ended/anonymous denial; all fixtures rolled back' as verification;
