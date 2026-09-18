"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import SignIn from "./SignIn";

/** Renders nothing but the sign-in screen until a session exists. Everything data-bearing mounts inside. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading")
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-ink-3" aria-busy="true" role="status">
        Checking your session…
      </div>
    );
  if (status === "signed_out") return <SignIn />;
  return <>{children}</>;
}
