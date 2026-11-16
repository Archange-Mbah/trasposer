"use client";

import { useEffect, useRef, useState } from "react";
import { isChord } from "@/lib/music/chord";
import { cn } from "../ui/primitives";
import { useSheet } from "./sheet-context";

/**
 * Inline chord entry. Enter commits, Space/Tab commits and jumps to the next
 * word (so "G␣D␣Em" fills a line in one go), Esc cancels.
 */
export function ChordInput({
  initial,
  onCommit,
  onCancel,
  onDelete,
}: {
  initial: string;
  onCommit: (value: string, advance: "none" | "next" | "prev") => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { suggestions } = useSheet();
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trimmed = value.trim();
  const valid = trimmed === "" || isChord(trimmed);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  // Commit on outside click (if valid), like a spreadsheet cell.
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      const v = ref.current?.value.trim() ?? "";
      if (v && isChord(v)) onCommit(v, "none");
      else onCancel();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [onCommit, onCancel]);

  const submit = (advance: "none" | "next" | "prev") => {
    setTouched(true);
    if (trimmed === "") {
      if (onDelete && initial) onDelete();
      else onCancel();
      return;
    }
    if (!valid) return;
    onCommit(trimmed, advance);
  };

  const filtered = suggestions.filter(
    (s) => !trimmed || (s.toLowerCase().startsWith(trimmed.toLowerCase()) && s !== trimmed),
  );

  return (
    <div
      ref={wrapRef}
      className="absolute bottom-[3px] left-0 z-30 animate-pop"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={ref}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        aria-label="Chord"
        placeholder="Chord"
        onChange={(e) => {
          // Capitalise the root as a convenience: "em" → "Em", "f#m" → "F#m"
          const v = e.target.value.replace(/^([a-h])/, (m) => m.toUpperCase());
          setValue(v);
          setTouched(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit("none");
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === " " || (e.key === "Tab" && !e.shiftKey)) {
            e.preventDefault();
            submit("next");
          } else if (e.key === "Tab" && e.shiftKey) {
            e.preventDefault();
            submit("prev");
          }
        }}
        style={{ width: `${Math.max(4.2, value.length + 1.6)}ch` }}
        className={cn(
          "chord-pill h-[1.75em] rounded-md border bg-surface px-1.5 font-semibold text-chord-fg shadow-md outline-none ring-4 transition-colors placeholder:font-normal placeholder:text-ink-4",
          valid || !touched ? "border-accent ring-accent/15" : "border-danger ring-danger/15",
        )}
      />
      <div className="absolute left-0 top-full z-30 mt-1.5 w-max max-w-[min(300px,calc(100vw-32px))] group-data-[edge=right]/draft:left-auto group-data-[edge=right]/draft:right-0 rounded-lg border border-line bg-surface p-1.5 shadow-lg">
        {!valid && touched ? (
          <p className="px-1 py-0.5 text-[12px] text-danger">
            “{trimmed}” isn’t a chord. Try G, Em, F#m7, Dsus4 or D/F#.
          </p>
        ) : (
          <>
            {filtered.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filtered.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onCommit(s, "none")}
                    className="chord-pill rounded-[5px] border border-chord-line bg-chord-bg px-1.5 py-0.5 font-semibold text-chord-fg transition-colors hover:border-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <p className={cn("px-0.5 text-[11px] text-ink-3", filtered.length > 0 && "mt-1.5")}>
              <b className="font-medium text-ink-2">Enter</b> save · <b className="font-medium text-ink-2">Space</b> next word ·{" "}
              <b className="font-medium text-ink-2">Esc</b> cancel
            </p>
          </>
        )}
      </div>
    </div>
  );
}
