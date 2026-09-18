-- Audit follow-ups (2026-09-18). Safe to re-run. The app tolerates these columns
-- and the usage function being absent, so deploy order does not matter.

-- 1. Timestamps the app was missing.
alter table public.contacts add column if not exists requested_at timestamptz;  -- connection request sent
alter table public.roles    add column if not exists stage_changed_at timestamptz; -- last stage change by the app

-- 2. Daily quota for the two paid routes (/api/draft, /api/find-people).
create table if not exists public.api_usage (
  day   date not null default current_date,
  kind  text not null,
  count integer not null default 0,
  primary key (day, kind)
);
alter table public.api_usage enable row level security;
drop policy if exists "owner reads usage" on public.api_usage;
create policy "owner reads usage" on public.api_usage for select to authenticated using (public.is_owner());

-- Atomically counts one call and says whether it was within the limit.
create or replace function public.bump_usage(p_kind text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not public.is_owner() then
    return false;
  end if;
  insert into public.api_usage (day, kind, count)
    values (current_date, p_kind, 1)
    on conflict (day, kind) do update set count = public.api_usage.count + 1
    returning count into n;
  return n <= p_limit;
end;
$$;
revoke execute on function public.bump_usage(text, integer) from public, anon;
grant  execute on function public.bump_usage(text, integer) to authenticated;

-- 3. is_owner() is harmless (returns false) but has no business being callable anonymously.
revoke execute on function public.is_owner() from public, anon;
grant  execute on function public.is_owner() to authenticated;
