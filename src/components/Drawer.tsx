"use client";

import { useEffect, useRef } from "react";
import { useRoles } from "@/lib/store";
import { useQueryState } from "@/lib/url";
import {
  PIPELINE_STAGES,
  STAGE_LABELS,
  isLikelyIneligible,
  isPipelineStage,
  isPrimary,
  parseMeta,
  type Role,
  type Stage,
} from "@/lib/types";
import { shortDate } from "@/lib/format";
import ScoreChip from "./ScoreChip";
import AutosaveText from "./AutosaveText";
import Outreach from "./Outreach";

const SEVERITY_LABEL = { strong: "Strong match", decent: "Decent match", skip: "Probably skip" } as const;

export default function Drawer() {
  const { params, set } = useQueryState();
  const { byId, status } = useRoles();
  const id = params.get("role");
  const role = id ? byId.get(id) : undefined;
  const open = Boolean(id);

  const close = () => set({ role: null });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30" role="presentation">
      <div className="absolute inset-0 bg-ink/15" onClick={close} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={role ? `${role.company}: ${role.title}` : "Role detail"}
        className="absolute inset-y-0 right-0 flex w-full flex-col overflow-y-auto bg-card shadow-[-8px_0_32px_rgba(22,24,29,0.12)] sm:w-[30rem] sm:border-l sm:border-rule"
      >
        {role ? (
          <DrawerBody key={role.id} role={role} onClose={close} />
        ) : (
          <div className="p-5 text-sm text-ink-2">
            {status === "loading" ? "Loading…" : "That role isn't in the table."}
            <button type="button" onClick={close} className="ml-3 underline">
              Close
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function DrawerBody({ role, onClose }: { role: Role; onClose: () => void }) {
  const { update, groups, byId } = useRoles();
  const { set } = useQueryState();
  const members = role.dedup_group ? groups.get(role.dedup_group) ?? [] : [];
  const others = members.filter((m) => m.id !== role.id);
  const primary = !isPrimary(role) && role.dedup_group ? byId.get(role.dedup_group) : undefined;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
  }, []);

  const meta = parseMeta(role.description);
  const inPipeline = isPipelineStage(role.stage);
  const nextStage: Stage | null = inPipeline
    ? (PIPELINE_STAGES[PIPELINE_STAGES.indexOf(role.stage as (typeof PIPELINE_STAGES)[number]) + 1] ?? null)
    : null;

  return (
    <div ref={panel} tabIndex={-1} className="flex flex-1 flex-col outline-none">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-rule bg-card/95 px-5 py-2 backdrop-blur">
        <span className="text-xs text-ink-3">
          {STAGE_LABELS[role.stage]} · {role.severity ? SEVERITY_LABEL[role.severity] : "Not scored"}
        </span>
        <button type="button" onClick={onClose} className="rounded px-2 py-1 text-xs text-ink-2 hover:bg-page hover:text-ink">
          Close <kbd className="ml-1 text-ink-3">esc</kbd>
        </button>
      </div>

      <div className="flex-1 px-5 pb-8">
        <header className="flex items-start justify-between gap-4 pt-5">
          <div className="min-w-0">
            <p className="text-sm text-ink-2">{role.company}</p>
            <h2 className="mt-0.5 font-display text-2xl leading-tight text-ink">{role.title}</h2>
            {role.location && <p className="mt-1 text-sm text-ink-2">{role.location}</p>}
          </div>
          <ScoreChip role={role} size="lg" />
        </header>

        <EligibilityLine role={role} />

        <StageControls role={role} nextStage={nextStage} inPipeline={inPipeline} />

        {role.url ? (
          <a
            href={role.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex h-10 items-center justify-center rounded-md bg-ink text-sm font-medium text-card hover:bg-[#2b2e36]"
          >
            Open original posting ↗
          </a>
        ) : (
          <p className="mt-4 text-sm text-ink-3">No posting URL on this row.</p>
        )}

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <Meta k="Source" v={role.source} />
          <Meta k="Posted" v={shortDate(role.posted_at)} />
          <Meta k="First seen" v={shortDate(role.first_seen)} />
          {meta && (
            <>
              <Meta k="Category" v={meta.category} />
              <Meta k="Terms" v={meta.terms} />
              <Meta k="Sponsorship" v={meta.sponsorship} />
              <Meta k="Degrees" v={meta.degrees} />
            </>
          )}
        </dl>

        <section className="mt-6">
          <h3 className="text-xs text-ink-3">Why it fits</h3>
          {role.why && role.why.trim() ? (
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{role.why}</p>
          ) : (
            <p className="mt-1.5 text-sm text-ink-3">The scorer hasn&apos;t evaluated this role yet.</p>
          )}
        </section>

        {role.jd_text && role.jd_text.trim() ? (
          <section className="mt-6">
            <h3 className="text-xs text-ink-3">Job description</h3>
            {/* Third-party text. Rendered as a text node only: never HTML or markdown. */}
            <div className="mt-1.5 max-h-[24rem] overflow-y-auto rounded-md border border-rule bg-page px-3 py-2">
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{role.jd_text.trim()}</p>
            </div>
          </section>
        ) : (
          !meta &&
          role.description && (
            <section className="mt-6">
              <h3 className="text-xs text-ink-3">Description excerpt</h3>
              <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{role.description}</p>
            </section>
          )
        )}

        {others.length > 0 && (
          <section className="mt-6">
            <h3 className="text-xs text-ink-3">
              {primary ? "This is a duplicate listing of" : `Also listed as (${others.length})`}
            </h3>
            <ul className="mt-1.5 divide-y divide-rule rounded-md border border-rule text-[13px]">
              {(primary ? [primary] : others).map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-ink">{m.title}</span>
                  <span className="text-xs text-ink-3">{m.location ?? "—"}</span>
                  <span className="text-xs text-ink-3">{m.source ?? "—"}</span>
                  {m.url && (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                      open
                    </a>
                  )}
                  <button type="button" onClick={() => set({ role: m.id })} className="text-xs text-ink-2 underline-offset-2 hover:underline">
                    view
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-ink-3">
              Grouped by the dedup service. Stage changes apply to this row only; the others stay folded under the primary.
            </p>
          </section>
        )}

        <AutosaveText
          id="notes"
          label="Notes"
          value={role.notes ?? ""}
          save={(notes) => update(role.id, { notes })}
          placeholder="Anything worth remembering about this role"
          className="mt-6"
        />

        {inPipeline && <Outreach role={role} />}
      </div>
    </div>
  );
}

/** Verdict from the enrichment workflow. Unknown renders nothing: it is the normal state, not a problem. */
function EligibilityLine({ role }: { role: Role }) {
  if (isLikelyIneligible(role)) {
    return (
      <p className="mt-3 rounded-md bg-[var(--decent-bg)] px-3 py-2 text-sm text-[var(--decent)]">
        <span className="font-medium">Likely ineligible</span>
        {" — "}
        {role.eligibility_reason?.trim() || "no reason recorded"}
      </p>
    );
  }
  if (role.eligibility === "eligible") {
    return <p className="mt-3 text-xs text-ink-3">Eligibility checked: no disqualifiers found.</p>;
  }
  return null;
}

function Meta({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <>
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-ink-2">{v}</dd>
    </>
  );
}

function StageControls({ role, nextStage, inPipeline }: { role: Role; nextStage: Stage | null; inPipeline: boolean }) {
  const { update } = useRoles();
  const btn = "h-8 rounded-md px-3 text-sm";
  const primary = `${btn} bg-[var(--strong-bg)] text-[var(--strong)] hover:bg-[#d3ecdd]`;
  const quiet = `${btn} border border-rule-2 bg-card text-ink-2 hover:text-ink`;

  if (role.stage === "found") {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => update(role.id, { stage: "interested" })} className={primary}>
          Save to pipeline <kbd className="ml-1 opacity-60">s</kbd>
        </button>
        <button type="button" onClick={() => update(role.id, { stage: "dismissed" })} className={quiet}>
          Dismiss <kbd className="ml-1 opacity-60">e</kbd>
        </button>
      </div>
    );
  }
  if (role.stage === "dismissed") {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => update(role.id, { stage: "found" })} className={primary}>
          Restore to inbox
        </button>
        <button type="button" onClick={() => update(role.id, { stage: "interested" })} className={quiet}>
          Save to pipeline
        </button>
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {nextStage && (
        <button type="button" onClick={() => update(role.id, { stage: nextStage })} className={primary}>
          Advance to {STAGE_LABELS[nextStage]}
        </button>
      )}
      <label className="flex items-center gap-1.5 text-xs text-ink-3">
        Stage
        <select
          value={role.stage}
          onChange={(e) => update(role.id, { stage: e.target.value as Stage })}
          className="h-8 rounded-md border border-rule-2 bg-card px-2 text-sm text-ink"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      {inPipeline && (
        <button type="button" onClick={() => update(role.id, { stage: "dismissed" })} className={quiet}>
          Dismiss
        </button>
      )}
    </div>
  );
}
