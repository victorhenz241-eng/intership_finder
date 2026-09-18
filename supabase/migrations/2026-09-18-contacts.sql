-- Phase 2: contacts (people worth talking to about a role) and outreach_hooks.
-- Requires 2026-09-18-auth-rls.sql (public.is_owner()).
--
-- Professional identity only: name, title, public profile URL. No email, phone,
-- or anything that is not the person's public professional identity.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  name text not null,
  title text,
  profile_url text,
  source text,          -- how they were found: 'manual', 'hook', 'blog', 'github', 'paper', ...
  hook text,            -- the specific reason to write to THIS person
  draft_note text,      -- LinkedIn connection note, <= 300 chars (enforced in app code too)
  draft_message text,   -- longer message for after they accept
  status text not null default 'identified'
    check (status in ('identified','requested','accepted','messaged','replied','dead')),
  sent_at timestamptz,
  replied_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_role_id_idx on public.contacts(role_id);

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- New tables have RLS off: enable it here so contacts are never readable anonymously.
alter table public.contacts enable row level security;

drop policy if exists "owner reads contacts" on public.contacts;
drop policy if exists "owner inserts contacts" on public.contacts;
drop policy if exists "owner updates contacts" on public.contacts;
drop policy if exists "owner deletes contacts" on public.contacts;

create policy "owner reads contacts"   on public.contacts for select to authenticated using (public.is_owner());
create policy "owner inserts contacts" on public.contacts for insert to authenticated with check (public.is_owner());
create policy "owner updates contacts" on public.contacts for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner deletes contacts" on public.contacts for delete to authenticated using (public.is_owner());

-- Populated later by n8n (service_role); the app reads it, never writes it.
alter table public.roles add column if not exists outreach_hooks jsonb;
