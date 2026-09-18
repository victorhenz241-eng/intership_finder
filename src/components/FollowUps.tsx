"use client";

import { useMemo } from "react";
import { useRoles } from "@/lib/store";
import { useQueryState } from "@/lib/url";
import { FOLLOW_UP_DAYS, isAwaitingReply, lastOutbound, needsFollowUp, CONTACT_STATUS_LABELS, type Contact } from "@/lib/types";
import { relativeTime } from "@/lib/format";

/** Threads that need a nudge, oldest first, then everything else still awaiting a reply. */
export default function FollowUps() {
  const { contacts, byId, status, error, refresh, updateContact } = useRoles();
  const markReplied = (c: Contact) => updateContact(c.id, { status: "replied", replied_at: c.replied_at ?? new Date().toISOString() });
  const markDead = (c: Contact) => updateContact(c.id, { status: "dead" });
  const { set } = useQueryState();

  const { due, waiting } = useMemo(() => {
    const bySent = (a: Contact, b: Contact) => lastOutbound(a).localeCompare(lastOutbound(b));
    const due = contacts.filter((c) => needsFollowUp(c)).sort(bySent);
    const waiting = contacts.filter((c) => isAwaitingReply(c) && !needsFollowUp(c)).sort(bySent);
    return { due, waiting };
  }, [contacts]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 sm:px-6">
      {status === "error" && (
        <div role="alert" className="rounded-lg border border-rule-2 bg-card p-5 text-sm">
          <p className="font-medium text-ink">Couldn&apos;t load.</p>
          <p className="mt-1 text-ink-2">{error}</p>
          <button type="button" onClick={() => refresh()} className="mt-3 rounded-md border border-rule-2 px-3 py-1.5 text-sm hover:bg-[#f6f7f9]">
            Try again
          </button>
        </div>
      )}

      <section>
        <h1 className="font-display text-xl text-ink">Needs follow-up</h1>
        <p className="mt-0.5 text-xs text-ink-3">
          A request or message older than {FOLLOW_UP_DAYS} days with no reply. Write the nudge yourself, then update the thread.
        </p>
        <List items={due} empty={status === "ready" ? "Nothing overdue." : "Loading…"} onOpen={(id) => set({ role: id })} byId={byId} onReplied={markReplied} onDead={markDead} />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-ink">Still waiting</h2>
        <p className="mt-0.5 text-xs text-ink-3">Requests and messages out, no reply yet, not overdue.</p>
        <List items={waiting} empty={status === "ready" ? "Nothing pending." : ""} onOpen={(id) => set({ role: id })} byId={byId} onReplied={markReplied} onDead={markDead} />
      </section>
    </main>
  );
}

function List({
  items,
  empty,
  onOpen,
  byId,
  onReplied,
  onDead,
}: {
  items: Contact[];
  empty: string;
  onOpen: (roleId: string) => void;
  byId: ReturnType<typeof useRoles>["byId"];
  onReplied: (c: Contact) => void;
  onDead: (c: Contact) => void;
}) {
  if (items.length === 0) return <p className="mt-3 text-sm text-ink-3">{empty}</p>;
  return (
    <ul className="mt-3 divide-y divide-rule rounded-md border border-rule bg-card">
      {items.map((c) => {
        const role = byId.get(c.role_id);
        return (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-page">
            <button type="button" onClick={() => onOpen(c.role_id)} className="min-w-0 flex-1 text-left" title="Open the role">
              <span className="block truncate text-sm text-ink">
                {c.name}
                {c.title && <span className="text-ink-3"> · {c.title}</span>}
              </span>
              <span className="block truncate text-xs text-ink-3">{role ? `${role.company} — ${role.title}` : "Role not loaded"}</span>
            </button>
            <span className="text-xs text-ink-2">{CONTACT_STATUS_LABELS[c.status]}</span>
            <span className="text-xs tabular-nums text-ink-3">
              {c.sent_at ? `sent ${relativeTime(c.sent_at)} ago` : c.requested_at ? `requested ${relativeTime(c.requested_at)} ago` : `updated ${relativeTime(c.updated_at)} ago`}
            </span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => onReplied(c)} className="h-7 rounded-md bg-[var(--strong-bg)] px-2 text-xs font-medium text-[var(--strong)] hover:bg-[#d3ecdd]">
                Replied
              </button>
              <button type="button" onClick={() => onDead(c)} className="h-7 rounded-md border border-rule-2 bg-card px-2 text-xs text-ink-2 hover:text-ink">
                Dead
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
