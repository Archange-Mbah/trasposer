/**
 * Pitch-class primitives. Everything in the music engine reduces notes to a
 * pitch class (0 = C … 11 = B) and spells them back out according to a
 * preferred accidental, so transposition is plain modular arithmetic rather
 * than a lookup table of string replacements.
 */

export type Accidental = "sharp" | "flat";

const LETTER_PC: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
  // German/Central-European notation: H is B natural.
  H: 11,
};

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export const mod12 = (n: number) => ((n % 12) + 12) % 12;

export interface ParsedNote {
  pc: number;
  /** Accidental the note was written with, if any. */
  accidental: Accidental | null;
}

/** Normalises unicode accidentals to ASCII. */
export function normalizeAccidentals(s: string): string {
  return s.replace(/♯/g, "#").replace(/♭/g, "b");
}

/** Parses a bare note name such as "C", "F#", "Bb", "Ebb". Returns null if invalid. */
export function parseNote(input: string): ParsedNote | null {
  const s = normalizeAccidentals(input.trim());
  const m = /^([A-H])(#{1,2}|b{1,2})?$/.exec(s);
  if (!m) return null;
  let pc = LETTER_PC[m[1]];
  const acc = m[2] ?? "";
  for (const ch of acc) pc += ch === "#" ? 1 : -1;
  return {
    pc: mod12(pc),
    accidental: acc.startsWith("#") ? "sharp" : acc.startsWith("b") ? "flat" : null,
  };
}

export function noteName(pc: number, accidental: Accidental): string {
  return (accidental === "flat" ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
}

export function letterPc(letter: string): number | undefined {
  return LETTER_PC[letter];
}
