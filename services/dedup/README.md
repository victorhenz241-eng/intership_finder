# dedup-service

A small Rust service that does fuzzy record linkage over internship postings.
Given every row of the `roles` table, it decides which rows describe the same
real-world job, groups them, and names one primary per group. It is a pure
function behind HTTP: no database, no secrets, no state.

```
POST /dedup   {"roles": [...], "config": {...}?}  ->  {"groups", "assignments", "stats"}
GET  /health  ->  ok
```

## Why this exists

The sweep's own dedup only skips a source-ID it has already stored. It cannot
see that Simplify and a company's own board list the same job under different
IDs, that one internship is posted to three cities, or that a listing came back
with a new ID after an edit. Every such duplicate is a card triaged twice and,
at worst, applied to twice.

## How it works

1. **Normalize.** Company keys drop legal suffixes ("Guardian Life, Inc." → `guardian life`).
   Title keys drop season, year, roman numerals and filler ("Summer 2027",
   "Multiple Teams"), keep the words that identify the job, and pull out two
   kinds of *discriminators*: degree level (PhD / MS / BS) and programme
   format (internship vs co-op). Locations become sets of canonical places
   ("NYC" and "New York City, NY" agree). URLs lose scheme, `www.` and
   tracking parameters.
2. **Block, then compare.** Rows are bucketed by company key and only compared
   inside a bucket. On the 168-row snapshot that is 183 comparisons instead of
   14,028. Inside a bucket a pair matches when any tier fires:
   - `same_url`: canonical posting URLs are identical.
   - `exact_title`: normalized titles are identical. This ignores location,
     because one internship posted to two cities is one job.
   - `fuzzy_title`: stemmed-token Jaccard ≥ 0.8 **and** Jaro-Winkler ≥ 0.92
     **and** the locations share a place (or one is unknown).
   Pairs that disagree on degree level or on internship-vs-co-op never match.
3. **Group and pick a primary.** Matches are unioned into connected
   components. Each group's id is the primary's own id, so a row is primary
   exactly when `dedup_group` is null or equals its id and the table needs no
   extra column. The primary is chosen by, in order: a row the
   user already acted on (pipeline stage, then dismissed) beats one they
   haven't; scored beats unscored; higher fit score; has a URL; has a
   reasoning; longer description; earlier first seen; id.

The thresholds are conservative on purpose. A missed merge costs one extra
glance in the inbox. A wrong merge tucks a real job behind another one.

## Decisions pinned by tests

From the real table snapshot in `tests/fixtures/`:

| Case | Decision |
| --- | --- |
| General Dynamics, "Software Development Intern" ×3, one site | merge |
| Lyft, "Data Science Intern - Algorithms" in SF and NYC | merge |
| CoStar, "Technology Intern" / "- Multiple Teams" / "- Summer 2027" | merge |
| Google, "UX Engineer Intern - PhD" vs "UX Engineer Intern" | keep apart |
| Intuit, "Mobile SWE Intern - iOS" vs "- Android" | keep apart |
| Lowe's, "Exploratory Software Engineer Intern" vs "Software Engineer Intern" | keep apart |
| Wells Fargo, "Engineer" vs "Engineering" with disjoint locations | keep apart |
| RTX, "Software Engineer Co-op" vs "Software Engineer Intern" | keep apart |

## Run

```bash
cargo test                       # 25 unit + integration tests
cargo run -- tests/fixtures/roles-2026-09-16.json   # one-shot CLI, prints JSON
cargo run --release              # serves on $PORT (default 8080)
curl -s localhost:8080/health
curl -s -X POST localhost:8080/dedup -H 'content-type: application/json' \
  -d '{"roles":[{"id":"a","company":"Lyft","title":"Data Science Intern","location":"SF"},
               {"id":"b","company":"Lyft","title":"Data Science Intern","location":"NYC"}]}'
```

Input fields: `id`, `company`, `title` required; `location`, `url`, `source`,
`stage`, `fit_score`, `why`, `description`, `first_seen` optional.
`config` accepts `title_jaccard_min`, `title_jaro_winkler_min`,
`fuzzy_requires_location`, `exact_title_ignores_location`.

Output: `groups` (only groups with two or more members, each with `evidence`
saying which pairs matched and why), `assignments` (one row per input with
`dedup_group` and `is_primary`, ready to write back), and `stats`.

## Deploy on Render

`render.yaml` at this directory describes a free Docker web service. In Render:
New → Blueprint → pick the repo. Render reads the blueprint, builds the
Dockerfile with `rootDir: services/dedup`, and exposes `/dedup`. Free instances
sleep when idle, so the first call after a quiet period takes a few seconds.

## Wire into n8n

The workflow "Internship Radar — Dedup (Rust)" in your n8n reads every row with
the Supabase node, posts them in one request, and writes back only the rows
whose `dedup_group` changed. Set the service URL on the "POST /dedup" node
once the Render deploy is live. `n8n/dedup-roles.workflow.json` is the same
workflow as an importable file.

The optional `supabase/migrations/2026-09-16-is-primary.sql` adds an index on
`dedup_group`; nothing requires it.
