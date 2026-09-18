"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  id: string;
  label: string;
  value: string;
  save: (v: string) => Promise<string | null>;
  rows?: number;
  placeholder?: string;
  /** Rendered right of the status text, e.g. a character counter. */
  extra?: React.ReactNode;
  /** Fires on every keystroke (for live counters); saving is still debounced. */
  onInput?: (v: string) => void;
  className?: string;
  textareaClassName?: string;
};

/** Debounced textarea: saves 800ms after the last keystroke, on blur, and on unmount. */
export default function AutosaveText({ id, label, value, save, rows = 4, placeholder, extra, onInput, className, textareaClassName }: Props) {
  const [text, setText] = useState(value);
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  latest.current = text;
  const persisted = useRef(value);

  // An outside change (e.g. a generated draft landing in this field) replaces local text unless there is an unsaved edit.
  useEffect(() => {
    if (value !== persisted.current && state !== "dirty" && state !== "saving") {
      persisted.current = value;
      setText(value);
      setState("idle");
    }
  }, [value, state]);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = latest.current;
    if (v === persisted.current) return;
    setState("saving");
    const err = await save(v);
    if (err) setState("error");
    else {
      persisted.current = v;
      setState(latest.current === v ? "saved" : "dirty");
    }
  };

  const onChange = (v: string) => {
    setText(v);
    onInput?.(v);
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  };

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (latest.current !== persisted.current) save(latest.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-xs text-ink-3">
          {label}
        </label>
        <span className="flex items-center gap-2 text-xs text-ink-3" aria-live="polite">
          {extra}
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Not saved" : state === "dirty" ? "Unsaved" : ""}
        </span>
      </div>
      <textarea
        id={id}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={flush}
        rows={rows}
        placeholder={placeholder}
        className={
          textareaClassName ??
          "mt-1.5 w-full resize-y rounded-md border border-rule-2 bg-card px-2.5 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-3"
        }
      />
    </div>
  );
}
