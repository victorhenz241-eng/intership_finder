"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** Read and write URL query state without scrolling or adding history entries. */
export function useQueryState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback(
    (updates: Record<string, string | null>, opts?: { push?: boolean }) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      (opts?.push ? router.push : router.replace)(href, { scroll: false });
    },
    [params, pathname, router]
  );

  return { params, set, pathname };
}
