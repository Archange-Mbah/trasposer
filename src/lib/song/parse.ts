import { isChord, normalizeChordInput } from "../music/chord";
import { type ChordMarker, type LyricLine, type Section, type SectionType, uid } from "./types";

/**
 * Text → structured song. Understands three common notations:
 *   1. Inline ChordPro brackets:   "[G]Regier in mir, in deiner [D]Kraft"
 *   2. Chords-over-lyrics lines:   "G            D\nRegier in mir, in deiner Kraft"
 *   3. Plain lyrics (no chords).
 * Blank lines and headings ("Chorus", "[Strophe 2]", "Refrain:") split sections.
 */

export interface ParsedLine {
  text: string;
  chords: { chord: string; index: number }[];
}

export function parseInlineLine(raw: string): ParsedLine {
  let text = "";
  const chords: ParsedLine["chords"] = [];
  const re = /\[([^\]]{1,16})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    text += raw.slice(last, m.index);
    const candidate = m[1].trim();
    if (isChord(candidate)) {
      chords.push({ chord: normalizeChordInput(candidate) ?? candidate, index: text.length });
    } else {
      text += m[0];
    }
    last = m.index + m[0].length;
  }
  text += raw.slice(last);
  return { text: text.replace(/\s+$/, ""), chords };
}

const NOISE_TOKEN = /^(\||\|\||-+|\/|x\d+|\d+x|\(|\)|\.{2,}|%)$/i;

export interface ChordLineAnalysis {
  isChordLine: boolean;
  /** 0–1. Below ~0.7 the import UI asks the user to confirm. */
  confidence: number;
  chords: { chord: string; index: number }[];
}

/** Single-letter / word-like chords that are also common words in EN/DE lyrics. */
const AMBIGUOUS = new Set(["A", "Am", "E", "Em", "D", "C", "B", "G", "F", "H"]);

export function analyzeChordLine(line: string): ChordLineAnalysis {
  const tokens = [...line.matchAll(/\S+/g)];
  if (tokens.length === 0) return { isChordLine: false, confidence: 0, chords: [] };
  const chords: ChordLineAnalysis["chords"] = [];
  let words = 0;
  for (const t of tokens) {
    const tok = t[0].replace(/^\(|\)$/g, "");
    if (NOISE_TOKEN.test(t[0])) continue;
    if (isChord(tok)) chords.push({ chord: normalizeChordInput(tok) ?? tok, index: t.index! });
    else words++;
  }
  if (chords.length === 0 || words > 0) {
    return { isChordLine: false, confidence: words > 0 && chords.length > 0 ? 0.2 : 0, chords: [] };
  }
  // A line of only ambiguous tokens with lyric-like spacing ("A") is less certain.
  const allAmbiguous = chords.every((c) => AMBIGUOUS.has(c.chord));
  const wideSpacing = /\S\s{2,}\S/.test(line) || line.startsWith(" ");
  let confidence = 0.95;
  if (allAmbiguous && chords.length === 1) confidence = 0.55;
  else if (allAmbiguous && !wideSpacing) confidence = 0.7;
  return { isChordLine: true, confidence, chords };
}

const HEADING_RE =
  /^\s*[[{(]?\s*(intro|vers|verse|strophe|str\.?|pre-?chorus|pre-?refrain|prechorus|chorus|refrain|ref\.?|bridge|br[üu]cke|instrumental|interlude|zwischenspiel|solo|tag|coda|outro|ending|schluss)\s*(\d+)?\s*[\]})]?\s*:?\s*$/i;

const HEADING_TYPE: [RegExp, SectionType][] = [
  [/^intro/i, "intro"],
  [/^pre/i, "prechorus"],
  [/^(chorus|refrain|ref)/i, "chorus"],
  [/^(bridge|br[üu]cke)/i, "bridge"],
  [/^(instrumental|interlude|zwischenspiel|solo)/i, "instrumental"],
  [/^(tag|coda)/i, "tag"],
  [/^(outro|ending|schluss)/i, "outro"],
  [/^(vers|verse|strophe|str)/i, "verse"],
];

export function parseHeading(line: string): { type: SectionType; label: string } | null {
  const m = HEADING_RE.exec(line);
  if (!m) return null;
  const word = m[1];
  const type = HEADING_TYPE.find(([re]) => re.test(word))?.[1] ?? "verse";
  const label = line.trim().replace(/^[[{(]\s*|\s*[\]})]?\s*:?\s*$/g, "");
  return { type, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

export interface ParseResult {
  sections: Section[];
  /** Lines whose chord/lyric classification is uncertain, for the correction step. */
  uncertain: { sectionId: string; lineId: string; rawLine: number; text: string; reason: string }[];
  chordCount: number;
}

const toLine = (p: ParsedLine): LyricLine => ({
  id: uid(),
  text: p.text,
  chords: p.chords.map<ChordMarker>((c) => ({ id: uid(), chord: c.chord, index: c.index })),
});

export function parseSongText(input: string, opts: { forceLyric?: Set<number> } = {}): ParseResult {
  const rawLines = input.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const sections: Section[] = [];
  const uncertain: ParseResult["uncertain"] = [];
  let current: Section | null = null;
  let chordCount = 0;

  const ensureSection = () => {
    if (!current) {
      current = { id: uid(), type: "verse", label: "", lines: [] };
      sections.push(current);
    }
    return current;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i].replace(/\s+$/, "");
    if (raw.trim() === "") {
      current = null;
      continue;
    }
    const heading = parseHeading(raw);
    if (heading) {
      current = { id: uid(), type: heading.type, label: heading.label, lines: [] };
      sections.push(current);
      continue;
    }
    if (/\[[^\]]+\]/.test(raw)) {
      const parsed = parseInlineLine(raw);
      if (parsed.chords.length) {
        chordCount += parsed.chords.length;
        ensureSection().lines.push(toLine(parsed));
        continue;
      }
    }
    const analysis = opts.forceLyric?.has(i)
      ? { isChordLine: false, confidence: 0, chords: [] }
      : analyzeChordLine(raw);
    if (analysis.isChordLine) {
      const next = rawLines[i + 1]?.replace(/\s+$/, "") ?? "";
      const nextIsLyric =
        next.trim() !== "" && !parseHeading(next) && !analyzeChordLine(next).isChordLine;
      const section = ensureSection();
      let line: LyricLine;
      if (nextIsLyric) {
        line = toLine({ text: next, chords: analysis.chords });
        i++;
      } else {
        line = toLine({ text: "", chords: analysis.chords });
      }
      chordCount += analysis.chords.length;
      section.lines.push(line);
      if (analysis.confidence < 0.75) {
        uncertain.push({
          sectionId: section.id,
          lineId: line.id,
          rawLine: i,
          text: raw.trim(),
          reason: `“${raw.trim()}” could be chords or a lyric`,
        });
      }
      continue;
    }
    ensureSection().lines.push(toLine({ text: raw, chords: [] }));
  }

  labelSections(sections);
  return { sections, uncertain, chordCount };
}

/** Auto-labels unlabeled paragraphs; a paragraph that repeats is treated as the chorus. */
function labelSections(sections: Section[]) {
  const signature = (s: Section) => s.lines.map((l) => l.text.trim().toLowerCase()).join("\n");
  const counts = new Map<string, number>();
  for (const s of sections) if (!s.label) counts.set(signature(s), (counts.get(signature(s)) ?? 0) + 1);
  const numbering = new Map<SectionType, number>();
  for (const s of sections) {
    if (!s.label) {
      const sig = signature(s);
      const lyricless = s.lines.every((l) => !l.text.trim());
      if (lyricless) s.type = sections.indexOf(s) === 0 ? "intro" : "instrumental";
      else if ((counts.get(sig) ?? 0) > 1) s.type = "chorus";
    }
    const n = (numbering.get(s.type) ?? 0) + 1;
    numbering.set(s.type, n);
    if (!s.label) s.label = defaultLabel(s.type, n);
  }
}

export function defaultLabel(type: SectionType, n: number): string {
  const base: Record<SectionType, string> = {
    intro: "Intro",
    verse: "Verse",
    prechorus: "Pre-Chorus",
    chorus: "Chorus",
    bridge: "Bridge",
    instrumental: "Instrumental",
    tag: "Tag",
    outro: "Outro",
  };
  return type === "verse" ? `${base[type]} ${n}` : base[type];
}
