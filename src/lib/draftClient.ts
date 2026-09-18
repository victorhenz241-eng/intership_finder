import { getSupabase } from "./supabase";

export type DraftResult = { draft_note: string; draft_message: string; note_truncated: boolean };

/** Calls the server draft route with the current session. Returns text only; nothing is sent to anyone. */
export async function requestDrafts(contactId: string): Promise<DraftResult> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again.");
  const res = await fetch("/api/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ contactId }),
  });
  const json = (await res.json()) as Partial<DraftResult> & { error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
  return { draft_note: json.draft_note ?? "", draft_message: json.draft_message ?? "", note_truncated: Boolean(json.note_truncated) };
}
