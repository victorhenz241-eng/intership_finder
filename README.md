# Internship tracker

A Kanban board for internship applications, backed by Supabase. Six columns
(found → interested → applied → replied → interview → closed), cards sorted by
fit score, drag-and-drop between stages.

## Local run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env example and fill in your Supabase values
   (Project Settings → API):

   ```bash
   cp .env.local.example .env.local
   ```

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable (anon) key |

3. Make sure the `roles` table is readable and its `stage` column is writable
   by the anon role. If the board shows "permission denied", run this in the
   Supabase SQL editor:

   ```sql
   alter table public.roles enable row level security;

   create policy "roles are readable"
     on public.roles for select
     to anon, authenticated
     using (true);

   create policy "roles stage is updatable"
     on public.roles for update
     to anon, authenticated
     using (true)
     with check (true);
   ```

4. Start the dev server and open http://localhost:3000:

   ```bash
   npm run dev
   ```

## Deploy to Vercel

1. Push this folder to a Git repository (GitHub, GitLab, or Bitbucket).
2. In Vercel, click **Add New → Project** and import the repository.
   The Next.js preset is detected automatically.
3. Under **Environment Variables**, add both variables from
   `.env.local.example` with your real values.
4. Click **Deploy**. Later pushes to the default branch redeploy automatically.

Or from the CLI:

```bash
npm i -g vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel --prod
```

## Expected table

`public.roles` with columns: `id uuid`, `company text`, `title text`,
`location text`, `url text`, `fit_score int` (0–100), `severity text`
(`strong` | `decent` | `skip`), `why text`, `stage text`
(`found` | `interested` | `applied` | `replied` | `interview` | `closed`),
`updated_at timestamptz`.
