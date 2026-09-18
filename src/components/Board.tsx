"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useRoles } from "@/lib/store";
import { useQueryState } from "@/lib/url";
import { PIPELINE_STAGES, STAGE_LABELS, isAwaitingReply, isPipelineStage, isPrimary, needsFollowUp, type PipelineStage, type Role } from "@/lib/types";
import ScoreChip from "./ScoreChip";
import { relativeTime } from "@/lib/format";
import { exportPipelineCsv } from "@/lib/export";

export default function Board() {
  const { roles, contacts, status, error, refresh, update } = useRoles();
  const { set } = useQueryState();
  const [activeId, setActiveId] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, [] as Role[]])) as Record<PipelineStage, Role[]>;
    for (const r of roles) if (isPipelineStage(r.stage) && isPrimary(r)) map[r.stage].push(r);
    for (const s of PIPELINE_STAGES) map[s].sort((a, b) => (b.fit_score ?? -1) - (a.fit_score ?? -1));
    return map;
  }, [roles]);

  const dismissedCount = useMemo(() => roles.filter((r) => r.stage === "dismissed").length, [roles]);
  const total = PIPELINE_STAGES.reduce((n, s) => n + byStage[s].length, 0);
  const active = activeId ? roles.find((r) => r.id === activeId) : undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over) return;
    const id = String(active.id);
    const next = over.id as PipelineStage;
    const role = roles.find((r) => r.id === id);
    if (!role || role.stage === next) return;
    update(id, { stage: next });
  }

  return (
    <main className="mx-auto w-full max-w-[120rem] flex-1 px-4 py-4 sm:px-6">
      <div className="mb-3 flex items-center justify-between text-xs text-ink-3">
        <span className="tabular-nums">{total} in pipeline</span>
        <span className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => exportPipelineCsv(roles, contacts)}
            disabled={status !== "ready" || total === 0}
            className="hover:text-ink disabled:opacity-50"
            title="Download every pipeline role with its contacts as CSV"
          >
            Export CSV
          </button>
          <Link href="/inbox?view=dismissed" className="hover:text-ink">
            Dismissed ({dismissedCount}) →
          </Link>
        </span>
      </div>

      {status === "error" && (
        <div role="alert" className="rounded-lg border border-rule-2 bg-card p-5 text-sm">
          <p className="font-medium text-ink">Couldn&apos;t load roles.</p>
          <p className="mt-1 text-ink-2">{error}</p>
          <button type="button" onClick={() => refresh()} className="mt-3 rounded-md border border-rule-2 px-3 py-1.5 text-sm hover:bg-[#f6f7f9]">
            Try again
          </button>
        </div>
      )}

      {status === "loading" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6" aria-busy="true">
          {PIPELINE_STAGES.map((s) => (
            <div key={s} className="h-40 rounded-xl bg-[#e7e9ee] motion-safe:animate-pulse" />
          ))}
        </div>
      )}

      {status === "ready" && (
        <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <div className="flex gap-3 overflow-x-auto pb-4 lg:grid lg:grid-cols-6 lg:overflow-visible">
            {PIPELINE_STAGES.map((stage) => (
              <Column key={stage} stage={stage} roles={byStage[stage]} onOpen={(id) => set({ role: id })} />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {active ? (
              <div className="w-[15rem] rounded-md border border-rule-2 bg-card p-2.5 shadow-[0_8px_24px_rgba(22,24,29,0.16)] lg:w-auto">
                <CardBody role={active} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </main>
  );
}

function Column({ stage, roles, onOpen }: { stage: PipelineStage; roles: Role[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`col-${stage}`}
      className={`flex min-h-[14rem] w-[16rem] shrink-0 flex-col rounded-xl border p-1.5 motion-safe:transition-colors lg:w-auto lg:min-w-0 ${
        isOver ? "border-rule-2 bg-[#e0e3e9]" : "border-transparent bg-[#e7e9ee]"
      }`}
    >
      <header className="flex items-baseline justify-between px-1.5 pb-1.5 pt-1">
        <h2 id={`col-${stage}`} className="text-sm font-medium text-ink">
          {STAGE_LABELS[stage]}
        </h2>
        <span className="text-xs tabular-nums text-ink-3">{roles.length}</span>
      </header>
      <div className="flex flex-col gap-1.5">
        {roles.length === 0 ? (
          <p className="rounded-md border border-dashed border-rule-2 px-3 py-5 text-center text-xs text-ink-3">Nothing here yet</p>
        ) : (
          roles.map((r) => <Card key={r.id} role={r} onOpen={onOpen} />)
        )}
      </div>
    </section>
  );
}

function CardBody({ role }: { role: Role }) {
  const { contactsByRole } = useRoles();
  const contacts = contactsByRole.get(role.id) ?? [];
  const awaiting = contacts.filter(isAwaitingReply).length;
  const nudge = contacts.filter((c) => needsFollowUp(c)).length;
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <ScoreChip role={role} size="md" />
        <div className="min-w-0">
          <p className="truncate text-xs text-ink-3">{role.company}</p>
          <p className="truncate text-[13px] leading-snug text-ink">{role.title}</p>
        </div>
      </div>
      {(contacts.length > 0 || role.stage_changed_at) && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-3">
          {role.stage_changed_at && (
            <span title={`In ${STAGE_LABELS[role.stage]} since ${new Date(role.stage_changed_at).toLocaleDateString()}`}>
              {STAGE_LABELS[role.stage].toLowerCase()} {relativeTime(role.stage_changed_at)} ago
            </span>
          )}
          {contacts.length > 0 && (
            <span>
              {role.stage_changed_at ? "· " : ""}
              {contacts.length} contact{contacts.length === 1 ? "" : "s"}
            </span>
          )}
          {awaiting > 0 && <span>· {awaiting} awaiting reply</span>}
          {nudge > 0 && (
            <span className="rounded bg-[var(--decent-bg)] px-1 py-px font-medium text-[var(--decent)]">
              {nudge} to follow up
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function Card({ role, onOpen }: { role: Role; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: role.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(role.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "o") {
          e.preventDefault();
          onOpen(role.id);
        }
      }}
      className={`cursor-grab rounded-md border border-rule bg-card p-2.5 shadow-[0_1px_2px_rgba(22,24,29,0.04)] motion-safe:transition-shadow active:cursor-grabbing touch-none ${
        isDragging ? "opacity-40" : "hover:shadow-[0_2px_8px_rgba(22,24,29,0.08)]"
      }`}
    >
      <CardBody role={role} />
    </div>
  );
}
