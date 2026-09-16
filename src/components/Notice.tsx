"use client";

import { useRoles } from "@/lib/store";

export default function Notice() {
  const { notice, setNotice } = useRoles();
  if (!notice) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-lg items-start gap-3 rounded-md border border-[#f0c9c9] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8a2626] shadow-md"
    >
      <span className="flex-1">{notice}</span>
      <button type="button" onClick={() => setNotice(null)} className="text-xs underline">
        Close
      </button>
    </div>
  );
}
