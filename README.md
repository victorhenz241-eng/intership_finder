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

## Duplicate folding

A Rust service in [services/dedup](services/dedup/README.md) groups rows that
describe the same job (same company, same or near-identical title, compatible
location, or the same posting URL). It sets `dedup_group` on every member to
the primary's id. The app shows a row when `dedup_group` is null or equals
its own id, folds the rest behind a "+N" badge (press `d` or click it), and
lists them under "Also listed as" in the drawer. No extra column is needed.

The n8n workflow "Internship Radar — Dedup (Rust)" re-runs the grouping every
six hours once the service URL is set on its "POST /dedup" node.

## Eligibility

An n8n enrichment workflow fetches the real job description where the ATS
returns text and writes `eligibility` (`eligible` | `likely_ineligible` |
`unknown`, default `unknown`), `eligibility_reason` and `jd_text` per role. It
processes a dozen roles per run, so most rows stay `unknown` for a long time;
the app treats that as normal and never hides or marks them.

- `likely_ineligible` rows get an amber **Check** pill and are hidden from the
  inbox by default. "Show ineligible" (`?inel=1`) reveals them greyed with the
  reason; "Dismiss N ineligible" then sets `stage = 'dismissed'` through the
  usual undoable path. The Dismissed view is never filtered.
- The drawer shows the verdict under the title and, when `jd_text` is present,
  a scrollable "Job description" block rendered as plain text only. The text is
  third-party and untrusted; it is never interpreted as HTML or markdown.
- Hiding is a view filter. Nothing about eligibility is ever written by the app.

## Data notes

- A row is **unscored** when it has no score **and** no reasoning: `fit_score`
  is NULL or 0 and `why` is NULL or empty. n8n writes all three as NULL when a
  scoring call fails or returns nothing (older rows carry `0 / skip / ""` from
  before that fix; the "Backfill Scores" workflow re-scores both shapes). A real
  0 always comes with a `why` and is a genuine skip. Unscored rows show a dashed
  "–" chip, sort below scored skips, are never included in "Select N skips", and
  are counted in "N not scored yet". Fix the scorer upstream rather than
  dismissing them blind.
- `eligibility_checked_at` is stamped by the enrichment workflow on every pass
  so its queue drains. The app reads it only as part of the row; it never
  displays or writes it.
- `description` is parsed as `Category: … Terms: … Sponsorship: … Degrees: …` when
  it has that shape (the simplify source). Otherwise it is shown as a text excerpt.
- The app loads every row once and filters client-side. Use the Refresh button
  after an overnight sweep; a tab that regains focus after 10 minutes also refetches.

## Deploy to Vercel

1. The repository lives at github.com/victorhenz241-eng/intership_finder (private).
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

## Deploy the dedup service on Render

In Render: **New → Blueprint**, pick the same GitHub repository. Render reads
`services/dedup/render.yaml`, builds the Dockerfile, and gives you a URL like
`https://internship-dedup.onrender.com`. Paste `<that URL>/dedup` into the
"POST /dedup" node of the n8n workflow and run it once with "Run Now".
