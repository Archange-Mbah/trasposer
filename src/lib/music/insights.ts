import { analyzeSuffix, parseChord } from "./chord";
import { type Key, chordFunction, keyName, transposeKey } from "./key";
import { type Accidental, mod12, noteName } from "./notes";

/** Beginner-friendly descriptions of what a chord *does* in a key. */
const FUNCTION_BLURBS: Record<string, string> = {
  I: "Home base. It sounds settled and resolved — songs love to start and end here.",
  i: "Home base of a minor key. Settled, but with a darker, more inward colour.",
  ii: "A gentle “on the way” chord. It leads naturally to V and then home.",
  iii: "Soft and bittersweet. Often used in passing between I and IV or vi.",
  IV: "Warm and lifting. A classic way to open up a chorus or a big moment.",
  iv: "In a minor key: heavy, yearning. Borrowed into major keys it sounds nostalgic.",
  V: "Tension that wants to go home to I. The ear expects a resolution next.",
  v: "A softer, modal version of the dominant — less pull towards home.",
  vi: "The relative minor: same notes as I, but tender and more emotional.",
  VI: "In a minor key: bright and hopeful, often lifts the mood.",
  VII: "In a minor key: a strong step that leads back to i — very common in pop and rock.",
  "vii°": "Tense and unstable. It leans hard towards I, like a V7 without the root.",
  "♭VII": "Borrowed from the minor/mixolydian world — gives an anthemic, rock-like lift.",
  "♭VI": "Borrowed from the parallel minor — cinematic and dramatic.",
  "♭III": "Borrowed from the parallel minor — bold, unexpected colour.",
  III: "In a minor key: the relative major — a moment of light.",
  II: "A major II is a “secondary dominant” — it pulls strongly towards V.",
  III_major_in_major: "A major III pulls towards vi — great for an emotional turn.",
};

export function functionBlurb(numeral: string, diatonic: boolean, mode: Key["mode"]): string {
  const base = numeral.replace(/(maj7|7|sus)$/g, "").replace(/ø$/, "°");
  if (base === "III" && mode === "major") return FUNCTION_BLURBS.III_major_in_major;
  if (base === "VI" && mode === "major") return "A major VI is a secondary dominant pulling towards ii — a bright, surprising lift.";
  if (base === "I" && mode === "minor") return "A major tonic in a minor key — a “Picardy” moment of brightness.";
  return (
    FUNCTION_BLURBS[base] ??
    (diatonic
      ? "A chord from inside the key."
      : "This chord is outside the key. That can be a beautiful colour — just check it against your melody.")
  );
}

const BARRE_ROOTS = new Set([1, 3, 5, 6, 8, 10, 11]); // C# Eb F F# Ab Bb B — barre shapes on guitar for most qualities

export interface Simplification {
  chord: string;
  reason: string;
}

/** Suggests easier alternatives for a displayed chord. */
export function simplerAlternatives(chord: string, accidental: Accidental): Simplification[] {
  const p = parseChord(chord);
  if (!p) return [];
  const out: Simplification[] = [];
  const { triad, seventh } = analyzeSuffix(p.suffix);
  const root = noteName(p.rootPc, accidental);
  const basic = triad === "minor" ? `${root}m` : triad === "diminished" ? `${root}dim` : root;
  if (p.suffix && chord !== basic && (seventh || /add|9|11|13|6|sus|aug|\+/.test(p.suffix))) {
    out.push({ chord: basic, reason: "Same function, fewer notes — easier to finger." });
  }
  if (p.bassPc !== null) {
    out.push({
      chord: basic,
      reason: "Drop the bass note. The slash just tells the bass player (or your thumb) what to play.",
    });
  }
  if (BARRE_ROOTS.has(p.rootPc) && (triad === "major" || triad === "minor")) {
    if (p.rootPc === 5 && triad === "major") out.push({ chord: "Fmaj7", reason: "No barre needed and it still works as IV/I in most songs." });
    if (p.rootPc === 11 && triad === "minor") out.push({ chord: "Bm7", reason: "Open shape x20202 — no full barre." });
  }
  // Dedupe by chord name
  return out.filter((s, i, arr) => arr.findIndex((o) => o.chord === s.chord) === i).slice(0, 3);
}

const EASY_MAJOR = [7, 0, 2, 4, 9]; // G C D E A
const EASY_MINOR = [9, 4, 2]; // Am Em Dm

/** "Capo 2, play G shapes" style suggestion for keys that are awkward on guitar. */
export function capoSuggestion(key: Key): { capo: number; shapeKey: string } | null {
  const easy = key.mode === "major" ? EASY_MAJOR : EASY_MINOR;
  if (easy.includes(mod12(key.tonicPc))) return null;
  let best: { capo: number; shapeKey: string } | null = null;
  for (const pc of easy) {
    const capo = mod12(key.tonicPc - pc);
    if (capo >= 1 && capo <= 7 && (!best || capo < best.capo)) {
      best = { capo, shapeKey: keyName({ tonicPc: pc, mode: key.mode }) };
    }
  }
  return best;
}

const PATTERNS: { seq: string[]; name: string; note: string }[] = [
  { seq: ["I", "V", "vi", "IV"], name: "I–V–vi–IV", note: "The most-used progression in pop and worship music." },
  { seq: ["vi", "IV", "I", "V"], name: "vi–IV–I–V", note: "The same four chords starting on the minor — moodier." },
  { seq: ["I", "vi", "IV", "V"], name: "I–vi–IV–V", note: "The classic ’50s progression." },
  { seq: ["ii", "V", "I"], name: "ii–V–I", note: "The backbone of jazz harmony — a smooth way home." },
  { seq: ["I", "IV", "V"], name: "I–IV–V", note: "Blues, folk and rock’s foundation." },
  { seq: ["IV", "V", "vi"], name: "IV–V–vi", note: "A “deceptive” move — the ear expects I, gets vi." },
  { seq: ["i", "VI", "III", "VII"], name: "i–VI–III–VII", note: "Epic minor-key loop." },
  { seq: ["IV", "I", "V", "vi"], name: "IV–I–V–vi", note: "A rotation of the pop progression — common in choruses." },
];

export function findPatterns(chords: string[], key: Key) {
  const numerals = chords
    .map((c) => chordFunction(c, key)?.numeral.replace(/(maj7|7|sus)$/, ""))
    .filter((n): n is string => !!n)
    .filter((n, i, arr) => i === 0 || arr[i - 1] !== n);
  const joined = `|${numerals.join("|")}|`;
  return PATTERNS.filter((p) => joined.includes(`|${p.seq.join("|")}|`));
}

/** Relative key, e.g. G major ↔ E minor. */
export function relativeKey(key: Key): Key {
  return key.mode === "major"
    ? { tonicPc: mod12(key.tonicPc - 3), mode: "minor" }
    : { tonicPc: mod12(key.tonicPc + 3), mode: "major" };
}

export { transposeKey };
