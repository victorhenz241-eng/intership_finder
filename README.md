# Internship Radar

Turns a firehose of scored internship postings into a short list worth applying to.
Two modes over one Supabase table:

- **Inbox** (`/inbox`) — dense triage list of every `found` role, strong matches first.
  Dismiss the noise, save the good ones. Keyboard-driven.
- **Pipeline** (`/pipeline`) — Kanban of saved roles only:
  interested → applied → replied → interview → offer → closed. Drag to change stage.
- **Detail drawer** — slides over either mode (`?role=<id>` deep link) with the
  LLM's "why it fits", parsed metadata, notes with autosave, stage controls and,
  for pipeline roles, the outreach panel.
- **Follow-ups** (`/followups`) — outreach threads that need a nudge.

Rows in `roles` are written by an external n8n workflow. This app only reads and
updates `stage` and `notes` there. Nothing here inserts or hard-deletes a role: "delete" means
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

## Sign-in

The app is single-user and sits behind Supabase magic-link auth. Unauthenticated
visitors see only the sign-in screen; the sign-in never creates an account
(`shouldCreateUser: false`), so the user must already exist in
Authentication → Users. One-time dashboard setup:

1. Authentication → URL Configuration: Site URL `https://intership-finder-nine.vercel.app`;
   Redirect URLs `https://intership-finder-nine.vercel.app/**` and `http://localhost:3000/**`.
   Magic links fail silently when the return URL is not listed here.
2. Authentication → Users → Add user with the owner email (or sign in once while
   sign-ups are still open), then Authentication → Sign In / Providers → Email →
   turn off "Allow new users to sign up".
3. Run `supabase/migrations/2026-09-18-auth-rls.sql`. It drops the anon policies
   and pins every policy to the owner email via `public.is_owner()`.

The built-in mailer allows only a handful of OTP emails per hour; if a link never
arrives, check the rate-limit notice in Authentication → Rate Limits.

n8n keeps writing through its own credential, which is the service_role key and
bypasses RLS. Nothing in the app ever runs with that key.

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

## Outreach

Warm contacts beat cold applications, so a pipeline role carries a list of
people worth talking to (`public.contacts`, one row per person, see
`supabase/migrations/2026-09-18-contacts.sql`). The LinkedIn side is manual by
design: you search, you connect, you paste. The app prepares text and tracks
the thread. It never sends anything, never scrapes LinkedIn, and stores only a
person's public professional identity (name, title, profile URL).

- **Add a contact** from the drawer of any pipeline role: name, title, URL,
  Enter. Status ladder `identified → requested → accepted → messaged → replied`,
  plus `dead`. Marking `messaged` stamps `sent_at`; `replied` stamps `replied_at`.
  Per-contact notes autosave like role notes.
- **Suggested talking points** appear when n8n has filled `roles.outreach_hooks`
  (an array of strings or `{text, url, source}` objects). Null is the normal
  state. The text is third-party and is rendered as text only; "Add as contact"
  pre-fills the hook.
- **Draft outreach** calls `POST /api/draft` (server-side, Groq
  `openai/gpt-oss-120b`, `max_tokens` 3000, low reasoning effort, one retry on an empty generation) with the role, the contact and the
  owner's background, and returns a connection note (hard-capped at 300
  characters in code) and a longer follow-up message. Both land in editable
  fields that save to the contact row, with a counter, copy and regenerate.
  `jd_text` and hooks are passed inside `<<<JOB_DATA>>>` delimiters as data,
  never as instructions; `scripts/draft-smoke.mjs` checks this against the real
  Perpay row, whose live posting contains a hidden instruction for AI readers.
- **Follow-ups**: a `messaged` contact with no `replied_at` and `sent_at` older
  than `FOLLOW_UP_DAYS` (7) needs a nudge. Pipeline cards show contact counts
  and "to follow up"; the nav tab counts them; `/followups` lists them.

Server env (Vercel, not `NEXT_PUBLIC_`): `GROQ_API_KEY`; optional `OWNER_EMAIL`.
The route requires the caller's Supabase session and the owner email, so it
cannot be used anonymously even if the URL is known.

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
3. Add the environment variables from `.env.local.example` (`GROQ_API_KEY` without
   the `NEXT_PUBLIC_` prefix so it stays server-side).
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
