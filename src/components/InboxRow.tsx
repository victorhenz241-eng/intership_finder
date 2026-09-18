"use client";

import { memo } from "react";
import type { Role } from "@/lib/types";
import { relativeTime, safeHttpUrl, shortDate } from "@/lib/format";
import ScoreChip from "./ScoreChip";
import EligibilityMark from "./EligibilityMark";

type Props = {
  role: Role;
  view: "inbox" | "dismissed";
  cursor: boolean;
  checked: boolean;
  onCheck: (id: string, shift: boolean) => void;
  onOpen: (id: string) => void;
  onDismiss: (id: string) => void;
  onSave: (id: string) => void;
  onRestore: (id: string) => void;
  /** Other rows folded under this one, when it is a group's primary. */
  duplicates?: Role[];
  expanded?: boolean;
  onToggleDuplicates?: (id: string) => void;
  /** Likely-ineligible row revealed by "Show ineligible": greyed, reason inline. */
  dimmed?: boolean;
};

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function InboxRowImpl({ role, view, cursor, checked, onCheck, onOpen, onDismiss, onSave, onRestore, duplicates, expanded, onToggleDuplicates, dimmed }: Props) {
  const dupeCount = duplicates?.length ?? 0;
  return (
    <li
      data-row-id={role.id}
      role="option"
      aria-selected={cursor}
      onClick={() => onOpen(role.id)}
      className={`group grid cursor-pointer grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-2 border-b border-rule px-2 py-2 text-[13px] sm:min-h-[34px] sm:grid-cols-[1.5rem_2.75rem_minmax(0,1fr)_10rem_5rem_3rem_auto] sm:py-0 ${
        cursor ? "bg-[#e6ebf9] ring-1 ring-inset ring-[#b9c5ee]" : checked ? "bg-[#eef0f5]" : "bg-card hover:bg-[#f6f7f9]"
      } ${dimmed ? "opacity-60 hover:opacity-100 aria-selected:opacity-100" : ""}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => {
          e.stopPropagation();
          onCheck(role.id, e.shiftKey);
        }}
        onChange={() => {}}
        aria-label={`Select ${role.company} ${role.title}`}
        className="h-3.5 w-3.5 accent-accent"
      />

      <div className="flex min-w-0 items-center gap-2 sm:contents">
        <ScoreChip role={role} size="sm" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 shrink truncate">
            <span className="text-ink">{role.company}</span>
            <span className="text-ink-3"> — </span>
            <span className="text-ink-2">{role.title}</span>
          </span>
          <EligibilityMark role={role} reason={dimmed} />
          {dupeCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleDuplicates?.(role.id);
              }}
              aria-expanded={expanded}
              title={`${dupeCount} more listing${dupeCount === 1 ? "" : "s"} of this job (d)`}
              className="shrink-0 rounded border border-rule-2 px-1.5 py-px text-[11px] tabular-nums text-ink-2 hover:bg-[#e6ebf9]"
            >
              +{dupeCount}
            </button>
          )}
        </div>
      </div>

      <span className="col-start-2 truncate text-xs text-ink-3 sm:col-start-auto" title={role.location ?? ""}>
        {role.location ?? "—"}
      </span>
      <span className="hidden truncate text-xs text-ink-3 sm:inline">{role.source ?? "—"}</span>
      <span
        className="hidden text-xs tabular-nums text-ink-3 sm:inline"
        title={`Seen ${shortDate(role.first_seen)} · Posted ${shortDate(role.posted_at)}`}
      >
        {relativeTime(role.first_seen)}
      </span>

      <div
        className="col-start-2 flex items-center gap-1 sm:col-start-auto sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:group-aria-selected:opacity-100"
        onClick={stop}
      >
        {safeHttpUrl(role.url) && (
          <a
            href={safeHttpUrl(role.url)!}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded px-1.5 py-0.5 text-xs text-accent hover:bg-[#e6ebf9]"
            title="Open original posting"
          >
            open
          </a>
        )}
        {view === "inbox" ? (
          <>
            <button type="button" onClick={() => onSave(role.id)} className="rounded px-1.5 py-0.5 text-xs text-ink hover:bg-[#e2f4ea]" title="Save to pipeline (s)">
              save
            </button>
            <button type="button" onClick={() => onDismiss(role.id)} className="rounded px-1.5 py-0.5 text-xs text-ink-2 hover:bg-[#e6e8ec]" title="Dismiss (e)">
              dismiss
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onRestore(role.id)} className="rounded px-1.5 py-0.5 text-xs text-ink hover:bg-[#e2f4ea]" title="Restore to inbox (e)">
            restore
          </button>
        )}
      </div>

      {expanded && dupeCount > 0 && (
        <ul className="col-span-full mb-1 mt-1 border-l-2 border-rule-2 pl-3 text-xs text-ink-2 sm:ml-[3.25rem]" onClick={stop}>
          {duplicates!.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-0.5">
              <span className="truncate">{d.title}</span>
              {/* No eligibility mark here: enrichment grades primaries only, so a duplicate's verdict is never set. */}
              <span className="text-ink-3">{d.location ?? "—"}</span>
              <span className="text-ink-3">{d.source ?? "—"}</span>
              <span className="text-ink-3">{d.stage !== "found" ? d.stage : ""}</span>
              {safeHttpUrl(d.url) && (
                <a href={safeHttpUrl(d.url)!} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  open
                </a>
              )}
              <button type="button" onClick={() => onOpen(d.id)} className="text-ink-2 underline-offset-2 hover:underline">
                details
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

const InboxRow = memo(InboxRowImpl);
export default InboxRow;
