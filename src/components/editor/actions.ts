"use client";

import { allLines, addChord, findLine, moveChord, removeChord, updateChord } from "@/lib/song/ops";
import { nextWordStart, prevWordStart } from "@/lib/song/remap";
import { type ChordMarker, uid } from "@/lib/song/types";
import { type ChordDraft, type ChordRef, useEditor } from "@/store/editor";
import { useSongs } from "@/store/songs";

/** Editor commands shared by pointer, keyboard and toolbar interactions. */

const activeSong = () => {
  const s = useSongs.getState();
  return s.songs.find((x) => x.id === s.activeId) ?? null;
};

const freeIndex = (chords: ChordMarker[], index: number, ignoreId?: string) => {
  let i = index;
  while (chords.some((c) => c.index === i && c.id !== ignoreId)) i++;
  return i;
};

export function commitDraft(draft: ChordDraft, stored: string, advance: "none" | "next" | "prev") {
  const song = activeSong();
  const loc = song && findLine(song, draft.lineId);
  if (!loc) return;
  const { commit } = useSongs.getState();
  const editor = useEditor.getState();

  if (draft.chordId) {
    commit((s) => updateChord(s, draft.lineId, draft.chordId!, stored));
  } else {
    commit((s) => addChord(s, draft.lineId, stored, draft.index));
  }

  if (advance === "none") {
    editor.startDraft(null);
    if (draft.chordId) editor.select({ lineId: draft.lineId, chordId: draft.chordId });
    return;
  }
  const text = loc.line.text;
  const nextIndex =
    advance === "next" ? nextWordStart(text, draft.index) : Math.max(0, prevWordStart(text, draft.index));
  const updated = findLine(activeSong()!, draft.lineId)!.line;
  const existing = updated.chords.find((c) => c.index === nextIndex);
  editor.startDraft({ lineId: draft.lineId, chordId: existing?.id ?? null, index: nextIndex });
}

export function deleteChord(ref: ChordRef) {
  const song = activeSong();
  const loc = song && findLine(song, ref.lineId);
  if (!loc) return;
  const sorted = [...loc.line.chords].sort((a, b) => a.index - b.index);
  const i = sorted.findIndex((c) => c.id === ref.chordId);
  const neighbour = sorted[i + 1] ?? sorted[i - 1];
  useSongs.getState().commit((s) => removeChord(s, ref.lineId, ref.chordId));
  useEditor.getState().select(neighbour ? { lineId: ref.lineId, chordId: neighbour.id } : null);
}

export function duplicateChord(ref: ChordRef) {
  const song = activeSong();
  const loc = song && findLine(song, ref.lineId);
  const chord = loc?.line.chords.find((c) => c.id === ref.chordId);
  if (!loc || !chord) return;
  const target = freeIndex(loc.line.chords, nextWordStart(loc.line.text, chord.index));
  const id = uid();
  useSongs.getState().commit((s) => addChord(s, ref.lineId, chord.chord, target, id));
  useEditor.getState().select({ lineId: ref.lineId, chordId: id });
}

export function nudgeChord(ref: ChordRef, mode: "left" | "right" | "wordLeft" | "wordRight") {
  const song = activeSong();
  const loc = song && findLine(song, ref.lineId);
  const chord = loc?.line.chords.find((c) => c.id === ref.chordId);
  if (!loc || !chord) return;
  const text = loc.line.text;
  let index = chord.index;
  if (mode === "left") index = Math.max(0, index - 1);
  if (mode === "right") index = Math.min(index + 1, Math.max(text.length + 24, index + 1));
  if (mode === "wordLeft") index = prevWordStart(text, index);
  if (mode === "wordRight") index = nextWordStart(text, index);
  // Skip over occupied slots rather than replacing a neighbour.
  const dir = index >= chord.index ? 1 : -1;
  while (loc.line.chords.some((c) => c.index === index && c.id !== chord.id) && index >= 0) index += dir;
  if (index < 0 || index === chord.index) return;
  useSongs
    .getState()
    .commit((s) => moveChord(s, ref.lineId, ref.chordId, ref.lineId, index), { coalesce: `nudge:${ref.chordId}` });
}

/** Ordered list of every chord in the song, for Tab navigation. */
function chordSequence() {
  const song = activeSong();
  if (!song) return [];
  return allLines(song).flatMap((l) =>
    [...l.chords].sort((a, b) => a.index - b.index).map((c) => ({ lineId: l.id, chordId: c.id, index: c.index })),
  );
}

export function selectSibling(dir: 1 | -1) {
  const seq = chordSequence();
  if (!seq.length) return;
  const sel = useEditor.getState().selected;
  const i = sel ? seq.findIndex((c) => c.chordId === sel.chordId) : -1;
  const next = seq[i < 0 ? (dir === 1 ? 0 : seq.length - 1) : (i + dir + seq.length) % seq.length];
  useEditor.getState().select({ lineId: next.lineId, chordId: next.chordId });
}

/** Moves selection to the chord on the line above/below closest to the current column. */
export function selectVertical(dir: 1 | -1) {
  const song = activeSong();
  const sel = useEditor.getState().selected;
  if (!song || !sel) return;
  const lines = allLines(song);
  const li = lines.findIndex((l) => l.id === sel.lineId);
  const col = lines[li]?.chords.find((c) => c.id === sel.chordId)?.index ?? 0;
  for (let j = li + dir; j >= 0 && j < lines.length; j += dir) {
    if (lines[j].chords.length) {
      const best = [...lines[j].chords].sort((a, b) => Math.abs(a.index - col) - Math.abs(b.index - col))[0];
      useEditor.getState().select({ lineId: lines[j].id, chordId: best.id });
      return;
    }
  }
}

export function editSelected() {
  const song = activeSong();
  const sel = useEditor.getState().selected;
  const loc = song && sel && findLine(song, sel.lineId);
  const chord = loc?.line.chords.find((c) => c.id === sel!.chordId);
  if (!chord || !sel) return;
  useEditor.getState().startDraft({ lineId: sel.lineId, chordId: chord.id, index: chord.index });
}
