"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

type AuthStatus = "loading" | "signed_out" | "signed_in";

type Auth = {
  status: AuthStatus;
  session: Session | null;
  /** Send a magic link. Resolves to an error message or null. Never creates a user. */
  sendMagicLink: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    const supabase = getSupabase();
    // getSession resolves the persisted session (and the magic-link hash on return) before we decide what to render.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setStatus(data.session ? "signed_in" : "signed_out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setStatus(s ? "signed_in" : "signed_out");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: {
        // Single-user app: never create an account from the sign-in screen.
        shouldCreateUser: false,
        emailRedirectTo: typeof window === "undefined" ? undefined : window.location.origin + "/inbox",
      },
    });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  const value = useMemo<Auth>(() => ({ status, session, sendMagicLink, signOut }), [status, session, sendMagicLink, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const a = useContext(Ctx);
  if (!a) throw new Error("useAuth must be used inside AuthProvider");
  return a;
}
