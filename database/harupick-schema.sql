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
