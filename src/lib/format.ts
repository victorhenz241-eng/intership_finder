export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "—";
  const diff = now - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.round(mo / 12)}y`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Only http(s) URLs are ever rendered as links. Anything else (javascript:, data:,
 * a bare word) becomes null. Applied to user-entered profile URLs, posting URLs
 * from the sweep, and hook links, at save time and at render time.
 */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(t)) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** "www.linkedin.com/in/x" → "https://www.linkedin.com/in/x"; anything already carrying a scheme is left alone. */
export function normalizeUrlInput(raw: string): string {
  const t = raw.trim();
  if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
  return `https://${t}`;
}
