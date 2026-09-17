export const STAGES = [
  "found",
  "dismissed",
  "interested",
  "applied",
  "replied",
  "interview",
  "offer",
  "closed",
] as const;

export type Stage = (typeof STAGES)[number];
export type Severity = "strong" | "decent" | "skip";
/** Written by the n8n enrichment workflow. Most rows sit at `unknown` for a long time. */
export type Eligibility = "eligible" | "likely_ineligible" | "unknown";

export const PIPELINE_STAGES = [
  "interested",
  "applied",
  "replied",
  "interview",
  "offer",
  "closed",
] as const satisfies readonly Stage[];

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  found: "Inbox",
  dismissed: "Dismissed",
  interested: "Interested",
  applied: "Applied",
  replied: "Replied",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
};

export type Role = {
  id: string;
  source: string | null;
  external_id: string | null;
  company: string;
  title: string;
  location: string | null;
  url: string | null;
  description: string | null;
  posted_at: string | null;
  first_seen: string | null;
  fit_score: number | null;
  severity: Severity | null;
  why: string | null;
  dedup_group: string | null;
  eligibility: Eligibility | null;
  eligibility_reason: string | null;
  /** Fetched job description (full or excerpt). Third-party text: render as text only. */
  jd_text: string | null;
  /** Stamped by the enrichment workflow on every pass (drains its queue). Read-only here; the app never writes it. */
  eligibility_checked_at: string | null;
  stage: Stage;
  draft_message: string | null;
  notes: string | null;
  updated_at: string | null;
};

/**
 * The dedup service sets `dedup_group` to the primary's own id for every row
 * in a group. A row is shown when it matched nothing or is its group's primary.
 */
export function isPrimary(r: Pick<Role, "id" | "dedup_group">): boolean {
  return !r.dedup_group || r.dedup_group === r.id;
}

/**
 * Only an explicit verdict counts. `unknown`, null and anything unexpected are
 * treated as visible: a role is never hidden because enrichment hasn't reached it.
 */
export function isLikelyIneligible(r: Pick<Role, "eligibility">): boolean {
  return r.eligibility === "likely_ineligible";
}

export type ReasonKind = "degree" | "skills" | "visa" | "other";
export const REASON_KIND_ORDER: readonly ReasonKind[] = ["degree", "skills", "visa", "other"];

const VISA_RE = /\b(j-?1|f-?1|visa|citizen|citizenship|clearance|us person|permanent resident|green card|work authori[sz]ation|sponsor)/i;
const DEGREE_RE = /\b(master|phd|ph\.d|doctorate|doctoral|bachelor|degree|graduate|undergrad|m\.?s\.?c?\b)/i;
const SKILLS_RE = /(c\+\+|\bc#|\bjava\b|\bgo(lang)?\b|\bscala\b|\bkotlin\b|\bruby\b|\bphp\b|\bswift\b|\bmatlab\b|\brust\b|language|fluen|proficien|experience (with|in)|\bskill|years of)/i;

/**
 * Coarse bucket for an eligibility_reason so the hidden count can say why.
 * The text is model-written prose, so this is deliberately forgiving:
 * visa first (a J-1 line rarely mentions a degree), then degree (the less
 * recoverable of the two when both appear), then skills, else "other".
 * Never throws on unexpected input.
 */
export function reasonKind(reason: unknown): ReasonKind {
  const t = typeof reason === "string" ? reason : reason == null ? "" : String(reason);
  if (!t.trim()) return "other";
  if (VISA_RE.test(t)) return "visa";
  if (DEGREE_RE.test(t)) return "degree";
  if (SKILLS_RE.test(t)) return "skills";
  return "other";
}

/** "15 degree, 2 visa" — zero buckets omitted; empty string when nothing is counted. */
export function describeReasonKinds(rows: Pick<Role, "eligibility_reason">[]): string {
  const counts: Record<ReasonKind, number> = { degree: 0, skills: 0, visa: 0, other: 0 };
  for (const r of rows) counts[reasonKind(r.eligibility_reason)]++;
  return REASON_KIND_ORDER.filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${k}`)
    .join(", ");
}

export function isPipelineStage(s: Stage): s is PipelineStage {
  return (PIPELINE_STAGES as readonly Stage[]).includes(s);
}

/**
 * A row the scorer never evaluated: no score and no reasoning.
 * n8n writes NULL fit_score/severity/why on a failed scoring call; older rows
 * carry 0/skip/"". Both are unscored. A real 0 always comes with a `why`.
 */
export function isUnscored(r: Pick<Role, "fit_score" | "why">): boolean {
  return !r.fit_score && !(r.why && r.why.trim());
}

const SEVERITY_RANK: Record<Severity, number> = { strong: 0, decent: 1, skip: 2 };

/** Inbox order: strong → decent → skip → unscored; then fit desc; then newest first. */
export function compareForInbox(a: Role, b: Role): number {
  const ua = isUnscored(a) ? 1 : 0;
  const ub = isUnscored(b) ? 1 : 0;
  if (ua !== ub) return ua - ub;
  const sa = SEVERITY_RANK[a.severity ?? "skip"];
  const sb = SEVERITY_RANK[b.severity ?? "skip"];
  if (sa !== sb) return sa - sb;
  const fa = a.fit_score ?? -1;
  const fb = b.fit_score ?? -1;
  if (fa !== fb) return fb - fa;
  return (b.first_seen ?? "").localeCompare(a.first_seen ?? "");
}

export function isNewToday(r: Pick<Role, "first_seen">, now = Date.now()): boolean {
  if (!r.first_seen) return false;
  return now - new Date(r.first_seen).getTime() < 24 * 60 * 60 * 1000;
}

export type ParsedMeta = { category?: string; terms?: string; sponsorship?: string; degrees?: string };

/**
 * The simplify source writes description as
 * "Category: Software. Terms: Summer 2027. Sponsorship: Other. Degrees: Bachelor's."
 * Returns null when the text does not follow that shape (e.g. greenhouse excerpts).
 */
export function parseMeta(description: string | null): ParsedMeta | null {
  if (!description || description.length > 400) return null;
  const labels = ["Category", "Terms", "Sponsorship", "Degrees"] as const;
  const hits = labels
    .map((label) => ({ label, at: description.indexOf(label + ":") }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (hits.length < 2) return null;
  const out: ParsedMeta = {};
  hits.forEach((h, i) => {
    const from = h.at + h.label.length + 1;
    const to = i + 1 < hits.length ? hits[i + 1].at : description.length;
    const value = description.slice(from, to).trim().replace(/\.$/, "").trim();
    if (value) out[h.label.toLowerCase() as keyof ParsedMeta] = value;
  });
  return Object.keys(out).length >= 2 ? out : null;
}
