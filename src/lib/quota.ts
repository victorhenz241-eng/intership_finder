import type { SupabaseClient } from "@supabase/supabase-js";

/** Per-day caps on the routes that spend money. Generous for one person, tight for a stolen session. */
export const DAILY_LIMITS = { draft: 60, find_people: 40 } as const;
export type UsageKind = keyof typeof DAILY_LIMITS;

/**
 * Counts one call and reports whether it is within today's limit. If the
 * bump_usage function does not exist yet (migration not run) the call is
 * allowed and a warning is logged: a missing table must not take the app down.
 */
export async function withinQuota(supabase: SupabaseClient, kind: UsageKind): Promise<boolean> {
  const { data, error } = await supabase.rpc("bump_usage", { p_kind: kind, p_limit: DAILY_LIMITS[kind] });
  if (error) {
    if (/PGRST202|could not find the function|does not exist/i.test(`${error.code} ${error.message}`)) {
      console.warn("bump_usage missing; run supabase/migrations/2026-09-18-audit.sql. Allowing the call.");
      return true;
    }
    console.warn("bump_usage failed:", error.message);
    return true;
  }
  return data === true;
}
