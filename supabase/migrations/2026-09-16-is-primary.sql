-- Optional. The app derives "primary" as (dedup_group is null or dedup_group = id),
-- so no new column is needed. This index just speeds up group lookups.
create index if not exists roles_dedup_group_idx on public.roles (dedup_group);
