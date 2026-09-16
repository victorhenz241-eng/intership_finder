"use client";

import { memo } from "react";
import type { Role } from "@/lib/types";
import { relativeTime, shortDate } from "@/lib/format";
import ScoreChip from "./ScoreChip";

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
};

function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function InboxRowImpl({ role, view, cursor, checked, onCheck, onOpen, onDismiss, onSave, onRestore }: Props) {
  return (
    <li
      data-row-id={role.id}
      role="option"
      aria-selected={cursor}
      onClick={() => onOpen(role.id)}
      className={`group grid cursor-pointer grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-2 border-b border-rule px-2 py-2 text-[13px] sm:h-[34px] sm:grid-cols-[1.5rem_2.75rem_minmax(0,1fr)_10rem_5rem_3rem_auto] sm:py-0 ${
        cursor ? "bg-[#e6ebf9] ring-1 ring-inset ring-[#b9c5ee]" : checked ? "bg-[#eef0f5]" : "bg-card hover:bg-[#f6f7f9]"
      }`}
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
        <div className="min-w-0 truncate">
          <span className="text-ink">{role.company}</span>
          <span className="text-ink-3"> — </span>
          <span className="text-ink-2">{role.title}</span>
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
        {role.url && (
          <a
            href={role.url}
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
    </li>
  );
}

const InboxRow = memo(InboxRowImpl);
export default InboxRow;
