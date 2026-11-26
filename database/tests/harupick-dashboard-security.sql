-- Dashboard aggregate contract/security regression. All fixtures are rolled back.
-- Uses existing Auth accounts/sessions; never creates or modifies Auth data.
begin;
do $test$
declare
 aid uuid; sid uuid; other_id uuid; other_confirmed boolean;
 cutoff timestamptz:=statement_timestamp();
 today_kst date:=(cutoff at time zone 'Asia/Seoul')::date;
 day_start timestamptz; first7 timestamptz; first30 timestamptz;
 baseline7 jsonb; baseline30 jsonb; result7 jsonb; result30 jsonb;
 trip_ids uuid[]:=array[]::uuid[]; fixture_id uuid; event_a uuid:=gen_random_uuid(); event_d uuid:=gen_random_uuid(); event_e uuid:=gen_random_uuid();
 travel date; made_at timestamptz; state text; payload jsonb;
 other_members bigint; other_member_days7 bigint; other_member_days30 bigint; audit_before bigint;
begin
 select a.user_id,s.id into aid,sid from public.harupick_administrators a
 join auth.users u on u.id=a.user_id join auth.sessions s on s.user_id=u.id
 where a.is_active and u.email_confirmed_at is not null and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now()) and (s.not_after is null or s.not_after>now()) limit 1;
 if aid is null then raise exception 'Existing administrator live session required'; end if;
 select u.id,u.email_confirmed_at is not null into other_id,other_confirmed from auth.users u
 where u.id<>aid and u.deleted_at is null and not exists(select 1 from public.harupick_administrators a where a.user_id=u.id and a.is_active) limit 1;
 if other_id is null then raise exception 'Existing nonadministrator Auth account required'; end if;
 day_start:=today_kst::timestamp at time zone 'Asia/Seoul';
 first7:=(today_kst-6)::timestamp at time zone 'Asia/Seoul';
 first30:=(today_kst-29)::timestamp at time zone 'Asia/Seoul';
 perform set_config('request.jwt.claims',jsonb_build_object('sub',aid,'session_id',sid,'role','authenticated')::text,true);
 set local role authenticated;
 baseline7:=public.harupick_admin_dashboard();
 baseline30:=public.harupick_admin_dashboard(30);
 if baseline7->>'timezone'<>'Asia/Seoul' or baseline7->>'trend_until'<>today_kst::text
   or baseline7->>'trend_from'<>(today_kst-6)::text or baseline30->>'trend_from'<>(today_kst-29)::text
   or jsonb_array_length(baseline7#>'{trends,member_registrations}')<>7
   or jsonb_array_length(baseline30#>'{trends,trip_creations}')<>30
   or baseline7->'metrics'<>baseline30->'metrics' then raise exception 'Date metadata, zero-fill, or fixed metric range failed'; end if;
 if (baseline7#>>'{metrics,registered_members}')::bigint=0 and exists(select 1 from jsonb_array_elements(baseline7#>'{trends,member_registrations}') r where (r->>'count')::bigint<>0) then raise exception 'Genuine empty member trend failed'; end if;
 begin perform public.harupick_admin_dashboard(14); raise exception 'Unsupported days accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.harupick_admin_dashboard(null); raise exception 'Null days accepted'; exception when invalid_parameter_value then null; end;
 reset role;
 select count(*),
   count(*) filter(where m.created_at>=first7 and m.created_at<=cutoff),
   count(*) filter(where m.created_at>=first30 and m.created_at<=cutoff)
 into other_members,other_member_days7,other_member_days30
 from public.harupick_members m join auth.users u on u.id=m.id
 where m.id not in(aid,other_id) and u.email_confirmed_at is not null and u.deleted_at is null;
 -- Profile timestamps are test-only changes to Harupick data, restored by rollback.
 insert into public.harupick_members(id,nickname,created_at) values
   (aid,'대시보드검증관리자',day_start),(other_id,'대시보드검증회원',first7-interval '1 microsecond')
 on conflict(id) do update set nickname=excluded.nickname,created_at=excluded.created_at;
 payload:=jsonb_build_object('id','dashboard-test','itinerary',jsonb_build_object('title','집계 검증','date','','stops',jsonb_build_array(jsonb_build_object('index',0,'note','PRIVATE_DASHBOARD_NOTE'))),'budget',null,'checklist','[]'::jsonb);
 for i in 0..9 loop
   fixture_id:=gen_random_uuid();trip_ids:=array_append(trip_ids,fixture_id);
   travel:=case i when 0 then today_kst-1 when 1 then today_kst when 2 then today_kst+29 when 3 then today_kst+30 when 4 then null when 5 then today_kst else today_kst+(i-5) end;
   made_at:=case i when 0 then day_start-interval '1 microsecond' when 1 then first7 when 2 then first7-interval '1 microsecond'
     when 3 then first30-interval '1 microsecond' when 4 then day_start when 5 then first30 when 7 then cutoff+interval '1 day' else cutoff-interval '1 second' end;
   state:=case when i=5 then 'archived' else 'active' end;
   insert into public.harupick_trips(id,owner_id,local_id,title,travel_date,status,snapshot,created_at)
   values(fixture_id,aid,'dashboard-test-'||fixture_id::text,'집계검증 '||i,travel,state,payload,made_at);
 end loop;
 -- Controlled timestamps exercise inclusive KST boundaries and microsecond ordering.
 insert into harupick_private.audit_events(id,occurred_at,event,actor_id,actor_type,actor_label,target_type,target_id,target_label,changed_fields)
 values
   (event_a,first7,'trip.updated',aid,'admin','집계검증','trip',trip_ids[1],'경계 포함',array['title']),
   (gen_random_uuid(),first7-interval '1 microsecond','trip.updated',aid,'admin','집계검증','trip',trip_ids[1],'경계 제외',array['title']),
   (gen_random_uuid(),cutoff+interval '1 day','trip.updated',aid,'admin','집계검증','trip',trip_ids[1],'미래 제외',array['title']),
   (event_d,cutoff-interval '1 microsecond','trip.updated',aid,'admin','집계검증','trip',trip_ids[1],'동일 시각 정렬',array['title']),
   (event_e,cutoff-interval '1 microsecond','trip.updated',aid,'admin','집계검증','trip',trip_ids[1],'동일 시각 정렬',array['title']),
   (gen_random_uuid(),first30,'trip.updated',aid,'admin','집계검증','trip',trip_ids[1],'오래된 기록 포함',array['title']),
   (gen_random_uuid(),first30-interval '1 microsecond','trip.updated',aid,'admin','집계검증','trip',trip_ids[1],'목록 상한 검증',array['title']);
 select count(*) into audit_before from harupick_private.audit_events;
 set local role authenticated;
 result7:=public.harupick_admin_dashboard(7);
 result30:=public.harupick_admin_dashboard(30);
 if result7->'metrics'<>result30->'metrics' or result7->>'as_of'<>result30->>'as_of' then raise exception 'Single cutoff/fixed metrics failed'; end if;
 if (result7#>>'{metrics,registered_members}')::bigint<>other_members+1+ (case when other_confirmed then 1 else 0 end) then raise exception 'Harupick verified membership population failed'; end if;
 if (result7#>>'{metrics,total_trips}')::bigint<>(baseline7#>>'{metrics,total_trips}')::bigint+10
 or (result7#>>'{metrics,active_trips}')::bigint<>(baseline7#>>'{metrics,active_trips}')::bigint+9
 or (result7#>>'{metrics,archived_trips}')::bigint<>(baseline7#>>'{metrics,archived_trips}')::bigint+1
 or (result7#>>'{metrics,upcoming_trips_30d}')::bigint<>(baseline7#>>'{metrics,upcoming_trips_30d}')::bigint+6 then raise exception 'Trip counts or 30-date boundary failed'; end if;
 if (result7#>>'{metrics,changes_7d}')::bigint<>(baseline7#>>'{metrics,changes_7d}')::bigint+3 then raise exception 'Audit KST boundary or future cutoff failed'; end if;
 if (select sum((r->>'count')::bigint) from jsonb_array_elements(result7#>'{trends,member_registrations}') r)<>other_member_days7+1
 or (select sum((r->>'count')::bigint) from jsonb_array_elements(result30#>'{trends,member_registrations}') r)<>other_member_days30+1+ (case when other_confirmed then 1 else 0 end) then raise exception 'Profile registration KST boundary failed'; end if;
 if (select sum((r->>'count')::bigint) from jsonb_array_elements(result7#>'{trends,trip_creations}') r)<>(select sum((r->>'count')::bigint) from jsonb_array_elements(baseline7#>'{trends,trip_creations}') r)+6
 or (select sum((r->>'count')::bigint) from jsonb_array_elements(result30#>'{trends,trip_creations}') r)<>(select sum((r->>'count')::bigint) from jsonb_array_elements(baseline30#>'{trends,trip_creations}') r)+8 then raise exception 'Trip creation KST boundary or future timestamp failed'; end if;
 if jsonb_array_length(result7->'upcoming_trips')<>5 or jsonb_array_length(result7->'recent_changes')<>5 then raise exception 'Summary bounds failed'; end if;
 if (result7#>>'{recent_changes,0,id}')::uuid<>greatest(event_d,event_e) then raise exception 'Stable recent-event ordering failed'; end if;
 if exists(select 1 from jsonb_array_elements(result7->'upcoming_trips') r where (r->>'travel_date')::date<today_kst or (r->>'travel_date')::date>=today_kst+30) then raise exception 'Excluded dates leaked into upcoming list'; end if;
 if exists(select 1 from jsonb_array_elements(result7->'upcoming_trips') r where (select count(*) from jsonb_object_keys(r))<>4)
 or exists(select 1 from jsonb_array_elements(result7->'recent_changes') r where (select count(*) from jsonb_object_keys(r))<>6)
 or result7::text like '%PRIVATE_DASHBOARD_NOTE%' or result7::text like '%email_confirmed_at%' then raise exception 'Dashboard private fields exposed'; end if;
 -- These functions remain invoker wrappers; clients cannot elevate permissions.
 reset role;
 if (select count(*) from harupick_private.audit_events)<>audit_before then raise exception 'Read API generated audit writes'; end if;
 if exists(select 1 from pg_proc where oid='public.harupick_admin_dashboard(integer)'::regprocedure and (prosecdef or provolatile<>'s'))
 or has_function_privilege('anon','public.harupick_admin_dashboard(integer)','EXECUTE') then raise exception 'RPC privilege hardening failed'; end if;
 update public.harupick_administrators set is_active=false where user_id=aid;
 set local role authenticated;
 begin perform public.harupick_admin_dashboard(); raise exception 'Revoked grant bypass'; exception when insufficient_privilege then null; end;
 reset role;
 update public.harupick_administrators set is_active=true where user_id=aid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'session_id',sid,'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
 set local role authenticated;
 begin perform public.harupick_admin_dashboard(); raise exception 'Normal member/metadata bypass'; exception when insufficient_privilege then null; end;
 begin perform harupick_private.dashboard(7); raise exception 'Private helper bypass'; exception when insufficient_privilege then null; end;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',aid,'session_id','00000000-0000-4000-8000-000000000000','role','authenticated')::text,true);
 set local role authenticated;
 begin perform public.harupick_admin_dashboard(); raise exception 'Ended session bypass'; exception when insufficient_privilege then null; end;
 reset role;
 set local role anon;
 begin perform public.harupick_admin_dashboard(); raise exception 'Anonymous bypass'; exception when insufficient_privilege then null; end;
 reset role;
end;
$test$;
rollback;
select 'PASS: dashboard counts, KST midnight/7-day/30-day boundaries, zero-fill, upcoming exclusions, 5-row summaries, minimal fields, read-only behavior and revoked/normal/ended-session/anon denial; all fixtures rolled back' as verification;

