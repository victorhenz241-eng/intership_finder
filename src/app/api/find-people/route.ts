import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchPeople, toHooks } from "@/lib/people";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "victorhenz241@gmail.com";

/**
 * POST { roleId } → { people: OutreachHook[], found: number }.
 * Searches a web search engine for public profiles at the role's company, ranks
 * them, and stores the top three in roles.outreach_hooks through the caller's own
 * session (so RLS applies). It never requests anything from linkedin.com.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Supabase env vars missing." }, { status: 500 });

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if ((userData.user.email ?? "").toLowerCase() !== OWNER_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "SERPER_API_KEY is not set on the server." }, { status: 500 });

  let body: { roleId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const roleId = typeof body.roleId === "string" ? body.roleId : "";
  if (!roleId) return NextResponse.json({ error: "roleId is required." }, { status: 400 });

  const { data: role, error: rErr } = await supabase.from("roles").select("id, company, title").eq("id", roleId).maybeSingle();
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  if (!role) return NextResponse.json({ error: "Role not found." }, { status: 404 });
  const r = role as Pick<Role, "id" | "company" | "title">;
  if (!r.company.trim()) return NextResponse.json({ error: "This role has no company name to search for." }, { status: 400 });

  try {
    const { candidates } = await searchPeople(r.company, r.title, apiKey);
    const people = toHooks(candidates, 3);
    const { error: uErr } = await supabase.from("roles").update({ outreach_hooks: people }).eq("id", r.id);
    if (uErr) return NextResponse.json({ error: `Found people but couldn't save them: ${uErr.message}` }, { status: 500 });
    return NextResponse.json({ people, found: candidates.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
