"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoles } from "@/lib/store";
import { useQueryState } from "@/lib/url";
import { compareForInbox, isNewToday, isUnscored } from "@/lib/types";
import InboxRow from "./InboxRow";
import ShortcutsHelp from "./ShortcutsHelp";

type Segment = "all" | "strong" | "decent" | "new";
const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "all", label: "All" },
  { key: "strong", label: "Strong" },
  { key: "decent", label: "Decent" },
  { key: "new", label: "New today" },
];

type Undo = { ids: string[]; label: string };

function isTypingTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

export default function Inbox() {
  const { roles, status, error, refresh, updateMany } = useRoles();
  const { params, set } = useQueryState();

  const view: "inbox" | "dismissed" = params.get("view") === "dismissed" ? "dismissed" : "inbox";
  const segment = (params.get("f") as Segment) || "all";
  const query = params.get("q") ?? "";
  const source = params.get("s") ?? "";
  const openId = params.get("role");

  const [cursorId, setCursorId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [help, setHelp] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  /** Set when the row shown in the drawer is dismissed/saved, so the drawer follows the cursor. */
  const followDrawer = useRef(false);

  const stageWanted = view === "inbox" ? "found" : "dismissed";

  const pool = useMemo(() => roles.filter((r) => r.stage === stageWanted), [roles, stageWanted]);

  const sources = useMemo(
    () => Array.from(new Set(pool.map((r) => r.source ?? "").filter(Boolean))).sort(),
    [pool]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const out = pool.filter((r) => {
      if (segment === "strong" && r.severity !== "strong") return false;
      if (segment === "decent" && r.severity !== "decent") return false;
      if (segment === "new" && !isNewToday(r, now)) return false;
      if (source && r.source !== source) return false;
      if (q && !(r.company.toLowerCase().includes(q) || r.title.toLowerCase().includes(q))) return false;
      return true;
    });
    out.sort(compareForInbox);
    return out;
  }, [pool, segment, source, query]);

  const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);
  const cursorIdx = cursorId ? rowIndex.get(cursorId) ?? -1 : -1;

  // Keep the cursor on a real row; when its row vanishes, land on the row that took its place.
  const lastIdx = useRef(0);
  useEffect(() => {
    if (cursorIdx >= 0) {
      lastIdx.current = cursorIdx;
      return;
    }
    if (rows.length === 0) {
      setCursorId(null);
      if (followDrawer.current) {
        followDrawer.current = false;
        set({ role: null });
      }
      return;
    }
    const nextId = rows[Math.min(lastIdx.current, rows.length - 1)].id;
    setCursorId(nextId);
    if (followDrawer.current) {
      followDrawer.current = false;
      set({ role: nextId });
    }
  }, [cursorIdx, rows, set]);

  // Checked rows that left the list are dropped from the selection.
  useEffect(() => {
    setChecked((prev) => {
      const next = new Set(Array.from(prev).filter((id) => rowIndex.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rowIndex]);

  const scrollCursorIntoView = useCallback((id: string) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  const moveCursor = useCallback(
    (delta: number) => {
      if (rows.length === 0) return;
      const next = Math.max(0, Math.min(rows.length - 1, (cursorIdx < 0 ? -1 : cursorIdx) + delta));
      const id = rows[next].id;
      setCursorId(id);
      scrollCursorIntoView(id);
      if (openId) set({ role: id });
    },
    [rows, cursorIdx, scrollCursorIntoView, openId, set]
  );

  const open = useCallback(
    (id: string) => {
      setCursorId(id);
      set({ role: id });
    },
    [set]
  );

  const dismiss = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setUndo({ ids, label: ids.length === 1 ? "Dismissed 1 role" : `Dismissed ${ids.length} roles` });
      if (openId && ids.includes(openId)) followDrawer.current = true;
      setChecked(new Set());
      const err = await updateMany(ids, { stage: "dismissed" });
      if (err) setUndo(null);
    },
    [updateMany, openId]
  );

  const save = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      if (openId && ids.includes(openId)) followDrawer.current = true;
      setChecked(new Set());
      await updateMany(ids, { stage: "interested" });
    },
    [updateMany, openId]
  );

  const restore = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setChecked(new Set());
      await updateMany(ids, { stage: "found" });
    },
    [updateMany]
  );

  const undoNow = useCallback(async () => {
    if (!undo) return;
    const ids = undo.ids;
    setUndo(null);
    setCursorId(ids[0]);
    await updateMany(ids, { stage: "found" });
    scrollCursorIntoView(ids[0]);
  }, [undo, updateMany, scrollCursorIntoView]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  const toggleCheck = useCallback(
    (id: string, shift: boolean) => {
      setChecked((prev) => {
        const next = new Set(prev);
        if (shift && lastChecked && rowIndex.has(lastChecked) && rowIndex.has(id)) {
          const a = rowIndex.get(lastChecked)!;
          const b = rowIndex.get(id)!;
          const [lo, hi] = a < b ? [a, b] : [b, a];
          const turnOn = !prev.has(id);
          for (let i = lo; i <= hi; i++) {
            if (turnOn) next.add(rows[i].id);
            else next.delete(rows[i].id);
          }
        } else {
          if (next.has(id)) next.delete(id);
          else next.add(id);
        }
        return next;
      });
      setLastChecked(id);
    },
    [lastChecked, rowIndex, rows]
  );

  const skipIds = useMemo(
    () => rows.filter((r) => r.severity === "skip" && !isUnscored(r)).map((r) => r.id),
    [rows]
  );

  /** Targets for a keyboard action: the checked rows if any, else the cursor row. */
  const targets = useCallback(() => {
    if (checked.size > 0) return Array.from(checked);
    return cursorId ? [cursorId] : [];
  }, [checked, cursorId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (help) {
        if (e.key === "Escape" || e.key === "?") setHelp(false);
        return;
      }
      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          moveCursor(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          moveCursor(-1);
          break;
        case "o":
        case "Enter":
          if (cursorId) {
            e.preventDefault();
            open(cursorId);
          }
          break;
        case "e":
          e.preventDefault();
          if (view === "inbox") dismiss(targets());
          else restore(targets());
          break;
        case "s":
          if (view === "inbox") {
            e.preventDefault();
            save(targets());
          }
          break;
        case "x":
          if (cursorId) {
            e.preventDefault();
            toggleCheck(cursorId, false);
          }
          break;
        case "u":
          if (undo) {
            e.preventDefault();
            undoNow();
          }
          break;
        case "?":
          e.preventDefault();
          setHelp(true);
          break;
        case "Escape":
          if (openId) set({ role: null });
          else if (checked.size) setChecked(new Set());
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [help, moveCursor, cursorId, open, view, dismiss, restore, save, targets, toggleCheck, undo, undoNow, openId, set, checked.size]);

  const one = useCallback((fn: (ids: string[]) => void) => (id: string) => fn([id]), []);
  const onDismiss = useMemo(() => one(dismiss), [one, dismiss]);
  const onSave = useMemo(() => one(save), [one, save]);
  const onRestore = useMemo(() => one(restore), [one, restore]);

  const unscoredCount = useMemo(() => rows.filter(isUnscored).length, [rows]);

  return (
    <main className="mx-auto w-full max-w-[120rem] flex-1 px-4 pb-24 sm:px-6">
      <div className="sticky top-14 z-20 -mx-4 border-b border-rule bg-page/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex min-h-11 flex-wrap items-center gap-2 py-1.5 sm:flex-nowrap">
          <div role="tablist" aria-label="Filter" className="flex items-center gap-0.5 rounded-md bg-[#e3e6eb] p-0.5">
            {SEGMENTS.map((s) => (
              <button
                key={s.key}
                role="tab"
                aria-selected={segment === s.key}
                onClick={() => set({ f: s.key === "all" ? null : s.key })}
                className={`h-7 rounded px-2.5 text-xs ${
                  segment === s.key ? "bg-card text-ink shadow-[0_1px_2px_rgba(22,24,29,0.08)]" : "text-ink-2 hover:text-ink"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search company or title"
            aria-label="Search company or title"
            className="h-7 w-full min-w-[10rem] rounded-md border border-rule-2 bg-card px-2 text-xs text-ink placeholder:text-ink-3 sm:w-56"
          />
          <select
            value={source}
            onChange={(e) => set({ s: e.target.value || null })}
            aria-label="Source"
            className="h-7 rounded-md border border-rule-2 bg-card px-1.5 text-xs text-ink"
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-2">
            {view === "inbox" && skipIds.length > 0 && checked.size === 0 && (
              <button
                type="button"
                onClick={() => setChecked(new Set(skipIds))}
                className="h-7 rounded-md border border-rule-2 bg-card px-2 text-xs text-ink hover:bg-[#f6f7f9]"
                title="Check every scored skip-severity row in view. Unscored rows are left alone."
              >
                Select {skipIds.length} skips
              </button>
            )}
            <button
              type="button"
              onClick={() => set({ view: view === "inbox" ? "dismissed" : null })}
              className={`h-7 rounded-md px-2 text-xs ${
                view === "dismissed" ? "bg-ink text-card" : "border border-rule-2 bg-card text-ink-2 hover:text-ink"
              }`}
            >
              {view === "inbox" ? "Dismissed" : "Back to inbox"}
            </button>
            <button
              type="button"
              onClick={() => setHelp(true)}
              aria-label="Keyboard shortcuts"
              className="h-7 w-7 rounded-md border border-rule-2 bg-card text-xs text-ink-2 hover:text-ink"
            >
              ?
            </button>
          </div>
        </div>
      {checked.size > 0 && (
        <div className="-mx-4 flex flex-wrap items-center gap-2 border-t border-rule bg-[#e6ebf9] px-4 py-1.5 text-xs text-ink sm:-mx-6 sm:px-6">
          <span className="tabular-nums">{checked.size} selected</span>
          {view === "inbox" ? (
            <>
              <button type="button" onClick={() => dismiss(Array.from(checked))} className="rounded bg-ink px-2 py-1 text-card">
                Dismiss selected
              </button>
              <button type="button" onClick={() => save(Array.from(checked))} className="rounded border border-rule-2 bg-card px-2 py-1">
                Save selected
              </button>
            </>
          ) : (
            <button type="button" onClick={() => restore(Array.from(checked))} className="rounded bg-ink px-2 py-1 text-card">
              Restore selected
            </button>
          )}
          <button type="button" onClick={() => setChecked(new Set())} className="text-ink-2 underline-offset-2 hover:underline">
            Clear
          </button>
        </div>
      )}
      </div>

      <div className="flex items-center justify-between py-1.5 text-xs text-ink-3">
        <span className="tabular-nums">
          {rows.length} {view === "inbox" ? "in inbox" : "dismissed"}
          {rows.length !== pool.length ? ` of ${pool.length}` : ""}
          {unscoredCount > 0 ? ` · ${unscoredCount} not scored yet` : ""}
        </span>
        <span className="hidden sm:inline">strong → decent → skip → unscored, then fit, then newest</span>
      </div>

      {status === "error" && (
        <div role="alert" className="rounded-lg border border-rule-2 bg-card p-5 text-sm">
          <p className="font-medium text-ink">Couldn&apos;t load roles.</p>
          <p className="mt-1 text-ink-2">{error}</p>
          {error && /permission denied|row-level security|42501/i.test(error) && (
            <p className="mt-2 text-ink-2">Permission was denied. Run the RLS policy SQL from the README in the Supabase SQL editor.</p>
          )}
          <button type="button" onClick={() => refresh()} className="mt-3 rounded-md border border-rule-2 px-3 py-1.5 text-sm hover:bg-[#f6f7f9]">
            Try again
          </button>
        </div>
      )}

      {status === "loading" && (
        <ul aria-busy="true" className="rounded-lg border border-rule bg-card">
          {Array.from({ length: 12 }).map((_, i) => (
            <li key={i} className="h-[34px] border-b border-rule motion-safe:animate-pulse" />
          ))}
        </ul>
      )}

      {status === "ready" && rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-rule-2 px-4 py-12 text-center text-sm text-ink-3">
          {pool.length === 0
            ? view === "inbox"
              ? "Inbox zero. Nothing left to triage."
              : "Nothing dismissed."
            : "No roles match these filters."}
        </p>
      )}

      {status === "ready" && rows.length > 0 && (
        <ul ref={listRef} role="listbox" aria-label={view === "inbox" ? "Inbox" : "Dismissed roles"} className="rounded-lg border border-rule bg-card">
          {rows.map((r) => (
            <InboxRow
              key={r.id}
              role={r}
              view={view}
              cursor={r.id === cursorId}
              checked={checked.has(r.id)}
              onCheck={toggleCheck}
              onOpen={open}
              onDismiss={onDismiss}
              onSave={onSave}
              onRestore={onRestore}
            />
          ))}
        </ul>
      )}

      {undo && (
        <div role="status" className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md bg-ink px-3 py-2 text-sm text-card shadow-lg">
          <span>{undo.label}</span>
          <button type="button" onClick={undoNow} className="rounded bg-card/15 px-2 py-0.5 text-xs hover:bg-card/25">
            Undo <kbd className="ml-1 opacity-70">u</kbd>
          </button>
        </div>
      )}

      <ShortcutsHelp open={help} onClose={() => setHelp(false)} />
    </main>
  );
}
