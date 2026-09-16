-- One row per dedup group is shown in the app; the rest hide behind it.
-- Rows that match nothing keep dedup_group NULL and is_primary TRUE.
alter table public.roles
  add column if not exists is_primary boolean not null default true;

create index if not exists roles_dedup_group_idx on public.roles (dedup_group);
