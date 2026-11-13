"use client";

import { create } from "zustand";
import { detectKey, keyName, normalizeOffset } from "@/lib/music/key";
import { localSongRepository } from "@/lib/persistence/repository";
import { cloneSong, songChords } from "@/lib/song/ops";
import { createSampleSongs } from "@/lib/song/samples";
import { type Section, type Song, uid } from "@/lib/song/types";

type SaveState = "saved" | "saving" | "error";

interface SongsState {
  hydrated: boolean;
  songs: Song[];
  activeId: string | null;
  past: Song[];
  future: Song[];
  lastCommit: { key?: string; at: number };
  saveState: SaveState;

  hydrate: () => Promise<void>;
  open: (id: string) => void;
  /**
   * Applies a change to the active song and records it for undo.
   * Commits sharing a `coalesce` key within 1.2s merge into one undo step
   * (used for typing and nudging chords with the keyboard).
   */
  commit: (fn: (song: Song) => Song, opts?: { coalesce?: string }) => void;
  undo: () => void;
  redo: () => void;

  createSong: (init?: { title?: string; sections?: Section[]; originalKey?: string; artist?: string }) => string;
  duplicateSong: (id: string) => string | null;
  deleteSong: (id: string) => void;
  patchSong: (id: string, patch: Partial<Pick<Song, "title" | "artist" | "favorite">>) => void;
}

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;

export const useSongs = create<SongsState>()((set, get) => ({
  hydrated: false,
  songs: [],
  activeId: null,
  past: [],
  future: [],
  lastCommit: { at: 0 },
  saveState: "saved",

  hydrate: async () => {
    if (get().hydrated) return;
    let songs = await localSongRepository.loadAll();
    if (!songs || songs.length === 0) songs = createSampleSongs();
    const latest = [...songs].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0];
    set({ songs, activeId: latest?.id ?? null, hydrated: true });
  },

  open: (id) => {
    if (get().activeId === id) return;
    set((s) => ({
      activeId: id,
      past: [],
      future: [],
      lastCommit: { at: 0 },
      songs: s.songs.map((song) => (song.id === id ? { ...song, lastOpenedAt: Date.now() } : song)),
    }));
  },

  commit: (fn, opts) => {
    const { songs, activeId, past, lastCommit } = get();
    const current = songs.find((s) => s.id === activeId);
    if (!current) return;
    const next = fn(current);
    if (next === current) return;
    const now = Date.now();
    const coalesce = !!opts?.coalesce && opts.coalesce === lastCommit.key && now - lastCommit.at < COALESCE_MS;
    set({
      songs: songs.map((s) => (s.id === activeId ? { ...next, updatedAt: now } : s)),
      past: coalesce ? past : [...past, current].slice(-HISTORY_LIMIT),
      future: [],
      lastCommit: { key: opts?.coalesce, at: now },
    });
  },

  undo: () => {
    const { past, future, songs, activeId } = get();
    const prev = past[past.length - 1];
    const current = songs.find((s) => s.id === activeId);
    if (!prev || !current) return;
    set({
      songs: songs.map((s) => (s.id === activeId ? prev : s)),
      past: past.slice(0, -1),
      future: [current, ...future],
      lastCommit: { at: 0 },
    });
  },

  redo: () => {
    const { past, future, songs, activeId } = get();
    const next = future[0];
    const current = songs.find((s) => s.id === activeId);
    if (!next || !current) return;
    set({
      songs: songs.map((s) => (s.id === activeId ? next : s)),
      past: [...past, current],
      future: future.slice(1),
      lastCommit: { at: 0 },
    });
  },

  createSong: (init) => {
    const now = Date.now();
    const sections: Section[] = init?.sections ?? [
      { id: uid(), type: "verse", label: "Verse 1", lines: [{ id: uid(), text: "", chords: [] }] },
    ];
    const chords = sections.flatMap((s) => s.lines.flatMap((l) => l.chords.map((c) => c.chord)));
    const detected = detectKey(chords);
    const song: Song = {
      id: uid(),
      title: init?.title ?? "Untitled song",
      artist: init?.artist ?? "",
      originalKey: init?.originalKey ?? (detected ? keyName(detected.key) : "C"),
      transpose: 0,
      sections,
      favorite: false,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };
    set((s) => ({ songs: [song, ...s.songs], activeId: song.id, past: [], future: [] }));
    return song.id;
  },

  duplicateSong: (id) => {
    const src = get().songs.find((s) => s.id === id);
    if (!src) return null;
    const copy = cloneSong(src, { title: `${src.title} (copy)`, favorite: false });
    set((s) => {
      const idx = s.songs.findIndex((x) => x.id === id);
      const songs = [...s.songs];
      songs.splice(idx + 1, 0, copy);
      return { songs, activeId: copy.id, past: [], future: [] };
    });
    return copy.id;
  },

  deleteSong: (id) => {
    set((s) => {
      const songs = s.songs.filter((x) => x.id !== id);
      const activeId = s.activeId === id ? (songs[0]?.id ?? null) : s.activeId;
      return { songs, activeId, ...(s.activeId === id ? { past: [], future: [] } : {}) };
    });
  },

  patchSong: (id, patch) => {
    if (id === get().activeId && ("title" in patch || "artist" in patch)) {
      get().commit((s) => ({ ...s, ...patch }), { coalesce: "meta" });
      return;
    }
    set((s) => ({ songs: s.songs.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  },
}));

export const useActiveSong = () => useSongs((s) => s.songs.find((x) => x.id === s.activeId) ?? null);

/** Transposition helpers wired to the active song. */
export const transposeActions = {
  by(delta: number) {
    useSongs.getState().commit((s) => ({ ...s, transpose: normalizeOffset(s.transpose + delta) }), {
      coalesce: "transpose",
    });
  },
  to(offset: number) {
    useSongs.getState().commit((s) => ({ ...s, transpose: normalizeOffset(offset) }));
  },
  reset() {
    useSongs.getState().commit((s) => ({ ...s, transpose: 0 }));
  },
  redetectKey() {
    useSongs.getState().commit((s) => {
      const k = detectKey(songChords(s));
      return k ? { ...s, originalKey: keyName(k.key) } : s;
    });
  },
};

// ---------------------------------------------------------------------------
// Autosave: debounced write-through to the repository.
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | undefined;
if (typeof window !== "undefined") {
  useSongs.subscribe((state, prev) => {
    if (!state.hydrated || state.songs === prev.songs) return;
    if (state.saveState !== "saving") useSongs.setState({ saveState: "saving" });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await localSongRepository.saveAll(useSongs.getState().songs);
        useSongs.setState({ saveState: "saved" });
      } catch {
        useSongs.setState({ saveState: "error" });
      }
    }, 450);
  });
  window.addEventListener("beforeunload", () => {
    const { songs, hydrated } = useSongs.getState();
    if (hydrated) void localSongRepository.saveAll(songs);
  });
}
