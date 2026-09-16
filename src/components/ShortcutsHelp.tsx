"use client";

import { useEffect, useRef } from "react";

const ROWS: [string, string][] = [
  ["j / k", "Move down / up"],
  ["o / Enter", "Open detail"],
  ["e", "Dismiss (or restore, in Dismissed)"],
  ["s", "Save to pipeline"],
  ["x", "Toggle checkbox on current row"],
  ["d", "Fold / unfold duplicate listings"],
  ["u", "Undo the last dismiss"],
  ["Esc", "Close detail / clear selection"],
  ["?", "This help"],
];

export default function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-ink/20 p-4 pt-24" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="w-full max-w-sm rounded-lg border border-rule bg-card p-4 shadow-lg outline-none"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg text-ink">Keyboard shortcuts</h2>
          <button type="button" onClick={onClose} className="text-xs text-ink-3 hover:text-ink">
            Close
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {ROWS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-rule-2 bg-page px-1.5 py-0.5 font-mono text-xs text-ink">{k}</kbd>
              </dt>
              <dd className="text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
