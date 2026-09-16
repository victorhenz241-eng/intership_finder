"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useRoles } from "@/lib/store";
import { isPipelineStage, isPrimary } from "@/lib/types";
import { relativeTime } from "@/lib/format";

function Tab({ href, label, count, active }: { href: string; label: string; count: number; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm ${
        active ? "bg-card text-ink shadow-[0_1px_2px_rgba(22,24,29,0.08)]" : "text-ink-2 hover:text-ink"
      }`}
    >
      {label}
      <span
        className={`min-w-[1.5rem] rounded px-1.5 py-0.5 text-center text-xs tabular-nums ${
          active ? "bg-[#e7e9ee] text-ink" : "bg-transparent text-ink-3"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const { roles, status, lastLoaded, refresh } = useRoles();
  const [, tick] = useState(0);

  // Re-render every minute so "updated 3m ago" stays honest.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  let inbox = 0;
  let pipeline = 0;
  let strong = 0;
  for (const r of roles) {
    if (!isPrimary(r)) continue;
    if (r.stage === "found") {
      inbox++;
      if (r.severity === "strong") strong++;
    } else if (isPipelineStage(r.stage)) pipeline++;
  }

  return (
    <nav className="sticky top-0 z-30 border-b border-rule bg-page">
      <div className="mx-auto flex min-h-14 max-w-[120rem] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 sm:flex-nowrap sm:py-0 sm:px-6">
        <Link href="/inbox" className="mr-2 whitespace-nowrap font-display text-xl font-medium tracking-tight text-ink">
          Internship Radar
        </Link>
        <div className="flex items-center gap-1 rounded-lg bg-[#e3e6eb] p-1">
          <Tab href="/inbox" label="Inbox" count={inbox} active={pathname.startsWith("/inbox")} />
          <Tab href="/pipeline" label="Pipeline" count={pipeline} active={pathname.startsWith("/pipeline")} />
        </div>
        <span className="hidden text-xs text-ink-3 sm:inline">
          {strong} strong in inbox
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-ink-3 sm:inline" aria-live="polite">
            {status === "loading" ? "Loading…" : lastLoaded ? `updated ${relativeTime(new Date(lastLoaded).toISOString())} ago` : ""}
          </span>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={status === "loading"}
            className="h-8 rounded-md border border-rule-2 bg-card px-3 text-sm text-ink hover:bg-[#f6f7f9] disabled:opacity-50"
            title="Reload roles from Supabase"
          >
            Refresh
          </button>
        </div>
      </div>
    </nav>
  );
}
