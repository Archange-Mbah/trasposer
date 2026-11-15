import { isChord } from "../music/chord";
import { analyzeChordLine } from "../song/parse";

/**
 * Rebuilds plain text from positioned PDF text fragments.
 *
 * PDFs don't store lines, only text runs at x/y coordinates. We:
 *  1. group runs into lines by their baseline,
 *  2. join runs within a line using the real gaps between them,
 *  3. insert blank lines where the vertical gap is clearly larger than
 *     normal line spacing (paragraph / section breaks),
 *  4. re-align chord lines to the lyric line below *by x-coordinate*, so a
 *     chord printed above a syllable ends up above that same character even
 *     though the lyrics use a proportional font.
 * The output uses the "chords over lyrics" text convention understood by
 * `parseSongText`.
 */

export interface PdfTextRun {
  str: string;
  x: number;
  /** Baseline y in PDF space (grows upwards). */
  y: number;
  width: number;
  /** Font size (approx. glyph height). */
  size: number;
}

interface Line {
  y: number;
  size: number;
  runs: PdfTextRun[];
  text: string;
  /** x position of every character in `text`. */
  charX: number[];
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function groupLines(runs: PdfTextRun[]): Line[] {
  const sorted = runs.filter((r) => r.str.length > 0).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; size: number; runs: PdfTextRun[] }[] = [];
  for (const r of sorted) {
    const line = lines.find((l) => Math.abs(l.y - r.y) <= Math.max(1.5, 0.35 * Math.max(l.size, r.size)));
    if (line) {
      line.runs.push(r);
      line.size = Math.max(line.size, r.size);
    } else {
      lines.push({ y: r.y, size: r.size, runs: [r] });
    }
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const runsByX = l.runs.sort((a, b) => a.x - b.x);
      let text = "";
      const charX: number[] = [];
      let lastEnd: number | null = null;
      for (const r of runsByX) {
        if (r.str.trim() === "") {
          // Whitespace runs (pdf.js emits these for gaps) are word breaks.
          if (lastEnd !== null && !text.endsWith(" ")) {
            charX.push(lastEnd);
            text += " ";
          }
          if (lastEnd !== null) lastEnd = Math.max(lastEnd, r.x + r.width);
          continue;
        }
        const charW = r.str.length ? r.width / r.str.length : r.size * 0.5;
        const str = lastEnd === null ? r.str.replace(/^\s+/, "") : r.str;
        const x0 = r.x + (r.str.length - str.length) * charW;
        if (lastEnd !== null) {
          const gap = r.x - lastEnd;
          // A visible gap becomes one space. Wide gaps are layout, not text; chord lines
          // are re-aligned by x-coordinate later, so they don't depend on space counts.
          // Two touching runs that are each a chord ("Cmaj7" + "Dsus4") must stay separate
          // tokens, otherwise they'd glue into a non-chord and the line would read as a lyric.
          const prevTok = /\S+$/.exec(text)?.[0] ?? "";
          const nextTok = /^\S+/.exec(str)?.[0] ?? "";
          const gluedChords = !!prevTok && !!nextTok && isChord(prevTok) && isChord(nextTok) && !isChord(prevTok + nextTok);
          if ((gap > l.size * 0.12 || gluedChords) && !text.endsWith(" ")) {
            charX.push(lastEnd);
            text += " ";
          }
        }
        for (let i = 0; i < str.length; i++) {
          charX.push(x0 + i * charW);
          text += str[i];
        }
        lastEnd = r.x + r.width;
      }
      return { y: l.y, size: l.size, runs: runsByX, text: text.replace(/\s+$/, ""), charX };
    });
}

/** Positions of each whitespace-separated token within a line, in PDF x units. */
function tokensWithX(line: Line) {
  const out: { token: string; x: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text))) out.push({ token: m[0], x: line.charX[m.index] });
  return out;
}

/**
 * Character index in `text` closest to x. Character positions inside a PDF run
 * are estimated (pdf.js only reports the run's total width), so we snap to a
 * nearby word start, where chords almost always sit, and never land on a space.
 */
function nearestIndex(text: string, charX: number[], x: number, size: number): number {
  if (!charX.length) return 0;
  const last = charX[charX.length - 1];
  if (x > last + size * 0.6) {
    // Past the end of the lyric: extend with the average character width.
    const avg = charX.length > 1 ? (last - charX[0]) / (charX.length - 1) : size * 0.5;
    return charX.length - 1 + Math.max(1, Math.round((x - last) / Math.max(avg, 1)));
  }
  let best = 0;
  for (let i = 0; i < charX.length; i++) {
    if (Math.abs(charX[i] - x) < Math.abs(charX[best] - x)) best = i;
  }
  let snapped = -1;
  for (let i = 0; i < text.length; i++) {
    const isWordStart = text[i] !== " " && (i === 0 || text[i - 1] === " ");
    if (isWordStart && Math.abs(charX[i] - x) <= size * 0.7) {
      if (snapped < 0 || Math.abs(charX[i] - x) < Math.abs(charX[snapped] - x)) snapped = i;
    }
  }
  if (snapped >= 0) return snapped;
  if (text[best] === " " && best + 1 < text.length) best += 1;
  return best;
}

export function layoutPdfPages(pages: PdfTextRun[][]): string {
  const out: string[] = [];
  pages.forEach((runs, pageIndex) => {
    const lines = groupLines(runs);
    if (!lines.length) return;
    if (pageIndex > 0 && out.length && out[out.length - 1] !== "") out.push("");

    const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y).filter((g) => g > 0);
    const normalGap = median(gaps) || lines[0].size * 1.3;
    const left = Math.min(...lines.flatMap((l) => (l.charX.length ? [l.charX[0]] : [])));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i > 0) {
        const gap = lines[i - 1].y - line.y;
        if (gap > normalGap * 1.6 && out[out.length - 1] !== "") out.push("");
      }
      const next = lines[i + 1];
      const isChordLine = analyzeChordLine(line.text).isChordLine;
      const nextIsLyric =
        next && line.y - next.y <= normalGap * 1.6 && !analyzeChordLine(next.text).isChordLine && next.text.trim() !== "";

      if (isChordLine) {
        // Align against the lyric below if there is one; otherwise against the page's left margin.
        const ref = nextIsLyric ? next : null;
        let row = "";
        for (const { token, x } of tokensWithX(line)) {
          const col = ref
            ? nearestIndex(ref.text, ref.charX, x, ref.size)
            : Math.max(0, Math.round((x - left) / Math.max(line.size * 0.5, 1)));
          const at = Math.max(col, row.length === 0 ? 0 : row.length + 1);
          row = row.padEnd(at, " ") + token;
        }
        out.push(row);
      } else {
        out.push(line.text);
      }
    }
  });
  // Collapse runs of blank lines and trim.
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
