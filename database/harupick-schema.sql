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
