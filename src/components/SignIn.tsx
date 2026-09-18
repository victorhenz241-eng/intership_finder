"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";

export default function SignIn() {
  const { sendMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    setState("sending");
    setError(null);
    const err = await sendMagicLink(value);
    if (err) {
      setError(err);
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-rule bg-card p-6 shadow-[0_1px_2px_rgba(22,24,29,0.06)]">
        <h1 className="font-display text-2xl font-medium tracking-tight text-ink">Internship Radar</h1>
        <p className="mt-1 text-sm text-ink-2">Sign in with a magic link.</p>

        {state === "sent" ? (
          <div className="mt-5 rounded-md bg-[var(--strong-bg)] px-3 py-2 text-sm text-[var(--strong)]" role="status">
            Link sent to <span className="font-medium">{email.trim()}</span>. Open it on this device to finish signing in.
            <button type="button" onClick={() => setState("idle")} className="ml-2 underline">
              Resend
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-2">
            <label htmlFor="email" className="text-xs text-ink-3">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-md border border-rule-2 bg-card px-3 text-sm text-ink placeholder:text-ink-3"
              placeholder="you@example.com"
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="mt-1 h-10 rounded-md bg-ink text-sm font-medium text-card hover:bg-[#2b2e36] disabled:opacity-50"
            >
              {state === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {error && (
              <p role="alert" className="text-sm text-[#8a2626]">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
