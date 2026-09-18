import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateDrafts } from "@/lib/draft";
import type { Contact, Role } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "victorhenz241@gmail.com";

/**
 * POST { contactId } → { draft_note, draft_message, note_truncated }.
 * Returns text only. Nothing is persisted here and nobody is contacted.
 * The caller's Supabase session is required and must belong to the owner; the
 * role and contact are read through that session so RLS applies.
 */
export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY is not set on the server." }, { status: 500 });

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

  let body: { contactId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const contactId = typeof body.contactId === "string" ? body.contactId : "";
  if (!contactId) return NextResponse.json({ error: "contactId is required." }, { status: 400 });

  const { data: contact, error: cErr } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  const c = contact as Contact;

  const { data: role, error: rErr } = await supabase.from("roles").select("*").eq("id", c.role_id).maybeSingle();
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  if (!role) return NextResponse.json({ error: "Role not found." }, { status: 404 });

  try {
    const drafts = await generateDrafts({ role: role as Role, contact: c }, apiKey);
    return NextResponse.json(drafts);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
