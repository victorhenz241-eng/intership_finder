import type { Role } from "@/lib/types";
import { isUnscored } from "@/lib/types";

const STYLES = {
  strong: "bg-[var(--strong-bg)] text-[var(--strong)]",
  decent: "bg-[var(--decent-bg)] text-[var(--decent)]",
  skip: "bg-[var(--skip-bg)] text-[var(--skip)]",
  unscored: "bg-transparent text-ink-3 border border-dashed border-rule-2",
} as const;

const SIZES = {
  sm: "h-6 min-w-[2.25rem] px-1.5 text-[15px] rounded",
  md: "h-8 min-w-[2.75rem] px-2 text-[20px] rounded-md",
  lg: "h-11 min-w-[3.25rem] px-2 text-[1.75rem] rounded-md",
} as const;

export default function ScoreChip({
  role,
  size = "md",
}: {
  role: Pick<Role, "fit_score" | "severity" | "why">;
  size?: keyof typeof SIZES;
}) {
  const unscored = isUnscored(role);
  const key = unscored ? "unscored" : role.severity ?? "skip";
  const label = unscored
    ? "Not scored yet"
    : `Fit score ${role.fit_score} out of 100, ${role.severity} match`;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-display font-semibold leading-none tabular-nums tracking-tight ${SIZES[size]} ${STYLES[key]}`}
      aria-label={label}
      title={label}
    >
      {unscored ? "–" : role.fit_score}
    </span>
  );
}
