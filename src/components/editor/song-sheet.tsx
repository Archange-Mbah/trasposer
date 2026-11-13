"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeChordInput, transposeChord } from "@/lib/music/chord";
import { resolveAccidental, suggestedChords } from "@/lib/music/key";
import { songView } from "@/lib/song/serialize";
import type { Song } from "@/lib/song/types";
import { useEditor } from "@/store/editor";
import { useSettings } from "@/store/settings";
import { transposeActions, useSongs } from "@/store/songs";
import { cn } from "../ui/primitives";
import {
  deleteChord,
  duplicateChord,
  editSelected,
  nudgeChord,
  selectSibling,
  selectVertical,
} from "./actions";
import { AddSectionMenu, SectionBlock } from "./section-block";
import { SheetContext, type SheetContextValue } from "./sheet-context";

const SPACING = { compact: 6, comfortable: 14, relaxed: 24 } as const;

export function SongSheet({ song }: { song: Song }) {
  const { notation, fontSize, lineSpacing, lyricFont, showNumerals } = useSettings();
  const [fontsReady, setFontsReady] = useState(0);

  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady((n) => n + 1));
  }, []);

  const view = useMemo(() => songView(song, notation), [song, notation]);
  const originalAccidental = useMemo(
    () => resolveAccidental(view.originalKey, "auto"),
    [view.originalKey],
  );

  const ctx = useMemo<SheetContextValue>(
    () => ({
      display: view.display,
      toStored: (displayed) => {
        const normalized = normalizeChordInput(displayed, view.accidental);
        if (!normalized) return null;
        return transposeChord(normalized, -song.transpose, originalAccidental);
      },
      currentKey: view.currentKey,
      accidental: view.accidental,
      suggestions: suggestedChords(view.currentKey, view.accidental),
      showNumerals,
      layoutKey: `${fontSize}|${lyricFont}|${fontsReady}`,
    }),
    [view, song.transpose, originalAccidental, showNumerals, fontSize, lyricFont, fontsReady],
  );

  useSheetKeyboard();

  return (
    <SheetContext.Provider value={ctx}>
      <div
        className={cn("song-sheet", lyricFont === "serif" && "lyric-serif")}
        style={
          {
            "--lyric-size": `${fontSize}px`,
            "--line-gap": `${SPACING[lineSpacing]}px`,
          } as React.CSSProperties
        }
        onPointerDown={(e) => {
          // Clicking empty canvas clears the chord selection.
          if (e.target === e.currentTarget) useEditor.getState().clear();
        }}
      >
        <div className="flex flex-col gap-[calc(var(--line-gap)+18px)]">
          {song.sections.map((section, i) => (
            <SectionBlock key={section.id} section={section} index={i} total={song.sections.length} />
          ))}
        </div>
        <div className="no-print mt-8">
          <AddSectionMenu afterId={song.sections[song.sections.length - 1]?.id} />
        </div>
      </div>
    </SheetContext.Provider>
  );
}

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/** Editor-wide keyboard shortcuts. */
function useSheetKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const { undo, redo } = useSongs.getState();
      const editor = useEditor.getState();

      if (mod && !e.altKey && e.key.toLowerCase() === "z") {
        // Let the browser handle undo inside the chord input, but route lyric undo to song history.
        if (isTypingTarget(e.target) && !(e.target as HTMLElement).getAttribute("aria-label")?.startsWith("Lyric"))
          return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (isTypingTarget(e.target)) return;

      const sel = editor.selected;
      if (sel && !editor.draft) {
        switch (e.key) {
          case "ArrowLeft":
            e.preventDefault();
            nudgeChord(sel, e.shiftKey || e.altKey ? "wordLeft" : "left");
            return;
          case "ArrowRight":
            e.preventDefault();
            nudgeChord(sel, e.shiftKey || e.altKey ? "wordRight" : "right");
            return;
          case "ArrowUp":
            e.preventDefault();
            selectVertical(-1);
            return;
          case "ArrowDown":
            e.preventDefault();
            selectVertical(1);
            return;
          case "Delete":
          case "Backspace":
            e.preventDefault();
            deleteChord(sel);
            return;
          case "Enter":
          case "F2":
            e.preventDefault();
            editSelected();
            return;
          case "Escape":
            editor.select(null);
            return;
        }
        if (mod && e.key.toLowerCase() === "d") {
          e.preventDefault();
          duplicateChord(sel);
          return;
        }
      }
      if (e.key === "Tab" && !mod) {
        e.preventDefault();
        selectSibling(e.shiftKey ? -1 : 1);
        return;
      }
      if (!mod && !e.altKey && (e.key === "]" || e.key === "[")) {
        e.preventDefault();
        transposeActions.by(e.key === "]" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
