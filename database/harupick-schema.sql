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
