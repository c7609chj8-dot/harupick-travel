-- Rollback-only security regression test. Requires an existing administrator live session.
-- Does not create Auth users, credentials, sessions, or persistent fixture data.
begin;
do $test$
declare
 aid uuid; sid uuid; other_id uuid; tid uuid; log_id uuid;
 payload jsonb; result jsonb; detail jsonb; count_before bigint;
 today_kst date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
begin
 select a.user_id,s.id into aid,sid from public.harupick_administrators a
 join auth.users u on u.id=a.user_id join auth.sessions s on s.user_id=u.id
 where a.is_active and u.email_confirmed_at is not null and u.deleted_at is null
   and (u.banned_until is null or u.banned_until<=now()) and (s.not_after is null or s.not_after>now()) limit 1;
 if aid is null then raise exception 'Existing administrator live session required'; end if;
 select id into other_id from auth.users where id<>aid limit 1;
 if other_id is null then raise exception 'Existing second Auth account required'; end if;
 insert into public.harupick_members(id,nickname) values(aid,'감사검증관리자'),(other_id,'감사검증회원') on conflict do nothing;
 payload:=jsonb_build_object('id','audit-security-test','itinerary',jsonb_build_object('title','감사_%보안검증','date','2026-12-01','stops',
   jsonb_build_array(jsonb_build_object('index',0,'time','09:00','note','PRIVATE_NOTE_SHOULD_NOT_APPEAR'))),'budget',null,'checklist',jsonb_build_array('hours'));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',aid,'session_id',sid,'role','authenticated')::text,true);
 set local role authenticated;
 result:=public.harupick_trip_action('save',jsonb_build_object('owner_id',aid,'local_id','audit-security-test','title','감사_%보안검증','snapshot',payload));
 tid:=(result->>'id')::uuid;
 result:=public.harupick_admin_audit('감사_%','trip.created',1,today_kst,today_kst,null);
 if (result->>'total')::integer<>1 then raise exception 'Create audit or literal search/date filter failed'; end if;
 log_id:=(result#>>'{events,0,id}')::uuid;
 if result#>'{events,0,before_data}' is not null then raise exception 'List leaked detail payload'; end if;
 detail:=public.harupick_admin_audit(p_id=>log_id);
 if detail->>'actor_id'<>aid::text or detail->>'actor_type'<>'admin' or detail->>'target_id'<>tid::text
   or detail#>>'{after_data,title}'<>'감사_%보안검증' or detail->'before_data'<>'null'::jsonb then
   raise exception 'Actor or before/after detail failed';
 end if;
 if detail::text like '%PRIVATE_NOTE_SHOULD_NOT_APPEAR%' or (detail->'after_data')?'snapshot'
   or (select count(*) from jsonb_object_keys(detail->'after_data'))<>4 then raise exception 'Sensitive payload stored in audit'; end if;
 perform public.harupick_trip_action('admin_update',jsonb_build_object('id',tid,'revision',1,'title','감사_%수정검증','date','2026-12-02','status','archived'));
 detail:=public.harupick_admin_audit('감사_%','trip.archived',1,today_kst,today_kst,null);
 if detail->>'total'<>'1' then raise exception 'Archive audit missing'; end if;
 detail:=public.harupick_admin_audit(p_id=>(detail#>>'{events,0,id}')::uuid);
 if detail#>>'{before_data,status}'<>'active' or detail#>>'{after_data,status}'<>'archived'
   or detail#>>'{before_data,travel_date}'<>'2026-12-01' or detail#>>'{after_data,travel_date}'<>'2026-12-02' then raise exception 'Before/after values incorrect'; end if;
 begin
   perform public.harupick_trip_action('admin_update',jsonb_build_object('id',tid,'revision',1,'title','stale','date','','status','active'));
   raise exception 'Stale write accepted';
 exception when serialization_failure then null; end;
 result:=public.harupick_admin_audit('감사_%','all',1,null,null,null);
 if result->>'total'<>'2' then raise exception 'Failed write created audit event'; end if;
 perform public.harupick_trip_action('admin_update',jsonb_build_object('id',tid,'revision',2,'title','감사_%수정검증','date','','status','active'));
 result:=public.harupick_admin_audit('감사_%','trip.restored',1,null,null,null);
 if result->>'total'<>'1' then raise exception 'Restore audit missing'; end if;
 result:=public.harupick_admin_audit('감사_%','all',999,null,null,null);
 if result->>'page'<>'1' then raise exception 'Page clamp failed'; end if;
 if public.harupick_admin_audit(p_id=>'00000000-0000-4000-8000-000000000000') is not null then raise exception 'Missing audit detail incorrect'; end if;
 begin perform public.harupick_admin_audit(p_query=>repeat('x',101)); raise exception 'Long query allowed'; exception when invalid_parameter_value then null; end;
 begin perform public.harupick_admin_audit(p_event=>'invalid'); raise exception 'Invalid event allowed'; exception when invalid_parameter_value then null; end;
 begin perform public.harupick_admin_audit(p_from=>today_kst,p_until=>today_kst-1); raise exception 'Reverse dates allowed'; exception when invalid_parameter_value then null; end;
 begin select count(*) into count_before from harupick_private.audit_events; raise exception 'Direct log read allowed'; exception when insufficient_privilege then null; end;
 begin insert into harupick_private.audit_events(event) values('trip.created'); raise exception 'Log forgery allowed'; exception when insufficient_privilege then null; end;
 begin update harupick_private.audit_events set actor_label='forged' where id=log_id; raise exception 'Log editing allowed'; exception when insufficient_privilege then null; end;
 begin delete from harupick_private.audit_events where id=log_id; raise exception 'Log deletion allowed'; exception when insufficient_privilege then null; end;
 begin perform harupick_private.capture_audit_event(); raise exception 'Direct audit capture allowed'; exception when insufficient_privilege then null; end;
 -- A rolled-back operation must leave neither the write nor its audit event.
 reset role;
 select count(*) into count_before from harupick_private.audit_events;
 begin
   update public.harupick_trips set title='ROLLBACK_ONLY' where id=tid;
   raise exception 'Rollback fixture' using errcode='P0004';
 exception when assert_failure then null; end;
 if (select count(*) from harupick_private.audit_events)<>count_before or (select title from public.harupick_trips where id=tid)='ROLLBACK_ONLY' then raise exception 'Audit not atomic'; end if;
 -- Future deletion retains the audit target and summary without a cascading FK.
 delete from public.harupick_trips where id=tid;
 if not exists(select 1 from harupick_private.audit_events where target_id=tid and event='trip.deleted') then raise exception 'Delete audit missing'; end if;
 -- Use a separate role fixture; no real privilege survives rollback.
 insert into public.harupick_administrators(user_id,is_active) values(other_id,true);
 update public.harupick_administrators set is_active=false where user_id=other_id;
 delete from public.harupick_administrators where user_id=other_id;
 if (select count(*) from harupick_private.audit_events where target_id=other_id and target_type='administrator')<>3 then raise exception 'Grant/revoke/remove audit missing'; end if;
 -- Revocation is effective even for the same existing access token.
 update public.harupick_administrators set is_active=false where user_id=aid;
 set local role authenticated;
 begin perform public.harupick_admin_audit(); raise exception 'Revoked administrator could list'; exception when insufficient_privilege then null; end;
 begin perform public.harupick_admin_audit(p_id=>log_id); raise exception 'Revoked administrator could read detail'; exception when insufficient_privilege then null; end;
 reset role;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'session_id',sid,'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
 set local role authenticated;
 begin perform public.harupick_admin_audit(); raise exception 'Metadata admin bypass'; exception when insufficient_privilege then null; end;
 begin perform public.harupick_admin_audit(p_id=>log_id); raise exception 'Nonadmin detail bypass'; exception when insufficient_privilege then null; end;
 reset role;
 update public.harupick_administrators set is_active=true where user_id=aid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',aid,'session_id','00000000-0000-4000-8000-000000000000','role','authenticated')::text,true);
 set local role authenticated;
 begin perform public.harupick_admin_audit(); raise exception 'Ended session bypass'; exception when insufficient_privilege then null; end;
 reset role;
 set local role anon;
 begin perform public.harupick_admin_audit(); raise exception 'Anonymous log access'; exception when insufficient_privilege then null; end;
 reset role;
end;
$test$;
rollback;
select 'PASS: automatic trip/role events, before/after values, privacy, atomic rollback, filters, direct read/forgery/edit/delete denial, revoked/nonadmin/ended-session/anonymous denial; no persistent fixtures' as verification;
