import { remapChords } from "./remap";
import { defaultLabel } from "./parse";
import { type ChordMarker, type LyricLine, type Section, type SectionType, type Song, uid } from "./types";

/**
 * Pure, immutable song transformations. Every editor action is expressed as
 * one of these so it can be undone, persisted and (later) synced as-is.
 */

const mapLines = (song: Song, fn: (line: LyricLine, section: Section) => LyricLine): Song => ({
  ...song,
  sections: song.sections.map((s) => ({ ...s, lines: s.lines.map((l) => fn(l, s)) })),
});

const mapLine = (song: Song, lineId: string, fn: (line: LyricLine) => LyricLine): Song =>
  mapLines(song, (l) => (l.id === lineId ? fn(l) : l));

const sortChords = (chords: ChordMarker[]) => [...chords].sort((a, b) => a.index - b.index);

export function findLine(song: Song, lineId: string) {
  for (let si = 0; si < song.sections.length; si++) {
    const li = song.sections[si].lines.findIndex((l) => l.id === lineId);
    if (li >= 0) return { section: song.sections[si], sectionIndex: si, line: song.sections[si].lines[li], lineIndex: li };
  }
  return null;
}

/** Flat, ordered list of all lines (for keyboard navigation). */
export function allLines(song: Song): LyricLine[] {
  return song.sections.flatMap((s) => s.lines);
}

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

export function addChord(song: Song, lineId: string, chord: string, index: number, id = uid()): Song {
  return mapLine(song, lineId, (l) => ({
    ...l,
    chords: sortChords([...l.chords.filter((c) => c.index !== index), { id, chord, index }]),
  }));
}

export function updateChord(song: Song, lineId: string, chordId: string, chord: string): Song {
  return mapLine(song, lineId, (l) => ({
    ...l,
    chords: l.chords.map((c) => (c.id === chordId ? { ...c, chord } : c)),
  }));
}

export function removeChord(song: Song, lineId: string, chordId: string): Song {
  return mapLine(song, lineId, (l) => ({ ...l, chords: l.chords.filter((c) => c.id !== chordId) }));
}

/**
 * Moves (or copies) a chord to an index on any line. A chord already sitting
 * at the destination index is replaced — two chords can't share one anchor.
 */
export function moveChord(
  song: Song,
  fromLineId: string,
  chordId: string,
  toLineId: string,
  index: number,
  copy = false,
  newId = uid(),
): Song {
  const from = findLine(song, fromLineId);
  const chord = from?.line.chords.find((c) => c.id === chordId);
  if (!chord) return song;
  const moved: ChordMarker = { id: copy ? newId : chord.id, chord: chord.chord, index: Math.max(0, index) };
  return mapLines(song, (l) => {
    let chords = l.chords;
    if (l.id === fromLineId && !copy) chords = chords.filter((c) => c.id !== chordId);
    if (l.id === toLineId) chords = sortChords([...chords.filter((c) => c.index !== moved.index), moved]);
    return chords === l.chords ? l : { ...l, chords };
  });
}

// ---------------------------------------------------------------------------
// Lyrics
// ---------------------------------------------------------------------------

export function setLineText(song: Song, lineId: string, text: string, caret?: number): Song {
  return mapLine(song, lineId, (l) => ({
    ...l,
    text,
    chords: remapChords(l.text, text, l.chords, caret),
  }));
}

/** Splits a line at `at`; chords at or after the split travel to the new line. */
export function splitLine(song: Song, lineId: string, at: number, newId = uid()): Song {
  return {
    ...song,
    sections: song.sections.map((s) => {
      const idx = s.lines.findIndex((l) => l.id === lineId);
      if (idx < 0) return s;
      const line = s.lines[idx];
      const head: LyricLine = {
        ...line,
        text: line.text.slice(0, at),
        chords: line.chords.filter((c) => c.index < at),
      };
      const tail: LyricLine = {
        id: newId,
        text: line.text.slice(at),
        chords: line.chords.filter((c) => c.index >= at).map((c) => ({ ...c, index: c.index - at })),
      };
      const lines = [...s.lines];
      lines.splice(idx, 1, head, tail);
      return { ...s, lines };
    }),
  };
}

/** Appends `lineId` to the previous line in the same section. Returns the caret position. */
export function mergeWithPrevious(song: Song, lineId: string): { song: Song; prevId: string; caret: number } | null {
  const loc = findLine(song, lineId);
  if (!loc || loc.lineIndex === 0) return null;
  const prev = loc.section.lines[loc.lineIndex - 1];
  const caret = prev.text.length;
  const merged: LyricLine = {
    ...prev,
    text: prev.text + loc.line.text,
    chords: sortChords([
      ...prev.chords.filter((c) => c.index < caret || loc.line.chords.length === 0),
      ...loc.line.chords.map((c) => ({ ...c, index: c.index + caret })),
    ]).filter((c, i, arr) => arr.findIndex((o) => o.index === c.index) === i),
  };
  const lines = [...loc.section.lines];
  lines.splice(loc.lineIndex - 1, 2, merged);
  return {
    song: { ...song, sections: song.sections.map((s) => (s.id === loc.section.id ? { ...s, lines } : s)) },
    prevId: prev.id,
    caret,
  };
}

export function insertLineAfter(song: Song, afterLineId: string, newId = uid()): Song {
  return {
    ...song,
    sections: song.sections.map((s) => {
      const idx = s.lines.findIndex((l) => l.id === afterLineId);
      if (idx < 0) return s;
      const lines = [...s.lines];
      lines.splice(idx + 1, 0, { id: newId, text: "", chords: [] });
      return { ...s, lines };
    }),
  };
}

export function appendLine(song: Song, sectionId: string, newId = uid()): Song {
  return {
    ...song,
    sections: song.sections.map((s) =>
      s.id === sectionId ? { ...s, lines: [...s.lines, { id: newId, text: "", chords: [] }] } : s,
    ),
  };
}

export function deleteLine(song: Song, lineId: string): Song {
  return {
    ...song,
    sections: song.sections.map((s) => ({ ...s, lines: s.lines.filter((l) => l.id !== lineId) })),
  };
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export function nextLabel(song: Song, type: SectionType): string {
  const n = song.sections.filter((s) => s.type === type).length + 1;
  return defaultLabel(type, n);
}

export function addSection(song: Song, type: SectionType, afterSectionId?: string, ids = { section: uid(), line: uid() }): Song {
  const section: Section = {
    id: ids.section,
    type,
    label: nextLabel(song, type),
    lines: [{ id: ids.line, text: "", chords: [] }],
  };
  const sections = [...song.sections];
  const idx = afterSectionId ? sections.findIndex((s) => s.id === afterSectionId) : -1;
  sections.splice(idx >= 0 ? idx + 1 : sections.length, 0, section);
  return { ...song, sections };
}

export function updateSection(song: Song, sectionId: string, patch: Partial<Pick<Section, "label" | "type">>): Song {
  return { ...song, sections: song.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)) };
}

export function deleteSection(song: Song, sectionId: string): Song {
  return { ...song, sections: song.sections.filter((s) => s.id !== sectionId) };
}

export function moveSection(song: Song, sectionId: string, dir: -1 | 1): Song {
  const i = song.sections.findIndex((s) => s.id === sectionId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= song.sections.length) return song;
  const sections = [...song.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  return { ...song, sections };
}

export function duplicateSection(song: Song, sectionId: string): Song {
  const i = song.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) return song;
  const src = song.sections[i];
  const copy: Section = {
    ...src,
    id: uid(),
    lines: src.lines.map((l) => ({ ...l, id: uid(), chords: l.chords.map((c) => ({ ...c, id: uid() })) })),
  };
  const sections = [...song.sections];
  sections.splice(i + 1, 0, copy);
  return { ...song, sections };
}

export function cloneSong(song: Song, patch: Partial<Song> = {}): Song {
  const now = Date.now();
  return {
    ...song,
    id: uid(),
    sections: song.sections.map((s) => ({
      ...s,
      id: uid(),
      lines: s.lines.map((l) => ({ ...l, id: uid(), chords: l.chords.map((c) => ({ ...c, id: uid() })) })),
    })),
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    ...patch,
  };
}

export function songChords(song: Song): string[] {
  return song.sections.flatMap((s) => s.lines.flatMap((l) => sortChords(l.chords).map((c) => c.chord)));
}
