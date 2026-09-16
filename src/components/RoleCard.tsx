"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Role } from "@/lib/types";
import ScoreChip from "./ScoreChip";

const SEVERITY_LABEL = {
  strong: "Strong match",
  decent: "Decent match",
  skip: "Probably skip",
} as const;

export function RoleCardBody({ role }: { role: Role }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-ink-3">{role.company}</p>
          <h3 className="mt-0.5 text-[15px] font-medium leading-snug text-ink">
            {role.title}
          </h3>
          {role.location && (
            <p className="mt-0.5 text-xs text-ink-2">{role.location}</p>
          )}
        </div>
        <ScoreChip score={role.fit_score} severity={role.severity} />
      </div>
      {role.why && (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{role.why}</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-rule pt-2.5 text-xs">
        <span className="text-ink-3">{SEVERITY_LABEL[role.severity]}</span>
        {role.url ? (
          <a
            href={role.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline-offset-2 hover:underline"
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            View posting
          </a>
        ) : (
          <span className="text-ink-3">No link</span>
        )}
      </div>
    </>
  );
}

export default function RoleCard({ role }: { role: Role }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: role.id, data: { role } });

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={`rounded-lg border border-rule bg-card p-3.5 shadow-[0_1px_2px_rgba(22,24,29,0.04)] motion-safe:transition-shadow ${
        isDragging ? "opacity-40" : "hover:shadow-[0_2px_8px_rgba(22,24,29,0.08)]"
      } cursor-grab active:cursor-grabbing touch-none`}
      {...attributes}
      {...listeners}
    >
      <RoleCardBody role={role} />
    </article>
  );
}
