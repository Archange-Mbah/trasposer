"use client";

import { createContext, useContext } from "react";
import type { Accidental } from "@/lib/music/notes";
import type { Key } from "@/lib/music/key";

export interface SheetContextValue {
  /** Stored (original-key) chord → chord in the currently displayed key. */
  display: (chord: string) => string;
  /** Chord typed by the user in the displayed key → stored chord. */
  toStored: (displayed: string) => string | null;
  currentKey: Key;
  accidental: Accidental;
  suggestions: string[];
  showNumerals: boolean;
  /** Changes whenever text metrics change (font, size, fonts loaded) to force re-measure. */
  layoutKey: string;
}

export const SheetContext = createContext<SheetContextValue | null>(null);

export function useSheet() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("useSheet must be used within SheetContext");
  return ctx;
}
