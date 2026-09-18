import { CONTACT_STATUS_LABELS, STAGE_LABELS, isPipelineStage, isPrimary, type Contact, type Role } from "./types";

function cell(v: unknown): string {
  const t = v == null ? "" : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** Every pipeline role, one row each, contacts folded into one column. Runs entirely in the browser. */
export function exportPipelineCsv(roles: Role[], contacts: Contact[]) {
  const byRole = new Map<string, Contact[]>();
  for (const c of contacts) byRole.set(c.role_id, [...(byRole.get(c.role_id) ?? []), c]);
  const header = ["company", "title", "stage", "stage_changed_at", "fit_score", "severity", "location", "url", "posted_at", "eligibility", "contacts", "emphasis", "notes"];
  const lines = [header.join(",")];
  for (const r of roles) {
    if (!isPipelineStage(r.stage) || !isPrimary(r)) continue;
    const cs = (byRole.get(r.id) ?? []).map((c) => `${c.name}${c.title ? ` (${c.title})` : ""} [${CONTACT_STATUS_LABELS[c.status]}]${c.profile_url ? ` ${c.profile_url}` : ""}`).join("; ");
    lines.push(
      [r.company, r.title, STAGE_LABELS[r.stage], r.stage_changed_at, r.fit_score, r.severity, r.location, r.url, r.posted_at, r.eligibility, cs, r.draft_message, r.notes]
        .map(cell)
        .join(",")
    );
  }
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `internship-radar-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
