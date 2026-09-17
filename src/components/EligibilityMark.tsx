import type { Role } from "@/lib/types";
import { isLikelyIneligible } from "@/lib/types";

/**
 * Amber "Check" pill for a likely-ineligible role. Renders nothing for `eligible`
 * and `unknown`: most rows are unknown and that must never read as a problem.
 */
export default function EligibilityMark({
  role,
  reason = false,
}: {
  role: Pick<Role, "eligibility" | "eligibility_reason">;
  /** Also print the reason inline (truncated by the parent). */
  reason?: boolean;
}) {
  if (!isLikelyIneligible(role)) return null;
  const why = role.eligibility_reason?.trim() || "No reason recorded";
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={`Likely ineligible: ${why}`}>
      <span className="shrink-0 rounded bg-[var(--decent-bg)] px-1.5 py-px text-[11px] font-medium text-[var(--decent)]">
        Check
      </span>
      {reason && <span className="min-w-0 truncate text-xs text-ink-3">{why}</span>}
    </span>
  );
}
