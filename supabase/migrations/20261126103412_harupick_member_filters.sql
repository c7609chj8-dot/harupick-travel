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
