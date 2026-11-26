-- Harupick schema reference for a fresh Supabase database.
-- Applied remote migrations are tracked by Supabase; do not re-run on an existing installation.
-- Auth passwords and email addresses are managed by Supabase Auth, not this profile table.
create schema if not exists harupick_private;
revoke all on schema harupick_private from public, anon, authenticated;

create table public.harupick_members (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null
    constraint harupick_members_nickname_length check (char_length(nickname) between 2 and 30)
    constraint harupick_members_nickname_trimmed check (nickname = btrim(nickname)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.harupick_members is '하루픽 회원 프로필. 이메일과 비밀번호 인증은 Supabase Auth에서 관리합니다.';
comment on column public.harupick_members.id is 'Supabase Auth 사용자 ID. 인증 사용자 삭제 시 프로필도 삭제됩니다.';
comment on column public.harupick_members.nickname is '하루픽 표시 이름, 2~30자. 로그인 식별자로 사용하지 않습니다.';

alter table public.harupick_members enable row level security;

revoke all on table public.harupick_members from public, anon, authenticated;
grant select on table public.harupick_members to authenticated;
grant insert (id, nickname) on table public.harupick_members to authenticated;
grant update (nickname) on table public.harupick_members to authenticated;
grant all on table public.harupick_members to service_role;

create policy harupick_members_select_own
on public.harupick_members for select to authenticated
using ((select auth.uid()) = id);

create policy harupick_members_insert_own
on public.harupick_members for insert to authenticated
with check ((select auth.uid()) = id);

create policy harupick_members_update_own
on public.harupick_members for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create function harupick_private.touch_member_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

revoke all on function harupick_private.touch_member_updated_at() from public, anon, authenticated;

create trigger harupick_members_touch_updated_at
before update on public.harupick_members
for each row execute function harupick_private.touch_member_updated_at();

create function harupick_private.create_member_after_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  member_nickname text;
begin
  if tg_table_schema <> 'auth' or tg_table_name <> 'users' then
    raise exception 'Invalid trigger source';
  end if;
  if coalesce(new.raw_user_meta_data->>'harupick_app', '') <> 'harupick' then
    return new;
  end if;
  member_nickname := btrim(coalesce(new.raw_user_meta_data->>'harupick_nickname', ''));
  if char_length(member_nickname) not between 2 and 30 or member_nickname !~ '[^[:space:]]' then
    raise exception 'Harupick nickname must contain 2 to 30 characters';
  end if;
  insert into public.harupick_members (id, nickname)
  values (new.id, member_nickname)
  on conflict (id) do nothing;
  return new;
end;
$function$;
revoke all on function harupick_private.create_member_after_signup() from public, anon, authenticated;
create trigger harupick_create_member_after_signup
after insert on auth.users
for each row execute function harupick_private.create_member_after_signup();

-- Day 1: administrator roles and live-session access checks.
create table public.harupick_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  granted_at timestamptz not null default now()
);
comment on table public.harupick_administrators is '하루픽 관리자 권한. 인증된 운영 도구에서만 부여 및 회수할 수 있습니다.';
alter table public.harupick_administrators enable row level security;
revoke all on table public.harupick_administrators from public, anon, authenticated;
grant select on table public.harupick_administrators to authenticated;
grant all on table public.harupick_administrators to service_role;
create policy harupick_admin_read_own
on public.harupick_administrators for select to authenticated
using ((select auth.uid()) = user_id);

create function harupick_private.is_current_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.harupick_administrators a
    join auth.users u on u.id = a.user_id
    join auth.sessions s on s.user_id = u.id
      and s.id = nullif((select auth.jwt())->>'session_id', '')::uuid
    where a.user_id = (select auth.uid())
      and a.is_active
      and u.email_confirmed_at is not null
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
      and (s.not_after is null or s.not_after > now())
  );
$function$;
revoke all on function harupick_private.is_current_admin() from public, anon;
grant usage on schema harupick_private to authenticated;
grant execute on function harupick_private.is_current_admin() to authenticated;

create function public.harupick_admin_context()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
begin
  if not harupick_private.is_current_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'user_id', (select auth.uid()),
    'role', 'admin',
    'capabilities', jsonb_build_array('access_admin_console')
  );
end;
$function$;
revoke all on function public.harupick_admin_context() from public, anon;
grant execute on function public.harupick_admin_context() to authenticated;

-- Day 2: bounded, read-only administrator member directory.
create index harupick_members_created_id_idx on public.harupick_members (created_at desc, id desc);

create function harupick_private.admin_members(p_query text, p_page integer, p_page_size integer)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  search_text text := lower(btrim(coalesce(p_query, '')));
  member_count bigint;
  current_page integer;
  page_count integer;
  rows_json jsonb;
begin
  if not harupick_private.is_current_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if char_length(search_text) > 100 or p_page is null or p_page < 1 or p_page > 1000000
     or p_page_size is null or p_page_size < 1 or p_page_size > 50 then
    raise exception 'Invalid directory parameters' using errcode = '22023';
  end if;
  select count(*) into member_count
  from public.harupick_members m join auth.users u on u.id = m.id
  where search_text = '' or strpos(lower(m.nickname), search_text) > 0
    or strpos(lower(coalesce(u.email, '')), search_text) > 0;
  page_count := greatest(1, ceil(member_count::numeric / p_page_size)::integer);
  current_page := least(p_page, page_count);
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc, r.id desc), '[]'::jsonb) into rows_json
  from (
    select m.id, m.nickname, u.email, m.created_at,
      u.email_confirmed_at is not null as email_confirmed,
      case when u.deleted_at is not null then 'deleted'
        when u.banned_until > now() then 'suspended'
        when u.email_confirmed_at is null then 'unconfirmed' else 'active' end as status
    from public.harupick_members m join auth.users u on u.id = m.id
    where search_text = '' or strpos(lower(m.nickname), search_text) > 0
      or strpos(lower(coalesce(u.email, '')), search_text) > 0
    order by m.created_at desc, m.id desc
    limit p_page_size offset ((current_page - 1)::bigint * p_page_size)
  ) r;
  return jsonb_build_object('members', rows_json, 'total', member_count,
    'page', current_page, 'page_size', p_page_size, 'pages', page_count);
end;
$function$;
revoke all on function harupick_private.admin_members(text, integer, integer) from public, anon;
grant execute on function harupick_private.admin_members(text, integer, integer) to authenticated;

create function harupick_private.admin_member(p_member_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare member_json jsonb;
begin
  if not harupick_private.is_current_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'id', m.id, 'nickname', m.nickname, 'email', u.email,
    'created_at', m.created_at, 'updated_at', m.updated_at,
    'email_confirmed_at', u.email_confirmed_at, 'last_sign_in_at', u.last_sign_in_at,
    'status', case when u.deleted_at is not null then 'deleted'
      when u.banned_until > now() then 'suspended'
      when u.email_confirmed_at is null then 'unconfirmed' else 'active' end
  ) into member_json
  from public.harupick_members m join auth.users u on u.id = m.id
  where m.id = p_member_id;
  return member_json;
end;
$function$;
revoke all on function harupick_private.admin_member(uuid) from public, anon;
grant execute on function harupick_private.admin_member(uuid) to authenticated;

create function public.harupick_admin_members(p_query text default '', p_page integer default 1, p_page_size integer default 20)
returns jsonb language sql stable security invoker set search_path = ''
as $function$
  select harupick_private.admin_members(p_query, p_page, p_page_size);
$function$;
revoke all on function public.harupick_admin_members(text, integer, integer) from public, anon;
grant execute on function public.harupick_admin_members(text, integer, integer) to authenticated;

create function public.harupick_admin_member(p_member_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $function$
  select harupick_private.admin_member(p_member_id);
$function$;
revoke all on function public.harupick_admin_member(uuid) from public, anon;
grant execute on function public.harupick_admin_member(uuid) to authenticated;

-- Day 3: account-owned trip snapshots, administrator editing and reversible archive.
create table public.harupick_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.harupick_members(id) on delete cascade,
  local_id text not null check (char_length(local_id) between 1 and 180),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  travel_date date,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 65536),
  status text not null default 'active' check (status in ('active','archived')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id,local_id)
);
create index harupick_trips_owner_updated_idx on public.harupick_trips(owner_id,updated_at desc,id desc);
create index harupick_trips_status_updated_idx on public.harupick_trips(status,updated_at desc,id desc);
alter table public.harupick_trips enable row level security;
revoke all on public.harupick_trips from public,anon,authenticated;
grant select on public.harupick_trips to authenticated;
grant all on public.harupick_trips to service_role;

create function harupick_private.is_current_member()
returns boolean language sql stable security definer set search_path=''
as $fn$
select exists(
 select 1 from public.harupick_members m join auth.users u on u.id=m.id
 join auth.sessions s on s.user_id=u.id and s.id=nullif((select auth.jwt())->>'session_id','')::uuid
 where m.id=(select auth.uid()) and u.email_confirmed_at is not null and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now()) and (s.not_after is null or s.not_after>now())
);
$fn$;
revoke all on function harupick_private.is_current_member() from public,anon;
grant execute on function harupick_private.is_current_member() to authenticated;
create policy harupick_trips_read_own on public.harupick_trips for select to authenticated
using(owner_id=(select auth.uid()) and (select harupick_private.is_current_member()));

create function harupick_private.trip_action(p_action text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
  admin_action boolean := left(coalesce(p_action,''),6)='admin_';
  uid uuid := (select auth.uid());
  row_data public.harupick_trips%rowtype;
  payload jsonb; result jsonb; search_text text; state_filter text;
  page_number integer; page_count integer; total_count bigint;
  title_text text; date_value date; local_key text; expected integer;
begin
  if admin_action then
    if not harupick_private.is_current_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  elsif not harupick_private.is_current_member() then
    raise exception 'Verified Harupick member with live session required' using errcode='42501';
  end if;
  if p_args is null or jsonb_typeof(p_args)<>'object' then raise exception 'Invalid arguments' using errcode='22023'; end if;
  -- Owner ID is explicit so an account switch cannot redirect a pending write.
  if not admin_action and (p_args->>'owner_id')::uuid is distinct from uid then
    raise exception 'Account changed' using errcode='42501';
  end if;

  if p_action in ('list','admin_list') then
    search_text:=lower(btrim(coalesce(p_args->>'query','')));
    state_filter:=coalesce(p_args->>'status','all');
    page_number:=coalesce((p_args->>'page')::integer,1);
    if char_length(search_text)>100 or page_number<1 or page_number>1000000 or state_filter not in ('all','active','archived') then
      raise exception 'Invalid list parameters' using errcode='22023';
    end if;
    select count(*) into total_count from public.harupick_trips t
    join public.harupick_members m on m.id=t.owner_id join auth.users u on u.id=m.id
    where (admin_action or t.owner_id=uid)
      and (state_filter='all' or t.status=state_filter)
      and (search_text='' or strpos(lower(t.title),search_text)>0
        or (admin_action and (strpos(lower(m.nickname),search_text)>0 or strpos(lower(coalesce(u.email,'')),search_text)>0)));
    page_count:=greatest(1,ceil(total_count::numeric/20)::integer);
    page_number:=least(page_number,page_count);
    select coalesce(jsonb_agg(r.data order by r.updated_at desc,r.id desc),'[]'::jsonb) into result from (
      select t.id,t.updated_at,
        jsonb_build_object('id',t.id,'local_id',t.local_id,'title',t.title,'travel_date',t.travel_date,
          'status',t.status,'revision',t.revision,'updated_at',t.updated_at)
        || case when admin_action then jsonb_build_object('owner_id',m.id,'nickname',m.nickname,'email',u.email) else '{}'::jsonb end as data
      from public.harupick_trips t join public.harupick_members m on m.id=t.owner_id join auth.users u on u.id=m.id
      where (admin_action or t.owner_id=uid) and (state_filter='all' or t.status=state_filter)
        and (search_text='' or strpos(lower(t.title),search_text)>0
          or (admin_action and (strpos(lower(m.nickname),search_text)>0 or strpos(lower(coalesce(u.email,'')),search_text)>0)))
      order by t.updated_at desc,t.id desc limit 20 offset ((page_number-1)::bigint*20)
    ) r;
    return jsonb_build_object('trips',result,'total',total_count,'page',page_number,'pages',page_count);
  elsif p_action in ('get','admin_get') then
    select * into row_data from public.harupick_trips
      where id=(p_args->>'id')::uuid and (admin_action or owner_id=uid);
    if not found then return null; end if;
    result:=to_jsonb(row_data);
    if admin_action then
      select result||jsonb_build_object('nickname',m.nickname,'email',u.email) into result
      from public.harupick_members m join auth.users u on u.id=m.id where m.id=row_data.owner_id;
    end if;
    return result;
  elsif p_action='save' then
    local_key:=p_args->>'local_id'; payload:=p_args->'snapshot';
    title_text:=btrim(p_args->>'title');
    expected:=(p_args->>'revision')::integer;
    if local_key is null or char_length(local_key) not between 1 and 180 or title_text is null or char_length(title_text) not between 1 and 80
       or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>65536
       or (payload->>'id') is distinct from local_key
       or jsonb_typeof(payload->'itinerary') is distinct from 'object'
       or jsonb_typeof(payload#>'{itinerary,stops}') is distinct from 'array'
       or jsonb_typeof(payload->'checklist') is distinct from 'array'
       or coalesce(jsonb_typeof(payload->'budget'),'missing') not in ('object','null')
       or jsonb_typeof(payload#>'{itinerary,date}') is distinct from 'string' then
      raise exception 'Invalid trip snapshot' using errcode='22023';
    end if;
    if jsonb_array_length(payload#>'{itinerary,stops}') not between 1 and 60
      or jsonb_array_length(payload->'checklist')>5 then raise exception 'Invalid trip size' using errcode='22023'; end if;
    if payload#>>'{itinerary,date}'<>'' and payload#>>'{itinerary,date}' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Invalid date' using errcode='22023';
    end if;
    date_value:=nullif(payload#>>'{itinerary,date}','')::date;
    payload:=jsonb_set(payload,'{itinerary,title}',to_jsonb(title_text));
    perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||local_key,0));
    select * into row_data from public.harupick_trips where owner_id=uid and local_id=local_key for update;
    if found then
      if expected is distinct from row_data.revision then raise exception 'Trip changed; reload before saving' using errcode='40001'; end if;
      update public.harupick_trips set title=title_text,travel_date=date_value,snapshot=payload,
        revision=revision+1,updated_at=clock_timestamp() where id=row_data.id returning * into row_data;
    else
      if expected is not null then raise exception 'Trip changed; reload before saving' using errcode='40001'; end if;
      insert into public.harupick_trips(owner_id,local_id,title,travel_date,snapshot)
        values(uid,local_key,title_text,date_value,payload) returning * into row_data;
    end if;
    return to_jsonb(row_data)-'snapshot';
  elsif p_action='admin_update' then
    title_text:=btrim(p_args->>'title'); state_filter:=p_args->>'status';
    if title_text is null or char_length(title_text) not between 1 and 80 or state_filter is null or state_filter not in ('active','archived')
       or p_args->>'date' is null or (p_args->>'date'<>'' and p_args->>'date' !~ '^\d{4}-\d{2}-\d{2}$') then
      raise exception 'Invalid trip update' using errcode='22023';
    end if;
    date_value:=nullif(p_args->>'date','')::date;
    select * into row_data from public.harupick_trips where id=(p_args->>'id')::uuid for update;
    if not found then raise exception 'Trip not found' using errcode='P0002'; end if;
    if (p_args->>'revision')::integer is distinct from row_data.revision then raise exception 'Trip changed; reload before saving' using errcode='40001'; end if;
    update public.harupick_trips set title=title_text,travel_date=date_value,status=state_filter,
      snapshot=jsonb_set(jsonb_set(snapshot,'{itinerary,title}',to_jsonb(title_text)),'{itinerary,date}',to_jsonb(coalesce(date_value::text,''))),
      revision=revision+1,updated_at=clock_timestamp() where id=row_data.id returning * into row_data;
    return to_jsonb(row_data);
  end if;
  raise exception 'Unsupported action' using errcode='22023';
end;
$fn$;
revoke all on function harupick_private.trip_action(text,jsonb) from public,anon;
grant execute on function harupick_private.trip_action(text,jsonb) to authenticated;
create function public.harupick_trip_action(p_action text,p_args jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=''
as $fn$ select harupick_private.trip_action(p_action,p_args); $fn$;
revoke all on function public.harupick_trip_action(text,jsonb) from public,anon;
grant execute on function public.harupick_trip_action(text,jsonb) to authenticated;

-- Day 4: database-generated audit records. No historical events are fabricated.
create table harupick_private.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  event text not null check(event in ('trip.created','trip.updated','trip.archived','trip.restored','trip.deleted','admin.granted','admin.revoked','admin.removed')),
  actor_id uuid,
  actor_type text not null check(actor_type in ('admin','member','system')),
  actor_label text not null,
  target_type text not null check(target_type in ('trip','administrator')),
  target_id uuid not null,
  target_label text not null,
  owner_id uuid,
  changed_fields text[] not null,
  before_data jsonb,
  after_data jsonb
);
comment on table harupick_private.audit_events is '하루픽 변경 감사 이력. 앱에서 수정·삭제 불가. 비밀번호·토큰·일정 메모·전체 일정 본문은 저장하지 않습니다.';
create index harupick_audit_time_id_idx on harupick_private.audit_events(occurred_at desc,id desc);
create index harupick_audit_event_time_idx on harupick_private.audit_events(event,occurred_at desc,id desc);
create index harupick_audit_target_time_idx on harupick_private.audit_events(target_id,occurred_at desc);
alter table harupick_private.audit_events enable row level security;
revoke all on harupick_private.audit_events from public,anon,authenticated,service_role;
create policy harupick_audit_deny_direct_clients on harupick_private.audit_events
for all to anon,authenticated using(false) with check(false);

create function harupick_private.capture_audit_event()
returns trigger language plpgsql security definer set search_path=''
as $fn$
declare
  actor uuid := (select auth.uid());
  actor_kind text;
  label text;
  old_data jsonb;
  new_data jsonb;
  old_summary jsonb;
  new_summary jsonb;
  keys text[];
  changed text[];
  event_name text;
  target uuid;
  target_name text;
  owner uuid;
  kind text;
begin
  if tg_table_schema<>'public' or tg_table_name not in ('harupick_trips','harupick_administrators') then
    raise exception 'Invalid audit trigger source';
  end if;
  if tg_op='UPDATE' and old is not distinct from new then return new; end if;
  if tg_op<>'INSERT' then old_data:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then new_data:=to_jsonb(new); end if;
  actor_kind:=case when actor is null then 'system' when harupick_private.is_current_admin() then 'admin' else 'member' end;
  select nickname into label from public.harupick_members where id=actor;
  label:=coalesce(label,case actor_kind when 'system' then '운영 도구' when 'admin' then '관리자' else '회원' end);
  if tg_table_name='harupick_trips' then
    kind:='trip';
    target:=coalesce(new_data->>'id',old_data->>'id')::uuid;
    target_name:=coalesce(new_data->>'title',old_data->>'title');
    owner:=coalesce(new_data->>'owner_id',old_data->>'owner_id')::uuid;
    keys:=array['title','travel_date','status','revision'];
    if old_data is not null then
      select jsonb_object_agg(k,old_data->k) into old_summary from unnest(keys) k;
    end if;
    if new_data is not null then
      select jsonb_object_agg(k,new_data->k) into new_summary from unnest(keys) k;
    end if;
    select coalesce(array_agg(k order by k),array[]::text[]) into changed from unnest(keys||array['snapshot']) k
      where old_data->k is distinct from new_data->k;
    event_name:=case when tg_op='INSERT' then 'trip.created' when tg_op='DELETE' then 'trip.deleted'
      when old_data->>'status' is distinct from new_data->>'status' and new_data->>'status'='archived' then 'trip.archived'
      when old_data->>'status'='archived' and new_data->>'status'='active' then 'trip.restored'
      else 'trip.updated' end;
  else
    kind:='administrator';
    target:=coalesce(new_data->>'user_id',old_data->>'user_id')::uuid;
    target_name:='관리자 계정 '||target::text;
    owner:=target;
    keys:=array['is_active','granted_at'];
    if old_data is not null then select jsonb_object_agg(k,old_data->k) into old_summary from unnest(keys) k; end if;
    if new_data is not null then select jsonb_object_agg(k,new_data->k) into new_summary from unnest(keys) k; end if;
    select coalesce(array_agg(k order by k),array[]::text[]) into changed from unnest(keys) k
      where old_data->k is distinct from new_data->k;
    event_name:=case when tg_op='DELETE' then 'admin.removed'
      when (new_data->>'is_active')::boolean then 'admin.granted' else 'admin.revoked' end;
  end if;
  insert into harupick_private.audit_events(event,actor_id,actor_type,actor_label,target_type,target_id,target_label,owner_id,changed_fields,before_data,after_data)
  values(event_name,actor,actor_kind,label,kind,target,target_name,owner,changed,old_summary,new_summary);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$fn$;
revoke all on function harupick_private.capture_audit_event() from public,anon,authenticated,service_role;
create trigger harupick_trip_audit after insert or update or delete on public.harupick_trips
for each row execute function harupick_private.capture_audit_event();
create trigger harupick_administrator_audit after insert or update or delete on public.harupick_administrators
for each row execute function harupick_private.capture_audit_event();

create function harupick_private.read_audit(p_query text,p_event text,p_page integer,p_from date,p_until date,p_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare search_text text:=lower(btrim(coalesce(p_query,'')));
  total_count bigint; page_number integer; page_count integer; rows_json jsonb;
begin
  if not harupick_private.is_current_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_id is not null then
    select to_jsonb(a) into rows_json from harupick_private.audit_events a where a.id=p_id;
    return rows_json;
  end if;
  if char_length(search_text)>100 or p_page is null or p_page<1 or p_page>1000000
    or p_event is null or p_event not in ('all','trip.created','trip.updated','trip.archived','trip.restored','trip.deleted','admin.granted','admin.revoked','admin.removed')
    or (p_from is not null and p_until is not null and p_from>p_until) then
    raise exception 'Invalid audit filters' using errcode='22023';
  end if;
  select count(*) into total_count from harupick_private.audit_events a
  where (p_event='all' or a.event=p_event)
    and (p_from is null or a.occurred_at >= (p_from::timestamp at time zone 'Asia/Seoul'))
    and (p_until is null or a.occurred_at < ((p_until+1)::timestamp at time zone 'Asia/Seoul'))
    and (search_text='' or strpos(lower(a.target_label),search_text)>0 or strpos(lower(a.actor_label),search_text)>0
      or strpos(a.target_id::text,search_text)>0 or strpos(coalesce(a.actor_id::text,''),search_text)>0);
  page_count:=greatest(1,ceil(total_count::numeric/20)::integer);
  page_number:=least(p_page,page_count);
  select coalesce(jsonb_agg(r.data order by r.occurred_at desc,r.id desc),'[]'::jsonb) into rows_json from (
    select a.id,a.occurred_at,to_jsonb(a)-'before_data'-'after_data' as data from harupick_private.audit_events a
    where (p_event='all' or a.event=p_event)
      and (p_from is null or a.occurred_at >= (p_from::timestamp at time zone 'Asia/Seoul'))
      and (p_until is null or a.occurred_at < ((p_until+1)::timestamp at time zone 'Asia/Seoul'))
      and (search_text='' or strpos(lower(a.target_label),search_text)>0 or strpos(lower(a.actor_label),search_text)>0
        or strpos(a.target_id::text,search_text)>0 or strpos(coalesce(a.actor_id::text,''),search_text)>0)
    order by a.occurred_at desc,a.id desc limit 20 offset ((page_number-1)::bigint*20)
  ) r;
  return jsonb_build_object('events',rows_json,'total',total_count,'page',page_number,'pages',page_count);
end;
$fn$;
revoke all on function harupick_private.read_audit(text,text,integer,date,date,uuid) from public,anon;
grant execute on function harupick_private.read_audit(text,text,integer,date,date,uuid) to authenticated;
create function public.harupick_admin_audit(p_query text default '',p_event text default 'all',p_page integer default 1,p_from date default null,p_until date default null,p_id uuid default null)
returns jsonb language sql stable security invoker set search_path=''
as $fn$ select harupick_private.read_audit(p_query,p_event,p_page,p_from,p_until,p_id); $fn$;
revoke all on function public.harupick_admin_audit(text,text,integer,date,date,uuid) from public,anon;
grant execute on function public.harupick_admin_audit(text,text,integer,date,date,uuid) to authenticated;

-- Dashboard day 2: read-only aggregate API. All values share one snapshot and cutoff.
create function harupick_private.dashboard(p_days integer)
returns jsonb language plpgsql stable security definer set search_path=''
as $fn$
declare
  cutoff timestamptz := statement_timestamp();
  korea_today date := (cutoff at time zone 'Asia/Seoul')::date;
  first_day date;
  result jsonb;
begin
  if not harupick_private.is_current_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if p_days is null or p_days not in (7,30) then
    raise exception 'Trend days must be 7 or 30' using errcode='22023';
  end if;
  first_day := korea_today - (p_days-1);
  with
  eligible_members as materialized (
    select m.id,m.nickname,m.created_at,u.email_confirmed_at is not null as confirmed
    from public.harupick_members m join auth.users u on u.id=m.id
    where u.deleted_at is null
  ),
  registered as materialized (
    select id,created_at from eligible_members where confirmed
  ),
  trips as materialized (
    select t.id,t.title,t.travel_date,t.status,t.created_at,m.nickname
    from public.harupick_trips t join eligible_members m on m.id=t.owner_id
  ),
  trip_counts as (
    select count(*) as total,
      count(*) filter(where status='active') as active,
      count(*) filter(where status='archived') as archived,
      count(*) filter(where status='active' and travel_date>=korea_today and travel_date<korea_today+30) as upcoming
    from trips
  ),
  days as (
    select first_day+i as day from generate_series(0,p_days-1) i
  ),
  member_daily as (
    select (created_at at time zone 'Asia/Seoul')::date as day,count(*) as amount from registered
    where created_at >= (first_day::timestamp at time zone 'Asia/Seoul') and created_at<=cutoff
    group by 1
  ),
  trip_daily as (
    select (created_at at time zone 'Asia/Seoul')::date as day,count(*) as amount from trips
    where created_at >= (first_day::timestamp at time zone 'Asia/Seoul') and created_at<=cutoff
    group by 1
  ),
  upcoming as (
    select id,title,travel_date,nickname from trips
    where status='active' and travel_date>=korea_today and travel_date<korea_today+30
    order by travel_date,id limit 5
  ),
  recent as (
    select id,event,occurred_at,actor_label,actor_type,target_label
    from harupick_private.audit_events where occurred_at<=cutoff
    order by occurred_at desc,id desc limit 5
  )
  select jsonb_build_object(
    'as_of',cutoff,'timezone','Asia/Seoul','trend_days',p_days,
    'trend_from',first_day,'trend_until',korea_today,
    'metrics',jsonb_build_object(
      'registered_members',(select count(*) from registered),
      'total_trips',c.total,'active_trips',c.active,'archived_trips',c.archived,
      'upcoming_trips_30d',c.upcoming,
      'changes_7d',(select count(*) from harupick_private.audit_events
        where occurred_at>=((korea_today-6)::timestamp at time zone 'Asia/Seoul') and occurred_at<=cutoff)
    ),
    'upcoming_trips',(select coalesce(jsonb_agg(to_jsonb(u) order by u.travel_date,u.id),'[]'::jsonb) from upcoming u),
    'recent_changes',(select coalesce(jsonb_agg(to_jsonb(r) order by r.occurred_at desc,r.id desc),'[]'::jsonb) from recent r),
    'trends',jsonb_build_object(
      'member_registrations',(select jsonb_agg(jsonb_build_object('date',d.day,'count',coalesce(m.amount,0)) order by d.day)
        from days d left join member_daily m on m.day=d.day),
      'trip_creations',(select jsonb_agg(jsonb_build_object('date',d.day,'count',coalesce(t.amount,0)) order by d.day)
        from days d left join trip_daily t on t.day=d.day)
    )
  ) into result from trip_counts c;
  return result;
end;
$fn$;
revoke all on function harupick_private.dashboard(integer) from public,anon;
grant execute on function harupick_private.dashboard(integer) to authenticated;

create function public.harupick_admin_dashboard(p_days integer default 7)
returns jsonb language sql stable security invoker set search_path=''
as $fn$ select harupick_private.dashboard(p_days); $fn$;
revoke all on function public.harupick_admin_dashboard(integer) from public,anon;
grant execute on function public.harupick_admin_dashboard(integer) to authenticated;

-- Member directory filters (additive to the existing listing API).
-- Additive API: keep harupick_admin_members(text,integer,integer) unchanged.
create or replace function harupick_private.admin_members_filtered(
  p_query text, p_page integer, p_page_size integer,
  p_status text, p_from date, p_until date, p_sort text
) returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  search_text text := lower(btrim(coalesce(p_query,'')));
  result jsonb;
  cutoff timestamptz := statement_timestamp();
begin
  if not harupick_private.is_current_admin() then
    raise exception 'Administrator access required' using errcode='42501';
  end if;
  if char_length(search_text)>100 or p_page is null or p_page<1 or p_page>1000000
    or p_page_size is null or p_page_size<1 or p_page_size>50
    or p_status is null or p_status not in ('all','active','unconfirmed','suspended','deleted')
    or p_sort is null or p_sort not in ('created_desc','created_asc')
    or (p_from is not null and (not isfinite(p_from) or p_from<date '0001-01-01' or p_from>date '9999-12-31'))
    or (p_until is not null and (not isfinite(p_until) or p_until<date '0001-01-01' or p_until>date '9999-12-31'))
    or (p_from is not null and p_until is not null and p_from>p_until) then
    raise exception 'Invalid directory parameters' using errcode='22023';
  end if;
  with matched as materialized (
    select m.id,m.nickname,u.email,m.created_at,
      u.email_confirmed_at is not null as email_confirmed,
      case when u.deleted_at is not null then 'deleted'
        when u.banned_until>cutoff then 'suspended'
        when u.email_confirmed_at is null then 'unconfirmed' else 'active' end as status
    from public.harupick_members m join auth.users u on u.id=m.id
    where (search_text='' or strpos(lower(m.nickname),search_text)>0 or strpos(lower(coalesce(u.email,'')),search_text)>0)
      and (p_from is null or m.created_at>=p_from::timestamp at time zone 'Asia/Seoul')
      and (p_until is null or m.created_at<(p_until+1)::timestamp at time zone 'Asia/Seoul')
  ), filtered as materialized (
    select * from matched where p_status='all' or status=p_status
  ), totals as (
    select count(*) as total,greatest(1,ceil(count(*)::numeric/p_page_size)::integer) as pages from filtered
  ), paging as (
    select total,pages,least(p_page,pages) as page from totals
  ), picked as (
    select m.* from filtered m
    order by case when p_sort='created_desc' then m.created_at end desc,
      case when p_sort='created_desc' then m.id end desc,
      case when p_sort='created_asc' then m.created_at end asc,
      case when p_sort='created_asc' then m.id end asc
    limit p_page_size offset (select (page-1)::bigint*p_page_size from paging)
  )
  select jsonb_build_object('members',coalesce((select jsonb_agg(to_jsonb(r) order by
      case when p_sort='created_desc' then r.created_at end desc,
      case when p_sort='created_desc' then r.id end desc,
      case when p_sort='created_asc' then r.created_at end asc,
      case when p_sort='created_asc' then r.id end asc) from picked r),'[]'::jsonb),
    'total',total,'page',page,'pages',pages,'page_size',p_page_size)
    into result from paging;
  return result;
end;
$function$;
revoke all on function harupick_private.admin_members_filtered(text,integer,integer,text,date,date,text) from public,anon;
grant execute on function harupick_private.admin_members_filtered(text,integer,integer,text,date,date,text) to authenticated;

create or replace function public.harupick_admin_members_filtered(
  p_query text default '',p_page integer default 1,p_page_size integer default 20,
  p_status text default 'all',p_from date default null,p_until date default null,p_sort text default 'created_desc'
) returns jsonb language sql stable security invoker set search_path = ''
as $function$
  select harupick_private.admin_members_filtered(p_query,p_page,p_page_size,p_status,p_from,p_until,p_sort);
$function$;
revoke all on function public.harupick_admin_members_filtered(text,integer,integer,text,date,date,text) from public,anon;
grant execute on function public.harupick_admin_members_filtered(text,integer,integer,text,date,date,text) to authenticated;
notify pgrst,'reload schema';
