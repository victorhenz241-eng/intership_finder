"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRoles } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_LABELS,
  NOTE_MAX_CHARS,
  isAwaitingReply,
  needsFollowUp,
  nextContactStatus,
  parseHooks,
  type Contact,
  type ContactStatus,
  type OutreachHook,
  type Role,
} from "@/lib/types";
import { shortDate } from "@/lib/format";
import AutosaveText from "./AutosaveText";

const NEXT_LABEL: Record<ContactStatus, string> = {
  identified: "Mark request sent",
  requested: "Mark accepted",
  accepted: "Mark messaged",
  messaged: "Mark replied",
  replied: "",
  dead: "",
};

type Prefill = { name?: string; title?: string; profile_url?: string; hook?: string; source?: string };

/** Contacts for a pipeline role, the hooks n8n found (if any), and a fast add form. Nothing here sends anything. */
export default function Outreach({ role }: { role: Role }) {
  const { contactsByRole, contactsError, addContact } = useRoles();
  const contacts = contactsByRole.get(role.id) ?? [];
  const hooks = parseHooks(role.outreach_hooks);
  const [adding, setAdding] = useState<Prefill | null>(null);

  const awaiting = contacts.filter(isAwaitingReply).length;

  return (
    <section className="mt-6 border-t border-rule pt-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink">
          Outreach
          {contacts.length > 0 && (
            <span className="ml-2 text-xs font-normal text-ink-3">
              {contacts.length} contact{contacts.length === 1 ? "" : "s"}
              {awaiting > 0 && ` · ${awaiting} awaiting reply`}
            </span>
          )}
        </h3>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding({})}
            className="h-7 rounded-md bg-[var(--strong-bg)] px-2.5 text-xs font-medium text-[var(--strong)] hover:bg-[#d3ecdd]"
          >
            + Add contact
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-ink-3">
        Find people on LinkedIn yourself and note them here. The app prepares drafts and tracks the thread; it never sends or connects.
      </p>

      {contactsError && (
        <p className="mt-3 rounded-md border border-[#f0c9c9] bg-[#fdf0f0] px-3 py-2 text-xs text-[#8a2626]">
          Contacts couldn&apos;t be loaded: {contactsError}. If the table doesn&apos;t exist yet, run supabase/migrations/2026-09-18-contacts.sql.
        </p>
      )}

      {adding && (
        <AddContactForm
          prefill={adding}
          onCancel={() => setAdding(null)}
          onSubmit={async (values) => {
            const row = await addContact({ role_id: role.id, ...values });
            if (row) setAdding(null);
            return row !== null;
          }}
        />
      )}

      {hooks.length > 0 && <Hooks hooks={hooks} onUse={(h) => setAdding({ hook: h.text, source: h.source ?? "hook" })} />}

      {contacts.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {contacts.map((c) => (
            <ContactCard key={c.id} contact={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Third-party text, assembled from web pages. Text nodes only. */
function Hooks({ hooks, onUse }: { hooks: OutreachHook[]; onUse: (h: OutreachHook) => void }) {
  return (
    <div className="mt-3">
      <h4 className="text-xs text-ink-3">Suggested talking points</h4>
      <ul className="mt-1.5 divide-y divide-rule rounded-md border border-rule text-[13px]">
        {hooks.map((h, i) => (
          <li key={i} className="flex items-start gap-3 px-2.5 py-2">
            <p className="min-w-0 flex-1 whitespace-pre-line text-ink-2">{h.text}</p>
            {h.url && (
              <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" className="shrink-0 text-xs text-accent hover:underline">
                {h.source ?? "source"} ↗
              </a>
            )}
            <button type="button" onClick={() => onUse(h)} className="shrink-0 text-xs text-ink-2 underline-offset-2 hover:underline">
              Add as contact
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddContactForm({
  prefill,
  onCancel,
  onSubmit,
}: {
  prefill: Prefill;
  onCancel: () => void;
  onSubmit: (v: { name: string; title: string | null; profile_url: string | null; hook: string | null; source: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState(prefill.name ?? "");
  const [title, setTitle] = useState(prefill.title ?? "");
  const [url, setUrl] = useState(prefill.profile_url ?? "");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const ok = await onSubmit({
      name: name.trim(),
      title: title.trim() || null,
      profile_url: url.trim() || null,
      hook: prefill.hook ?? null,
      source: prefill.source ?? "manual",
    });
    setBusy(false);
    if (ok) {
      setName("");
      setTitle("");
      setUrl("");
    }
  }

  const input = "h-8 w-full rounded-md border border-rule-2 bg-card px-2 text-sm text-ink placeholder:text-ink-3";
  return (
    <form onSubmit={submit} className="mt-3 rounded-md border border-rule bg-page p-2.5" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      {prefill.hook && <p className="mb-2 text-xs text-ink-2">Hook: {prefill.hook}</p>}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        <input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" required className={input} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title at company" aria-label="Title" className={input} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="LinkedIn URL" aria-label="Profile URL" type="url" className={input} />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="submit" disabled={busy || !name.trim()} className="h-7 rounded-md bg-ink px-3 text-xs font-medium text-card hover:bg-[#2b2e36] disabled:opacity-50">
          {busy ? "Adding…" : "Add"} <kbd className="ml-1 opacity-60">⏎</kbd>
        </button>
        <button type="button" onClick={onCancel} className="h-7 rounded-md px-2 text-xs text-ink-2 hover:text-ink">
          Cancel <kbd className="ml-1 opacity-60">esc</kbd>
        </button>
        <span className="ml-auto text-[11px] text-ink-3">Public professional identity only.</span>
      </div>
    </form>
  );
}

function StatusPill({ contact }: { contact: Contact }) {
  const s = contact.status;
  const tone =
    s === "replied" ? "bg-[var(--strong-bg)] text-[var(--strong)]"
    : s === "dead" ? "bg-[#e7e9ee] text-ink-3 line-through"
    : needsFollowUp(contact) ? "bg-[var(--decent-bg)] text-[var(--decent)]"
    : "bg-[#e7e9ee] text-ink-2";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] ${tone}`}>{needsFollowUp(contact) ? "Needs follow-up" : CONTACT_STATUS_LABELS[s]}</span>;
}

function ContactCard({ contact }: { contact: Contact }) {
  const { updateContact, deleteContact } = useRoles();
  const next = nextContactStatus(contact.status);

  function setStatus(status: ContactStatus) {
    const patch: Parameters<typeof updateContact>[1] = { status };
    const now = new Date().toISOString();
    if (status === "messaged" && !contact.sent_at) patch.sent_at = now;
    if (status === "replied" && !contact.replied_at) patch.replied_at = now;
    updateContact(contact.id, patch);
  }

  const quiet = "h-7 rounded-md border border-rule-2 bg-card px-2 text-xs text-ink-2 hover:text-ink";

  return (
    <li className="rounded-md border border-rule bg-card p-2.5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">
            {contact.profile_url ? (
              <a href={contact.profile_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {contact.name} ↗
              </a>
            ) : (
              contact.name
            )}
          </p>
          <p className="text-xs text-ink-3">
            {contact.title || "—"}
            {contact.source && contact.source !== "manual" && ` · via ${contact.source}`}
          </p>
        </div>
        <StatusPill contact={contact} />
      </div>

      {contact.hook && <p className="mt-1.5 text-xs text-ink-2">Hook: {contact.hook}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {next && (
          <button type="button" onClick={() => setStatus(next)} className="h-7 rounded-md bg-[var(--strong-bg)] px-2.5 text-xs font-medium text-[var(--strong)] hover:bg-[#d3ecdd]">
            {NEXT_LABEL[contact.status]}
          </button>
        )}
        <select
          aria-label="Status"
          value={contact.status}
          onChange={(e) => setStatus(e.target.value as ContactStatus)}
          className="h-7 rounded-md border border-rule-2 bg-card px-1.5 text-xs text-ink"
        >
          {CONTACT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CONTACT_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {contact.sent_at && <span className="text-[11px] text-ink-3">sent {shortDate(contact.sent_at)}</span>}
        {contact.replied_at && <span className="text-[11px] text-ink-3">replied {shortDate(contact.replied_at)}</span>}
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Remove ${contact.name} from this role?`)) deleteContact(contact.id);
          }}
          className={`ml-auto ${quiet}`}
        >
          Remove
        </button>
      </div>

      <AutosaveText
        id={`contact-notes-${contact.id}`}
        label="Notes"
        value={contact.notes ?? ""}
        save={(notes) => updateContact(contact.id, { notes })}
        rows={2}
        placeholder="What they said, what to bring up next"
        className="mt-2"
        textareaClassName="mt-1 w-full resize-y rounded-md border border-rule-2 bg-card px-2 py-1.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-3"
      />
      <ContactDrafts contact={contact} />
    </li>
  );
}

const SMALL_TEXTAREA = "mt-1 w-full resize-y rounded-md border border-rule-2 bg-card px-2 py-1.5 text-[13px] leading-relaxed text-ink placeholder:text-ink-3";

/**
 * Generated on the server from the role and this contact, then dropped into
 * editable fields that persist to the contact row. Nothing here sends anything:
 * the only way out is the copy button and the user's own clipboard.
 */
function ContactDrafts({ contact }: { contact: Contact }) {
  const { updateContact, setNotice } = useRoles();
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [noteLen, setNoteLen] = useState((contact.draft_note ?? "").length);
  const hasDrafts = Boolean(contact.draft_note || contact.draft_message);

  useEffect(() => setNoteLen((contact.draft_note ?? "").length), [contact.draft_note]);

  async function generate() {
    setBusy(true);
    setInfo(null);
    try {
      const { data } = await getSupabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in again.");
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contactId: contact.id }),
      });
      const json = (await res.json()) as { draft_note?: string; draft_message?: string; note_truncated?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      await updateContact(contact.id, { draft_note: json.draft_note ?? "", draft_message: json.draft_message ?? "" });
      if (json.note_truncated) setInfo(`Note was cut to ${NOTE_MAX_CHARS} characters.`);
    } catch (e) {
      setNotice(`Couldn't draft: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const over = noteLen > NOTE_MAX_CHARS;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="h-7 rounded-md border border-rule-2 bg-card px-2.5 text-xs text-ink hover:bg-page disabled:opacity-50"
        >
          {busy ? "Drafting…" : hasDrafts ? "Regenerate drafts" : "Draft outreach"}
        </button>
        {info && <span className="text-[11px] text-ink-3">{info}</span>}
      </div>
      {hasDrafts && (
        <>
          <AutosaveText
            id={`draft-note-${contact.id}`}
            label="Connection note"
            value={contact.draft_note ?? ""}
            save={(draft_note) => updateContact(contact.id, { draft_note })}
            onInput={(v) => setNoteLen(v.length)}
            rows={3}
            className="mt-2"
            textareaClassName={SMALL_TEXTAREA + (over ? " border-[#c94b4b]" : "")}
            extra={
              <>
                <span className={over ? "font-medium text-[#c94b4b]" : ""}>
                  {noteLen}/{NOTE_MAX_CHARS}
                </span>
                <CopyButton text={contact.draft_note ?? ""} />
              </>
            }
          />
          <AutosaveText
            id={`draft-message-${contact.id}`}
            label="Message after they accept"
            value={contact.draft_message ?? ""}
            save={(draft_message) => updateContact(contact.id, { draft_message })}
            rows={6}
            className="mt-2"
            textareaClassName={SMALL_TEXTAREA}
            extra={<CopyButton text={contact.draft_message ?? ""} />}
          />
        </>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: the text is still selectable in the field */
        }
      }}
      className="rounded px-1 text-[11px] text-ink-2 hover:text-ink disabled:opacity-40"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
