import type { Song } from "../song/types";

/**
 * Persistence boundary. Phase 1 ships a localStorage implementation; Phase 4
 * swaps in a Supabase-backed repository with the same contract.
 */
export interface SongRepository {
  loadAll(): Promise<Song[] | null>;
  saveAll(songs: Song[]): Promise<void>;
}

const KEY = "chordsmith.songs.v1";

export const localSongRepository: SongRepository = {
  async loadAll() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return Array.isArray(data) ? (data as Song[]) : null;
    } catch {
      return null;
    }
  },
  async saveAll(songs) {
    localStorage.setItem(KEY, JSON.stringify(songs));
  },
};
