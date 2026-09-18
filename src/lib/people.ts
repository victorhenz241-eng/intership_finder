/**
 * Find people at a company through a web search engine (Serper = Google results).
 * Nothing here ever requests a linkedin.com page or uses the owner's account:
 * the only network call is to the search API, and the result is a list of
 * public search hits the owner opens in their own browser.
 */

export const SCHOOLS = [
  { re: /\bessec\b/i, label: "ESSEC" },
  { re: /centrale\s*sup[eé]lec|\bcentralesupelec\b/i, label: "CentraleSupélec" },
  { re: /george washington univ|\bgwu\b/i, label: "GWU" },
] as const;

const SCHOOL_QUERY = '("ESSEC" OR "CentraleSupélec" OR "George Washington University")';
const TEAM_QUERY = '("data science" OR "machine learning" OR "data engineering" OR "AI engineer" OR "ML engineer")';
const HIRING_QUERY = '("engineering manager" OR "head of data" OR "director of data" OR "university recruiting" OR "campus recruiter")';

export type Candidate = {
  name: string;
  title: string | null;
  url: string;
  snippet: string;
  /** Which query produced it: alumni hits are the strongest opener. */
  bucket: "alumni" | "team" | "hiring";
  school: string | null;
  score: number;
  reason: string;
};

export type SearchHit = { title?: string; link?: string; snippet?: string };

export function buildQueries(company: string): { bucket: Candidate["bucket"]; q: string }[] {
  const c = `"${company.replace(/"/g, "").trim()}"`;
  return [
    { bucket: "alumni", q: `site:linkedin.com/in ${c} ${SCHOOL_QUERY}` },
    { bucket: "team", q: `site:linkedin.com/in ${c} ${TEAM_QUERY}` },
    { bucket: "hiring", q: `site:linkedin.com/in ${c} ${HIRING_QUERY}` },
  ];
}

/**
 * Google titles a profile "Name - Title at Company - LinkedIn" or "Name - Company | LinkedIn".
 * Returns null for anything that is not a person profile.
 */
export function parseHit(hit: SearchHit): { name: string; title: string | null; url: string; snippet: string } | null {
  const url = (hit.link ?? "").trim();
  if (!/^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#]+/i.test(url)) return null;
  const raw = (hit.title ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const stripped = raw.replace(/\s*[-|–]\s*LinkedIn\s*$/i, "").trim();
  const parts = stripped.split(/\s+[-–|]\s+/).map((p) => p.trim()).filter(Boolean);
  const name = parts[0] ?? "";
  if (!name || name.length > 60 || /linkedin/i.test(name)) return null;
  const title = parts.slice(1).join(" · ").trim() || null;
  return { name, title, url: url.replace(/[?#].*$/, ""), snippet: (hit.snippet ?? "").replace(/\s+/g, " ").trim() };
}

/** "Canal+ Group" → "canal", "Perpay Inc." → "perpay": the first distinctive token, for matching hits to the company. */
export function companyKey(company: string): string {
  const stop = new Set(["inc", "llc", "ltd", "corp", "co", "group", "the", "labs", "technologies", "technology", "company"]);
  const tokens = company.toLowerCase().replace(/[^a-z0-9+ ]/g, " ").split(/\s+/).filter((t) => t && !stop.has(t));
  return (tokens[0] ?? company.toLowerCase()).replace(/\+/g, "");
}

function mentions(text: string, key: string): boolean {
  if (!key) return false;
  return text.toLowerCase().replace(/\+/g, "").includes(key);
}

function schoolIn(text: string): string | null {
  for (const s of SCHOOLS) if (s.re.test(text)) return s.label;
  return null;
}

const RELEVANT_TITLE = /(data|machine learning|\bml\b|\bai\b|analytics|engineer|scientist|research)/i;
const SENIORITY = /(manager|lead|head|director|vp|chief|principal|staff|senior)/i;
const RECRUITING = /(recruit|talent|people|campus|university)/i;
const INTERN = /\bintern\b/i;

/**
 * Deterministic ranking. Alumni first, then people who do the work the role
 * describes with enough seniority to know the team, then recruiters. Current
 * interns are informative but rank low: they cannot open a door.
 */
export function rankCandidates(
  raw: { bucket: Candidate["bucket"]; hit: SearchHit }[],
  company: string,
  roleTitle: string
): Candidate[] {
  const byUrl = new Map<string, Candidate>();
  const key = companyKey(company);
  for (const { bucket, hit } of raw) {
    const p = parseHit(hit);
    if (!p) continue;
    const text = `${p.title ?? ""} ${p.snippet}`;
    // Google matches the company name anywhere on the page (e.g. "people also viewed"),
    // so require it in the person's own headline or experience snippet.
    // A bare mention elsewhere in the snippet is usually a past job or, for a
    // dictionary-word company like Perplexity, just the word: only the headline
    // or Google's "Experience: <company>" (current employer) counts.
    const inTitle = mentions(p.title ?? "", key);
    const exp = p.snippet.match(/experience:\s*([^·|]+)/i);
    const current = inTitle || (exp ? mentions(exp[1], key) : false);
    if (!current) continue;
    const school = schoolIn(text);
    let score = inTitle ? 25 : 0;
    const why: string[] = [];
    if (school) {
      score += 100;
      why.push(`${school} alum`);
    }
    if (p.title && RELEVANT_TITLE.test(p.title)) {
      score += 30;
      if (SENIORITY.test(p.title)) score += 20;
    }
    if (p.title && RECRUITING.test(p.title)) score += 10;
    if (p.title && INTERN.test(p.title) && !SENIORITY.test(p.title)) score -= 40;
    if (p.title && sharesWords(p.title, roleTitle)) {
      score += 15;
      why.push("works on the team this role sits in");
    } else if (p.title && RELEVANT_TITLE.test(p.title)) {
      why.push("does the kind of work the role describes");
    } else if (p.title && RECRUITING.test(p.title)) {
      why.push("recruiting side");
    }
    if (bucket === "alumni" && !school) score += 5; // Google matched a school we couldn't see in the snippet
    const existing = byUrl.get(p.url);
    const reason = why.length ? why.join("; ") : `at ${company}`;
    if (!existing || existing.score < score) {
      byUrl.set(p.url, { ...p, bucket: school ? "alumni" : bucket, school, score, reason });
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function sharesWords(a: string, b: string): boolean {
  const stop = new Set(["intern", "internship", "summer", "2027", "and", "of", "the", "at", "engineer", "engineering"]);
  const wa = new Set(a.toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length > 2 && !stop.has(w)) ?? []);
  return (b.toLowerCase().match(/[a-z]+/g) ?? []).some((w) => w.length > 2 && !stop.has(w) && wa.has(w));
}

/** Shape stored in roles.outreach_hooks: readable by parseHooks in types.ts. */
export function toHooks(cands: Candidate[], max = 3) {
  return cands.slice(0, max).map((c) => ({
    name: c.name,
    title: c.title,
    url: c.url,
    source: "search",
    text: c.reason,
    school: c.school,
  }));
}

export async function searchPeople(
  company: string,
  roleTitle: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ candidates: Candidate[]; queries: number }> {
  const queries = buildQueries(company);
  const raw: { bucket: Candidate["bucket"]; hit: SearchHit }[] = [];
  await Promise.all(
    queries.map(async ({ bucket, q }) => {
      const res = await fetchImpl("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q, num: 10 }),
      });
      if (!res.ok) throw new Error(`Search ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      const json = (await res.json()) as { organic?: SearchHit[] };
      for (const hit of json.organic ?? []) raw.push({ bucket, hit });
    })
  );
  return { candidates: rankCandidates(raw, company, roleTitle), queries: queries.length };
}
