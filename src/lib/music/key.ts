import { analyzeSuffix, parseChord, type TriadQuality } from "./chord";
import { type Accidental, mod12, noteName, parseNote } from "./notes";

export type Mode = "major" | "minor";

export interface Key {
  tonicPc: number;
  mode: Mode;
}

export type NotationPreference = "auto" | "sharps" | "flats";

/** Conventional key names, chosen to be the friendliest spelling for players. */
const MAJOR_KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/** Keys whose signature uses flats. */
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1]); // F Bb Eb Ab Db
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]); // Dm Gm Cm Fm Bbm Ebm

export function parseKey(name: string): Key | null {
  const m = /^([A-H][#b♯♭]?)(m|min|minor)?$/.exec(name.trim());
  if (!m) return null;
  const n = parseNote(m[1]);
  if (!n) return null;
  return { tonicPc: n.pc, mode: m[2] ? "minor" : "major" };
}

/** Accidental a key "naturally" uses for spelling chords. */
export function keyAccidental(key: Key): Accidental {
  return (key.mode === "major" ? FLAT_MAJOR : FLAT_MINOR).has(mod12(key.tonicPc)) ? "flat" : "sharp";
}

export function resolveAccidental(key: Key | null, pref: NotationPreference): Accidental {
  if (pref === "sharps") return "sharp";
  if (pref === "flats") return "flat";
  return key ? keyAccidental(key) : "sharp";
}

export function keyName(key: Key, pref: NotationPreference = "auto"): string {
  const pc = mod12(key.tonicPc);
  let root: string;
  if (pref === "auto") root = (key.mode === "major" ? MAJOR_KEY_NAMES : MINOR_KEY_NAMES)[pc];
  else root = noteName(pc, pref === "flats" ? "flat" : "sharp");
  return key.mode === "minor" ? `${root}m` : root;
}

export function keyLabel(key: Key, pref: NotationPreference = "auto"): string {
  const name = keyName(key, pref);
  return key.mode === "minor" ? `${name.slice(0, -1)} minor` : `${name} major`;
}

export function transposeKey(key: Key, semitones: number): Key {
  return { tonicPc: mod12(key.tonicPc + semitones), mode: key.mode };
}

/** Shortest signed distance between two pitch classes, in -5…+6. */
export function semitoneDistance(fromPc: number, toPc: number): number {
  const d = mod12(toPc - fromPc);
  return d > 6 ? d - 12 : d;
}

export function normalizeOffset(semitones: number): number {
  const d = mod12(semitones);
  return d > 6 ? d - 12 : d;
}

// ---------------------------------------------------------------------------
// Diatonic harmony
// ---------------------------------------------------------------------------

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const MAJOR_TRIADS: TriadQuality[] = ["major", "minor", "minor", "major", "major", "minor", "diminished"];
const MINOR_TRIADS: TriadQuality[] = ["minor", "diminished", "major", "minor", "minor", "major", "major"];

export function scalePcs(key: Key): number[] {
  return (key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE).map((i) => mod12(key.tonicPc + i));
}

export interface DiatonicChord {
  degree: number; // 1-7
  rootPc: number;
  triad: TriadQuality;
  numeral: string;
  symbol: string;
}

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];

function triadSuffix(t: TriadQuality) {
  return t === "minor" ? "m" : t === "diminished" ? "dim" : t === "augmented" ? "aug" : "";
}

function numeralFor(base: string, t: TriadQuality) {
  if (t === "minor") return base.toLowerCase();
  if (t === "diminished") return `${base.toLowerCase()}°`;
  if (t === "augmented") return `${base}+`;
  return base;
}

export function diatonicChords(key: Key, accidental: Accidental): DiatonicChord[] {
  const scale = key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  const triads = key.mode === "major" ? MAJOR_TRIADS : MINOR_TRIADS;
  return scale.map((interval, i) => {
    const rootPc = mod12(key.tonicPc + interval);
    return {
      degree: i + 1,
      rootPc,
      triad: triads[i],
      numeral: numeralFor(NUMERALS[i], triads[i]),
      symbol: noteName(rootPc, accidental) + triadSuffix(triads[i]),
    };
  });
}

/** Chords a beginner most likely wants to reach for in this key. */
export function suggestedChords(key: Key, accidental: Accidental): string[] {
  const d = diatonicChords(key, accidental);
  if (key.mode === "major") return [d[0], d[3], d[4], d[5], d[1], d[2]].map((c) => c.symbol);
  // Minor: i, iv, VI, III, VII and the harmonic-minor V.
  const V = noteName(key.tonicPc + 7, accidental);
  return [d[0].symbol, d[3].symbol, d[5].symbol, d[2].symbol, d[6].symbol, V];
}

const MAJOR_DEGREE_LABELS = ["I", "♭II", "II", "♭III", "III", "IV", "♯IV", "V", "♭VI", "VI", "♭VII", "VII"];
const MINOR_DEGREE_LABELS = ["I", "♭II", "II", "III", "♯III", "IV", "♯IV", "V", "VI", "♯VI", "VII", "♯VII"];

export interface ChordFunction {
  numeral: string;
  diatonic: boolean;
  triad: TriadQuality;
}

/** Roman-numeral analysis of a chord in a key. */
export function chordFunction(chord: string, key: Key): ChordFunction | null {
  const p = parseChord(chord);
  if (!p) return null;
  const { triad, seventh } = analyzeSuffix(p.suffix);
  const interval = mod12(p.rootPc - key.tonicPc);
  const labels = key.mode === "major" ? MAJOR_DEGREE_LABELS : MINOR_DEGREE_LABELS;
  let numeral = numeralFor(labels[interval], triad === "suspended" ? "major" : triad);
  if (triad === "suspended") numeral += "sus";
  if (seventh) numeral += seventh === "major" ? "maj7" : "7";
  if (/ø|m7b5/.test(p.suffix)) numeral = numeral.replace("°7", "ø7");

  const scale = key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  const triads = key.mode === "major" ? MAJOR_TRIADS : MINOR_TRIADS;
  const degreeIdx = scale.indexOf(interval);
  let diatonic = false;
  if (degreeIdx >= 0) {
    const expected = triads[degreeIdx];
    diatonic = triad === expected || triad === "suspended";
    // Harmonic minor: V and V7 are idiomatic in minor keys.
    if (key.mode === "minor" && degreeIdx === 4 && triad === "major") diatonic = true;
  }
  return { numeral, diatonic, triad };
}

// ---------------------------------------------------------------------------
// Key detection
// ---------------------------------------------------------------------------

export interface KeyEstimate {
  key: Key;
  confidence: number; // 0–1
}

/**
 * Estimates the key from a chord sequence. Each of the 24 keys is scored by
 * how many chords are diatonic to it (weighted by occurrence), with extra
 * weight for the tonic chord and for the first and last chords, which in
 * popular and worship music very often land on the tonic.
 */
export function detectKey(chords: string[]): KeyEstimate | null {
  const parsed = chords
    .map((c) => parseChord(c))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => ({ pc: p.rootPc, triad: analyzeSuffix(p.suffix).triad }));
  if (parsed.length === 0) return null;

  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  let best: { key: Key; score: number } | null = null;
  let total = 0;
  const scores: number[] = [];

  for (const mode of ["major", "minor"] as Mode[]) {
    for (let tonic = 0; tonic < 12; tonic++) {
      const key = { tonicPc: tonic, mode };
      const scale = key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
      const triads = key.mode === "major" ? MAJOR_TRIADS : MINOR_TRIADS;
      const tonicTriad: TriadQuality = mode === "major" ? "major" : "minor";
      let score = 0;
      for (const c of parsed) {
        const idx = scale.indexOf(mod12(c.pc - tonic));
        if (idx < 0) {
          score -= 0.6;
          continue;
        }
        const fits =
          c.triad === triads[idx] ||
          c.triad === "suspended" ||
          (mode === "minor" && idx === 4 && c.triad === "major");
        score += fits ? 1 : 0.25;
        if (idx === 0 && c.triad === tonicTriad) score += 0.6;
      }
      const isTonic = (c: { pc: number; triad: TriadQuality }) =>
        c.pc === tonic && (c.triad === tonicTriad || c.triad === "suspended");
      if (isTonic(first)) score += 2;
      if (isTonic(last)) score += 2.5;
      if (mode === "minor") score -= 0.4; // gentle prior towards major
      scores.push(score);
      if (!best || score > best.score) best = { key, score };
    }
  }
  const max = best!.score;
  for (const s of scores) total += Math.exp((s - max) / 1.5);
  return { key: best!.key, confidence: Math.min(1, 1 / total) };
}
