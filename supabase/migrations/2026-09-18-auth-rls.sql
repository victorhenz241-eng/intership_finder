-- Phase 1: lock the app behind Supabase Auth.
--
-- n8n uses the service_role key (verified: the anon key cannot insert into roles,
-- yet the nightly sweep inserts through the n8n credential), so it bypasses RLS and
-- is unaffected by anything below.
--
-- Sign-ups are open on this project, so "any authenticated user" is not enough:
-- every policy is pinned to the owner's email. Also disable sign-ups in the
-- dashboard (Authentication -> Sign In / Providers -> Email -> "Allow new users
-- to sign up" off) once you have logged in once.

create or replace function public.is_owner() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'victorhenz241@gmail.com'
$$;

alter table public.roles enable row level security;

drop policy if exists "roles are readable" on public.roles;
drop policy if exists "roles stage and notes are updatable" on public.roles;

create policy "owner reads roles"
  on public.roles for select
  to authenticated
  using (public.is_owner());

create policy "owner updates roles"
  on public.roles for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- Nothing for anon: unauthenticated requests now see zero rows.
