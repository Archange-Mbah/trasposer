import { transposeChord } from "../music/chord";
import { type NotationPreference, keyName, parseKey, resolveAccidental, transposeKey } from "../music/key";
import type { LyricLine, Song } from "./types";

/** Everything the UI needs to render chords in the currently selected key. */
export function songView(song: Song, notation: NotationPreference) {
  const original = parseKey(song.originalKey) ?? { tonicPc: 0, mode: "major" as const };
  const current = transposeKey(original, song.transpose);
  const accidental = resolveAccidental(current, notation);
  return {
    originalKey: original,
    currentKey: current,
    accidental,
    currentKeyName: keyName(current, notation),
    display: (chord: string) => transposeChord(chord, song.transpose, accidental),
  };
}

/** Chord line + lyric line in monospace alignment ("chords over lyrics"). */
export function lineToText(line: LyricLine, display: (c: string) => string): string[] {
  const chords = [...line.chords].sort((a, b) => a.index - b.index);
  if (chords.length === 0) return [line.text];
  let chordRow = "";
  for (const c of chords) {
    const name = display(c.chord);
    const at = Math.max(c.index, chordRow.length === 0 ? 0 : chordRow.length + 1);
    chordRow = chordRow.padEnd(at, " ") + name;
  }
  return line.text.trim() ? [chordRow, line.text] : [chordRow];
}

export function songToPlainText(song: Song, notation: NotationPreference): string {
  const view = songView(song, notation);
  const out: string[] = [song.title];
  if (song.artist) out.push(song.artist);
  out.push(`Key: ${view.currentKeyName}`, "");
  for (const s of song.sections) {
    out.push(`[${s.label}]`);
    for (const l of s.lines) out.push(...lineToText(l, view.display));
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

export function songToChordPro(song: Song, notation: NotationPreference): string {
  const view = songView(song, notation);
  const out = [`{title: ${song.title}}`];
  if (song.artist) out.push(`{artist: ${song.artist}}`);
  out.push(`{key: ${view.currentKeyName}}`, "");
  for (const s of song.sections) {
    out.push(`{comment: ${s.label}}`);
    for (const l of s.lines) {
      const chords = [...l.chords].sort((a, b) => b.index - a.index);
      let text = l.text;
      for (const c of chords) {
        const at = Math.min(c.index, text.length);
        const pad = c.index > text.length ? " ".repeat(c.index - text.length) : "";
        text = text.slice(0, at) + pad + `[${view.display(c.chord)}]` + text.slice(at);
      }
      out.push(text);
    }
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

/** Compact text representation for the AI assistant's context window. */
export function songToAssistantContext(song: Song, notation: NotationPreference): string {
  return songToPlainText(song, notation);
}
