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
import type { Role } from "./types";

type Status = "loading" | "ready" | "error";
type Patch = Partial<Pick<Role, "stage" | "notes">>;

type Store = {
  roles: Role[];
  byId: Map<string, Role>;
  status: Status;
  error: string | null;
  lastLoaded: number | null;
  refresh: () => Promise<void>;
  /** Optimistically apply `patch`, persist it, revert on failure. Resolves to an error message or null. */
  update: (id: string, patch: Patch) => Promise<string | null>;
  updateMany: (ids: string[], patch: Patch) => Promise<string | null>;
  notice: string | null;
  setNotice: (n: string | null) => void;
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

  const byId = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const value = useMemo<Store>(
    () => ({ roles, byId, status, error, lastLoaded, refresh, update, updateMany, notice, setNotice }),
    [roles, byId, status, error, lastLoaded, refresh, update, updateMany, notice]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function pick(from: Role, patch: Patch): Patch {
  const out: Patch = {};
  if ("stage" in patch) out.stage = from.stage;
  if ("notes" in patch) out.notes = from.notes;
  return out;
}

export function useRoles(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useRoles must be used inside RolesProvider");
  return s;
}
