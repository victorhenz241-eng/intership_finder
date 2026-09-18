"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import SignIn from "./SignIn";

/** Renders nothing but the sign-in screen until a session exists. Everything data-bearing mounts inside. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <div className="min-h-dvh" aria-busy="true" />;
  if (status === "signed_out") return <SignIn />;
  return <>{children}</>;
}
