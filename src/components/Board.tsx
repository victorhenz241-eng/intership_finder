"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { getSupabase } from "@/lib/supabase";
import { STAGES, type Role, type Stage } from "@/lib/types";
import Column from "./Column";
import { RoleCardBody } from "./RoleCard";

type Status = "loading" | "ready" | "error";

function isPermissionError(message: string) {
  return /permission denied|row-level security|rls|42501/i.test(message);
}

export default function Board() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      const { data, error } = await getSupabase()
        .from("roles")
        .select("*")
        .order("fit_score", { ascending: false });
      if (error) throw error;
      setRoles((data ?? []) as Role[]);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s, [] as Role[]])) as Record<
      Stage,
      Role[]
    >;
    for (const r of roles) (map[r.stage] ?? map.found).push(r);
    for (const s of STAGES) map[s].sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0));
    return map;
  }, [roles]);

  const strongCount = roles.filter((r) => r.severity === "strong").length;
  const activeRole = activeId ? roles.find((r) => r.id === activeId) : undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const id = String(active.id);
    const nextStage = over.id as Stage;
    const current = roles.find((r) => r.id === id);
    if (!current || current.stage === nextStage) return;

    const previousStage = current.stage;
    setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, stage: nextStage } : r)));

    const { error } = await getSupabase()
      .from("roles")
      .update({ stage: nextStage })
      .eq("id", id);

    if (error) {
      setRoles((rs) =>
        rs.map((r) => (r.id === id ? { ...r, stage: previousStage } : r))
      );
      setNotice(
        isPermissionError(error.message)
          ? "Couldn't save the move: permission denied. Run the Supabase RLS policy from the README."
          : `Couldn't save the move: ${error.message}`
      );
    }
  }

  return (
    <main className="mx-auto max-w-[110rem] px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            Internship tracker
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {status === "ready" ? (
              <>
                <span className="tabular-nums text-ink">{roles.length}</span> roles,{" "}
                <span className="tabular-nums text-ink">{strongCount}</span> strong
                {strongCount === 1 ? " match" : " matches"}
              </>
            ) : status === "loading" ? (
              "Loading roles…"
            ) : (
              "Couldn't load roles"
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={status === "loading"}
          className="rounded-md border border-rule-2 bg-card px-3 py-1.5 text-sm text-ink hover:bg-[#f6f7f9] disabled:opacity-50"
        >
          {status === "loading" ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {notice && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-[#f0c9c9] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8a2626]"
        >
          {notice}
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="rounded-lg border border-rule-2 bg-card p-5 text-sm">
          <p className="font-medium text-ink">Couldn&apos;t load the board.</p>
          <p className="mt-1 text-ink-2">{error}</p>
          {error && isPermissionError(error) && (
            <p className="mt-2 text-ink-2">
              Permission was denied. The <code>roles</code> table needs a row-level
              security policy that allows reads and stage updates for the anon role. The
              SQL is in the README.
            </p>
          )}
          <button
            type="button"
            onClick={load}
            className="mt-3 rounded-md border border-rule-2 px-3 py-1.5 text-sm hover:bg-[#f6f7f9]"
          >
            Try again
          </button>
        </div>
      )}

      {status === "loading" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-busy="true">
          {STAGES.map((s) => (
            <div key={s} className="h-40 rounded-xl bg-[#e7e9ee] motion-safe:animate-pulse" />
          ))}
        </div>
      )}

      {status === "ready" && (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex gap-3 overflow-x-auto pb-4 lg:grid lg:grid-cols-6 lg:overflow-visible">
            {STAGES.map((stage) => (
              <Column key={stage} stage={stage} roles={byStage[stage]} />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeRole ? (
              <article className="w-[17rem] rounded-lg border border-rule-2 bg-card p-3.5 shadow-[0_8px_24px_rgba(22,24,29,0.16)] lg:w-auto">
                <RoleCardBody role={activeRole} />
              </article>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </main>
  );
}
