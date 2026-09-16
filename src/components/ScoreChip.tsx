import type { Severity } from "@/lib/types";

const STYLES: Record<Severity, string> = {
  strong: "bg-[var(--strong-bg)] text-[var(--strong)]",
  decent: "bg-[var(--decent-bg)] text-[var(--decent)]",
  skip: "bg-[var(--skip-bg)] text-[var(--skip)]",
};

export default function ScoreChip({
  score,
  severity,
}: {
  score: number;
  severity: Severity;
}) {
  return (
    <span
      className={`inline-flex h-11 min-w-[3.25rem] items-center justify-center rounded-md px-2 font-display text-[1.75rem] font-semibold leading-none tabular-nums tracking-tight ${STYLES[severity]}`}
      aria-label={`Fit score ${score} out of 100, ${severity} match`}
      title={`Fit ${score}/100`}
    >
      {score}
    </span>
  );
}
