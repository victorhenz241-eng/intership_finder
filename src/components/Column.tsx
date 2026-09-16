"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Role, Stage } from "@/lib/types";
import { STAGE_LABELS } from "@/lib/types";
import RoleCard from "./RoleCard";

export default function Column({
  stage,
  roles,
}: {
  stage: Stage;
  roles: Role[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`col-${stage}`}
      className={`flex min-h-[12rem] w-[18rem] shrink-0 flex-col rounded-xl border p-2 motion-safe:transition-colors lg:w-auto lg:min-w-0 ${
        isOver ? "border-rule-2 bg-[#e4e7ec]" : "border-transparent bg-[#e7e9ee]"
      }`}
    >
      <header className="flex items-baseline justify-between px-2 pb-2 pt-1">
        <h2 id={`col-${stage}`} className="text-sm font-medium text-ink">
          {STAGE_LABELS[stage]}
        </h2>
        <span className="text-xs tabular-nums text-ink-3">{roles.length}</span>
      </header>
      <div className="flex flex-col gap-2">
        {roles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-rule-2 px-3 py-6 text-center text-xs text-ink-3">
            Nothing here yet
          </p>
        ) : (
          roles.map((role) => <RoleCard key={role.id} role={role} />)
        )}
      </div>
    </section>
  );
}
