"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { NotationPreference } from "@/lib/music/key";

export type Theme = "light" | "dark" | "system";
export type LineSpacing = "compact" | "comfortable" | "relaxed";
export type LyricFont = "serif" | "sans";

interface SettingsState {
  theme: Theme;
  fontSize: number;
  lineSpacing: LineSpacing;
  lyricFont: LyricFont;
  notation: NotationPreference;
  showNumerals: boolean;
  assistantOpen: boolean;
  set: (patch: Partial<Omit<SettingsState, "set">>) => void;
}

export const FONT_SIZES = { min: 15, max: 28, step: 1 };

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      fontSize: 19,
      lineSpacing: "comfortable",
      lyricFont: "serif",
      notation: "auto",
      showNumerals: false,
      assistantOpen: true,
      set: (patch) => set(patch),
    }),
    {
      name: "chordsmith.settings.v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { set, ...rest } = state;
        void set;
        return rest;
      },
    },
  ),
);

export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}
