"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabase } from "./supabase";
import type { Contact, Role } from "./types";

type Status = "loading" | "ready" | "error";
type Patch = Partial<Pick<Role, "stage" | "notes">>;
export type ContactPatch = Partial<Omit<Contact, "id" | "role_id" | "created_at" | "updated_at">>;
export type NewContact = Pick<Contact, "role_id" | "name"> & Partial<Pick<Contact, "title" | "profile_url" | "source" | "hook">>;

type Store = {
  roles: Role[];
  byId: Map<string, Role>;
  /** dedup_group id (= primary id) → every member of the group, primary first. */
  groups: Map<string, Role[]>;
  status: Status;
  error: string | null;
  lastLoaded: number | null;
  refresh: () => Promise<void>;
  /** Optimistically apply `patch`, persist it, revert on failure. Resolves to an error message or null. */
  update: (id: string, patch: Patch) => Promise<string | null>;
  updateMany: (ids: string[], patch: Patch) => Promise<string | null>;
  /** Apply a change a server route already persisted (e.g. outreach_hooks) without a refetch. */
  updateLocal: (id: string, patch: Partial<Role>) => void;
  notice: string | null;
  setNotice: (n: string | null) => void;
  contacts: Contact[];
  /** role id → its contacts, oldest first. */
  contactsByRole: Map<string, Contact[]>;
  /** Null when the contacts table is missing or unreadable; the outreach panel then explains instead of failing. */
  contactsError: string | null;
  addContact: (c: NewContact) => Promise<Contact | null>;
  updateContact: (id: string, patch: ContactPatch) => Promise<string | null>;
  deleteContact: (id: string) => Promise<string | null>;
};

const Ctx = createContext<Store | null>(null);

const STALE_MS = 10 * 60 * 1000;

export function isPermissionError(message: string) {
  return /permission denied|row-level security|rls|42501/i.test(message);
}

export function RolesProvider({ children }: { children: ReactNode }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      setStatus((s) => (s === "ready" ? s : "loading"));
      setError(null);
      try {
        const all: Role[] = [];
        const page = 1000;
        for (let from = 0; ; from += page) {
          const { data, error } = await getSupabase()
            .from("roles")
            .select("*")
            .order("first_seen", { ascending: false })
            .range(from, from + page - 1);
          if (error) throw error;
          all.push(...((data ?? []) as Role[]));
          if (!data || data.length < page) break;
        }
        setRoles(all);
        // Contacts are small; a failure here must not take the roles down with it.
        const c = await getSupabase().from("contacts").select("*").order("created_at", { ascending: true });
        if (c.error) setContactsError(c.error.message);
        else {
          setContacts((c.data ?? []) as Contact[]);
          setContactsError(null);
        }
        setLastLoaded(Date.now());
        setStatus("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A tab left open overnight refetches when it regains focus and the data is stale.
  useEffect(() => {
    const onFocus = () => {
      if (lastLoaded && Date.now() - lastLoaded > STALE_MS) refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [lastLoaded, refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  const updateMany = useCallback(async (ids: string[], patch: Patch) => {
    if (ids.length === 0) return null;
    const idSet = new Set(ids);
    let previous: Role[] = [];
    setRoles((rs) => {
      previous = rs;
      return rs.map((r) => (idSet.has(r.id) ? { ...r, ...patch } : r));
    });
    const { error } = await getSupabase().from("roles").update(patch).in("id", ids);
    if (!error) return null;
    // Revert only the fields we touched, keeping any later edits to other rows.
    setRoles((rs) =>
      rs.map((r) => {
        if (!idSet.has(r.id)) return r;
        const before = previous.find((p) => p.id === r.id);
        return before ? { ...r, ...pick(before, patch) } : r;
      })
    );
    const msg = isPermissionError(error.message)
      ? "Couldn't save: permission denied. The roles table needs an RLS update policy (see README)."
      : `Couldn't save: ${error.message}`;
    setNotice(msg);
    return msg;
  }, []);

  const update = useCallback(
    (id: string, patch: Patch) => updateMany([id], patch),
    [updateMany]
  );

  const updateLocal = useCallback((id: string, patch: Partial<Role>) => {
    setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const addContact = useCallback(async (c: NewContact) => {
    const { data, error } = await getSupabase().from("contacts").insert(c).select("*").single();
    if (error) {
      setNotice(`Couldn't add contact: ${error.message}`);
      return null;
    }
    const row = data as Contact;
    setContacts((cs) => [...cs, row]);
    return row;
  }, []);

  const updateContact = useCallback(async (id: string, patch: ContactPatch) => {
    let before: Contact | undefined;
    setContacts((cs) =>
      cs.map((c) => {
        if (c.id !== id) return c;
        before = c;
        return { ...c, ...patch };
      })
    );
    const { error } = await getSupabase().from("contacts").update(patch).eq("id", id);
    if (!error) return null;
    setContacts((cs) => cs.map((c) => (c.id === id && before ? { ...c, ...pickContact(before, patch) } : c)));
    const msg = `Couldn't save contact: ${error.message}`;
    setNotice(msg);
    return msg;
  }, []);

  const deleteContact = useCallback(async (id: string) => {
    let removed: Contact | undefined;
    setContacts((cs) => {
      removed = cs.find((c) => c.id === id);
      return cs.filter((c) => c.id !== id);
    });
    const { error } = await getSupabase().from("contacts").delete().eq("id", id);
    if (!error) return null;
    if (removed) setContacts((cs) => [...cs, removed as Contact]);
    const msg = `Couldn't delete contact: ${error.message}`;
    setNotice(msg);
    return msg;
  }, []);

  const byId = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const contactsByRole = useMemo(() => {
    const m = new Map<string, Contact[]>();
    for (const c of contacts) m.set(c.role_id, [...(m.get(c.role_id) ?? []), c]);
    return m;
  }, [contacts]);
  const groups = useMemo(() => {
    const m = new Map<string, Role[]>();
    for (const r of roles) {
      if (!r.dedup_group) continue;
      const list = m.get(r.dedup_group) ?? [];
      if (r.id === r.dedup_group) list.unshift(r);
      else list.push(r);
      m.set(r.dedup_group, list);
    }
    return m;
  }, [roles]);

  const value = useMemo<Store>(
    () => ({
      roles, byId, groups, status, error, lastLoaded, refresh, update, updateMany, updateLocal, notice, setNotice,
      contacts, contactsByRole, contactsError, addContact, updateContact, deleteContact,
    }),
    [roles, byId, groups, status, error, lastLoaded, refresh, update, updateMany, updateLocal, notice, contacts, contactsByRole, contactsError, addContact, updateContact, deleteContact]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function pick(from: Role, patch: Patch): Patch {
  const out: Patch = {};
  if ("stage" in patch) out.stage = from.stage;
  if ("notes" in patch) out.notes = from.notes;
  return out;
}

function pickContact(from: Contact, patch: ContactPatch): ContactPatch {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) out[k] = from[k as keyof Contact];
  return out as ContactPatch;
}

export function useRoles(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useRoles must be used inside RolesProvider");
  return s;
}
