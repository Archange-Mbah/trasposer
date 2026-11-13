/**
 * Structured song model.
 *
 * Chords are stored in the song's *original* key and anchored to a character
 * index inside their lyric line. The current key is derived from
 * `originalKey + transpose`, so transposing is lossless, reversible and never
 * accumulates spelling drift.
 */

export type SectionType =
  | "intro"
  | "verse"
  | "prechorus"
  | "chorus"
  | "bridge"
  | "instrumental"
  | "tag"
  | "outro";

export interface ChordMarker {
  id: string;
  /** Chord symbol as written in the original key, e.g. "D/F#". */
  chord: string;
  /** Character index in the line the chord sits above. May exceed text length (trailing chords). */
  index: number;
}

export interface LyricLine {
  id: string;
  text: string;
  chords: ChordMarker[];
}

export interface Section {
  id: string;
  type: SectionType;
  label: string;
  lines: LyricLine[];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  /** Key name such as "G" or "Em". */
  originalKey: string;
  /** Semitone offset applied for display, normalised to -5…+6. */
  transpose: number;
  sections: Section[];
  favorite: boolean;
  tempo?: number;
  timeSignature?: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

export const SECTION_TYPES: { type: SectionType; label: string; short: string }[] = [
  { type: "intro", label: "Intro", short: "In" },
  { type: "verse", label: "Verse", short: "V" },
  { type: "prechorus", label: "Pre-Chorus", short: "PC" },
  { type: "chorus", label: "Chorus", short: "C" },
  { type: "bridge", label: "Bridge", short: "B" },
  { type: "instrumental", label: "Instrumental", short: "Inst" },
  { type: "tag", label: "Tag", short: "T" },
  { type: "outro", label: "Outro", short: "Out" },
];

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
