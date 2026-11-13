import { type Accidental, mod12, noteName, normalizeAccidentals, parseNote } from "./notes";

/**
 * A chord symbol split into its musically meaningful parts.
 * `suffix` is kept verbatim (e.g. "m7b5", "sus4", "maj9(#11)") so that
 * transposition never rewrites how the user chose to write the quality.
 */
export interface ParsedChord {
  rootPc: number;
  rootAccidental: Accidental | null;
  suffix: string;
  bassPc: number | null;
  bassAccidental: Accidental | null;
}

/**
 * Grammar for the chord quality/extension part. Built from tokens rather than
 * a whitelist of full suffixes so that combinations like "m7b5", "7sus4",
 * "maj9#11", "add9", "6/9", "13(b9)" are accepted while ordinary words
 * ("Do", "Email", "Bed") are rejected.
 */
const SUFFIX_TOKEN =
  "(?:maj|Maj|MAJ|ma|M|min|mi|m|-|dim|°|aug|\\+|ø|Δ|sus|add|alt|no|omit|\\d{1,2}|[#b]|\\(|\\)|,|/(?=\\d))";
const SUFFIX_RE = new RegExp(`^${SUFFIX_TOKEN}*$`);
const CHORD_RE = /^([A-H])(#|b)?(.*?)(?:\/([A-H])(#|b)?)?$/;

export function parseChord(input: string): ParsedChord | null {
  const s = normalizeAccidentals(input.trim());
  if (!s || s.length > 16) return null;
  const m = CHORD_RE.exec(s);
  if (!m) return null;
  const [, rootLetter, rootAcc = "", suffix, bassLetter, bassAcc = ""] = m;
  if (!SUFFIX_RE.test(suffix)) return null;
  // A suffix must not end on a dangling "/" (e.g. "C/")
  if (suffix.endsWith("/")) return null;
  const root = parseNote(rootLetter + rootAcc)!;
  const bass = bassLetter ? parseNote(bassLetter + bassAcc) : null;
  return {
    rootPc: root.pc,
    rootAccidental: root.accidental,
    suffix,
    bassPc: bass ? bass.pc : null,
    bassAccidental: bass ? bass.accidental : null,
  };
}

export function isChord(input: string): boolean {
  return parseChord(input) !== null;
}

export function formatChord(c: ParsedChord, accidental: Accidental): string {
  const root = noteName(c.rootPc, accidental);
  const bass = c.bassPc === null ? "" : `/${noteName(c.bassPc, accidental)}`;
  return `${root}${c.suffix}${bass}`;
}

/**
 * Transposes a chord symbol by `semitones`, spelling the result with the
 * given accidental preference. Unparseable input is returned untouched so a
 * stray annotation (e.g. "N.C.") never gets corrupted.
 */
export function transposeChord(chord: string, semitones: number, accidental: Accidental): string {
  const parsed = parseChord(chord);
  if (!parsed) return chord;
  return formatChord(
    {
      ...parsed,
      rootPc: mod12(parsed.rootPc + semitones),
      bassPc: parsed.bassPc === null ? null : mod12(parsed.bassPc + semitones),
    },
    accidental,
  );
}

/** Canonicalises user input: unicode accidentals → ASCII, "H" → "B", trims. */
export function normalizeChordInput(input: string, accidental?: Accidental): string | null {
  const parsed = parseChord(input);
  if (!parsed) return null;
  const acc = accidental ?? parsed.rootAccidental ?? "sharp";
  return formatChord(parsed, acc);
}

// ---------------------------------------------------------------------------
// Chord anatomy — used for explanations, key detection and the assistant.
// ---------------------------------------------------------------------------

export type TriadQuality = "major" | "minor" | "diminished" | "augmented" | "suspended";

export interface ChordAnatomy {
  triad: TriadQuality;
  /** Semitone intervals above the root, sorted, unique. */
  intervals: number[];
  hasSeventh: boolean;
  seventh: "major" | "minor" | "diminished" | null;
}

export function analyzeSuffix(rawSuffix: string): ChordAnatomy {
  const s = rawSuffix.replace(/[()]/g, "").replace(/,/g, "");
  const intervals = new Set<number>([0]);

  const isHalfDim = /ø|m7b5|min7b5|mi7b5/.test(s);
  const isDim = !isHalfDim && /dim|°/.test(s);
  const isAug = /aug|^\+/.test(s) || /^(?:7)?#5/.test(s);
  const isMinor =
    isHalfDim || (!isDim && /^(?:m(?!a)|min|mi(?!n)|-)/.test(s) && !/^maj/i.test(s));
  const susMatch = /sus(2|4)?/.exec(s);

  let triad: TriadQuality = "major";
  if (isHalfDim || isDim) triad = "diminished";
  else if (isAug) triad = "augmented";
  else if (susMatch) triad = "suspended";
  else if (isMinor) triad = "minor";

  // Third
  if (triad === "suspended") intervals.add(susMatch![1] === "2" ? 2 : 5);
  else if (triad === "minor" || triad === "diminished") intervals.add(3);
  else intervals.add(4);

  // Fifth
  if (triad === "diminished" || /b5|-5/.test(s)) intervals.add(6);
  else if (triad === "augmented" || /#5|\+5/.test(s)) intervals.add(8);
  else if (!/no5|omit5/.test(s)) intervals.add(7);

  // Seventh & extensions
  const majSeventh = /maj(7|9|11|13)|M(7|9|11|13)|Δ|ma(7|9)/.test(s);
  const ext = /(?<![#b/]|add)(7|9|11|13)/.exec(s.replace(/maj|ma|M|Δ/g, ""));
  let seventh: ChordAnatomy["seventh"] = null;
  if (majSeventh || /Δ/.test(s)) {
    seventh = "major";
  } else if (isDim && /7/.test(s)) {
    seventh = "diminished";
  } else if (ext) {
    seventh = "minor";
  }
  if (seventh === "major") intervals.add(11);
  if (seventh === "minor") intervals.add(10);
  if (seventh === "diminished") intervals.add(9);

  const highest = Math.max(
    ...[...s.matchAll(/(?<![#b]|add)(9|11|13)/g)].map((m) => Number(m[1])),
    0,
  );
  if (highest >= 9) intervals.add(2);
  if (highest >= 11 && triad !== "suspended") intervals.add(5);
  if (highest >= 13) intervals.add(9);

  if (/(?<!\d)6/.test(s) && !/b6|#6/.test(s)) intervals.add(9);
  for (const m of s.matchAll(/add(b|#)?(2|4|9|11|13)/g)) {
    const base = { "2": 2, "4": 5, "9": 2, "11": 5, "13": 9 }[m[2]]!;
    intervals.add(mod12(base + (m[1] === "#" ? 1 : m[1] === "b" ? -1 : 0)));
  }
  if (/b9/.test(s)) intervals.add(1);
  if (/#9/.test(s)) intervals.add(3);
  if (/#11/.test(s)) intervals.add(6);
  if (/b13/.test(s)) intervals.add(8);

  return {
    triad,
    intervals: [...intervals].sort((a, b) => a - b),
    hasSeventh: seventh !== null,
    seventh,
  };
}

/** Note names contained in a chord (root first, slash bass prepended if outside). */
export function chordTones(chord: string, accidental: Accidental): string[] | null {
  const p = parseChord(chord);
  if (!p) return null;
  const { intervals } = analyzeSuffix(p.suffix);
  const tones = intervals.map((i) => noteName(p.rootPc + i, accidental));
  if (p.bassPc !== null) {
    const bass = noteName(p.bassPc, accidental);
    if (!tones.includes(bass)) tones.unshift(bass);
  }
  return tones;
}

const QUALITY_WORDS: Record<TriadQuality, string> = {
  major: "major",
  minor: "minor",
  diminished: "diminished",
  augmented: "augmented",
  suspended: "suspended",
};

/** Human-readable name, e.g. "E minor seven", "D major over F#". */
export function describeChord(chord: string, accidental: Accidental): string | null {
  const p = parseChord(chord);
  if (!p) return null;
  const a = analyzeSuffix(p.suffix);
  const root = noteName(p.rootPc, accidental);
  let name = `${root} ${QUALITY_WORDS[a.triad]}`;
  const s = p.suffix;
  if (/ø|m7b5/.test(s)) name = `${root} half-diminished`;
  else if (a.triad === "suspended") name = `${root} sus${/sus2/.test(s) ? "2" : "4"}`;
  if (a.seventh === "major") name += " seventh";
  else if (a.seventh === "minor" && a.triad === "major") name = `${root} dominant seventh`;
  else if (a.seventh === "minor" && a.triad !== "diminished") name += " seventh";
  else if (a.seventh === "diminished") name += " seventh";
  if (/add9|add2/.test(s)) name += ", added ninth";
  if (/(?<!\d)6/.test(s)) name += " sixth";
  if (p.bassPc !== null) name += ` over ${noteName(p.bassPc, accidental)}`;
  return name;
}
