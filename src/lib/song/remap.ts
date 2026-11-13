import type { ChordMarker } from "./types";

/**
 * Keeps chord markers attached to the right characters when a lyric line is
 * edited. We locate the edited region (using the caret as a hint to resolve
 * ambiguity such as typing a letter next to an identical one), then:
 *  - chords before the edit stay put,
 *  - chords after the edit shift by the length delta,
 *  - chords inside a deleted/replaced span collapse onto its start.
 */
export function remapChords(
  oldText: string,
  newText: string,
  chords: ChordMarker[],
  caret?: number,
): ChordMarker[] {
  if (oldText === newText || chords.length === 0) return chords;
  const { start, oldEnd, newEnd } = diffRegion(oldText, newText, caret);
  const delta = newEnd - oldEnd;
  return chords.map((c) => {
    if (c.index < start) return c;
    if (c.index >= oldEnd) return { ...c, index: Math.max(0, c.index + delta) };
    // Inside the replaced span: keep relative offset if it still fits.
    return { ...c, index: Math.min(c.index, newEnd) };
  });
}

export function diffRegion(oldText: string, newText: string, caret?: number) {
  const delta = newText.length - oldText.length;
  if (caret !== undefined) {
    // Pure insertion ending at the caret.
    if (delta > 0) {
      const start = caret - delta;
      if (
        start >= 0 &&
        oldText.slice(0, start) === newText.slice(0, start) &&
        oldText.slice(start) === newText.slice(caret)
      ) {
        return { start, oldEnd: start, newEnd: caret };
      }
    }
    // Pure deletion at the caret (backspace or forward-delete).
    if (delta < 0) {
      const start = caret;
      const oldEnd = caret - delta;
      if (
        oldText.slice(0, start) === newText.slice(0, start) &&
        oldText.slice(oldEnd) === newText.slice(start)
      ) {
        return { start, oldEnd, newEnd: start };
      }
    }
  }
  let start = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (start < minLen && oldText[start] === newText[start]) start++;
  let suffix = 0;
  while (
    suffix < minLen - start &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }
  return { start, oldEnd: oldText.length - suffix, newEnd: newText.length - suffix };
}

/** Index of the start of the word containing/after `index`. */
export function wordStarts(text: string): number[] {
  const starts: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== " " && (i === 0 || text[i - 1] === " ")) starts.push(i);
  }
  return starts;
}

export function nextWordStart(text: string, index: number): number {
  const s = wordStarts(text).find((w) => w > index);
  if (s !== undefined) return s;
  return Math.max(index + 4, text.length + 2);
}

export function prevWordStart(text: string, index: number): number {
  const starts = wordStarts(text).filter((w) => w < index);
  return starts.length ? starts[starts.length - 1] : 0;
}

/** [start, end) of the word at `index`, or null if index is on whitespace / past text. */
export function wordAt(text: string, index: number): [number, number] | null {
  if (index >= text.length || text[index] === " ") return null;
  let s = index;
  while (s > 0 && text[s - 1] !== " ") s--;
  let e = index;
  while (e < text.length && text[e] !== " ") e++;
  return [s, e];
}
