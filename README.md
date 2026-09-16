# Internship Radar

Turns a firehose of scored internship postings into a short list worth applying to.
Two modes over one Supabase table:

- **Inbox** (`/inbox`) — dense triage list of every `found` role, strong matches first.
  Dismiss the noise, save the good ones. Keyboard-driven.
- **Pipeline** (`/pipeline`) — Kanban of saved roles only:
  interested → applied → replied → interview → offer → closed. Drag to change stage.
- **Detail drawer** — slides over either mode (`?role=<id>` deep link) with the
  LLM's "why it fits", parsed metadata, notes with autosave, and stage controls.

Rows are written by an external n8n workflow. This app only reads and updates
`stage` and `notes`. Nothing here inserts or hard-deletes a row: "delete" means
`stage = 'dismissed'`, which keeps the row in the table so the next sweep does not
re-add it. Dismissed roles are recoverable from the Dismissed view.

## Keyboard shortcuts (inbox)

| Key | Action |
| --- | --- |
| `j` / `k` | Move cursor down / up (the drawer follows if open) |
| `o` / `Enter` | Open detail drawer |
| `e` | Dismiss cursor row, or every checked row (restore, in the Dismissed view) |
| `s` | Save to pipeline (sets `interested`) |
| `x` | Toggle checkbox on cursor row (shift-click checkboxes for ranges) |
| `u` | Undo the last dismiss while the toast is showing |
| `Esc` | Close drawer, then clear selection |
| `?` | Shortcut help |

## Local run

```bash
npm install
cp .env.local.example .env.local   # then fill in both values
npm run dev                         # http://localhost:3000
```

| Variable | Value (Supabase → Project Settings → API) |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key |

## Table and policies

`public.roles` needs at least: `id uuid`, `source text`, `company text`, `title text`,
`location text`, `url text`, `description text`, `posted_at timestamptz`,
`first_seen timestamptz`, `fit_score int`, `severity text` (`strong` | `decent` | `skip`),
`why text`, `notes text`, `stage text`, `updated_at timestamptz`.

`stage` holds one of: `found`, `dismissed`, `interested`, `applied`, `replied`,
`interview`, `offer`, `closed`. If your column has a CHECK constraint or enum from
an earlier version, extend it:

```sql
alter table public.roles drop constraint if exists roles_stage_check;
alter table public.roles add constraint roles_stage_check
  check (stage in ('found','dismissed','interested','applied','replied','interview','offer','closed'));
```

The anon role must be able to read rows and update `stage` and `notes`. If the app
reports "permission denied", run this in the SQL editor:

```sql
alter table public.roles enable row level security;

create policy "roles are readable"
  on public.roles for select
  to anon, authenticated
  using (true);

create policy "roles stage and notes are updatable"
  on public.roles for update
  to anon, authenticated
  using (true)
  with check (true);
```

## Data notes

- Rows with `fit_score = 0` and an empty `why` are treated as **unscored**. They
  show a dashed "–" chip, sort below scored skips, and are never included in
  "Select N skips". Fix the scorer upstream rather than dismissing them blind.
- `description` is parsed as `Category: … Terms: … Sponsorship: … Degrees: …` when
  it has that shape (the simplify source). Otherwise it is shown as a text excerpt.
- The app loads every row once and filters client-side. Use the Refresh button
  after an overnight sweep; a tab that regains focus after 10 minutes also refetches.

## Deploy to Vercel

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Vercel: **Add New → Project**, import the repository (Next.js is auto-detected).
3. Add both environment variables from `.env.local.example`.
4. Deploy. Pushes to the default branch redeploy automatically.

From the CLI:

```bash
npm i -g vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel --prod
```
