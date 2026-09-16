export const STAGES = [
  "found",
  "interested",
  "applied",
  "replied",
  "interview",
  "closed",
] as const;

export type Stage = (typeof STAGES)[number];
export type Severity = "strong" | "decent" | "skip";

export const STAGE_LABELS: Record<Stage, string> = {
  found: "Found",
  interested: "Interested",
  applied: "Applied",
  replied: "Replied",
  interview: "Interview",
  closed: "Closed",
};

export type Role = {
  id: string;
  company: string;
  title: string;
  location: string | null;
  url: string | null;
  fit_score: number;
  severity: Severity;
  why: string | null;
  stage: Stage;
  updated_at: string;
};
