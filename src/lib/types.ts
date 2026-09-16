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
  stage: Stage;
  draft_message: string | null;
  notes: string | null;
  updated_at: string | null;
};

export function isPipelineStage(s: Stage): s is PipelineStage {
  return (PIPELINE_STAGES as readonly Stage[]).includes(s);
}

/** A row the scorer never evaluated: no score and no reasoning. */
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
