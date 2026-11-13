"use client";

import { create } from "zustand";

/** Transient interaction state for the song editor (never persisted, never undone). */

export interface ChordRef {
  lineId: string;
  chordId: string;
}

export interface ChordDraft {
  lineId: string;
  /** null when adding a new chord. */
  chordId: string | null;
  index: number;
}

export interface DragState {
  chordId: string;
  sourceLineId: string;
  targetLineId: string;
  index: number;
  copy: boolean;
}

interface EditorState {
  selected: ChordRef | null;
  draft: ChordDraft | null;
  lineEdit: { lineId: string; caret: number } | null;
  drag: DragState | null;
  /** Section id whose label is being renamed. */
  renaming: string | null;
  select: (ref: ChordRef | null) => void;
  startDraft: (draft: ChordDraft | null) => void;
  editLine: (lineId: string | null, caret?: number) => void;
  setDrag: (drag: DragState | null) => void;
  setRenaming: (id: string | null) => void;
  clear: () => void;
}

export const useEditor = create<EditorState>()((set) => ({
  selected: null,
  draft: null,
  lineEdit: null,
  drag: null,
  renaming: null,
  select: (selected) => set({ selected, draft: null }),
  startDraft: (draft) => set({ draft, selected: draft?.chordId ? { lineId: draft.lineId, chordId: draft.chordId } : null, lineEdit: null }),
  editLine: (lineId, caret = 0) => set({ lineEdit: lineId ? { lineId, caret } : null, selected: null, draft: null }),
  setDrag: (drag) => set({ drag }),
  setRenaming: (renaming) => set({ renaming }),
  clear: () => set({ selected: null, draft: null, lineEdit: null, drag: null }),
}));

/**
 * Registry of per-line geometry so cross-line drags and keyboard navigation
 * can translate between screen x and character index on any line.
 */
export interface LaneGeometry {
  /** x (viewport px) → nearest chord anchor index */
  indexAt(clientX: number): number;
  /** index → x relative to the lane's left edge */
  xOf(index: number): number;
  rect(): DOMRect;
}

export const laneRegistry = new Map<string, LaneGeometry>();
