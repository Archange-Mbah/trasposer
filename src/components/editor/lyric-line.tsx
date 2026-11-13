"use client";

import { ArrowLeft, ArrowRight, Copy, CornerDownLeft, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { chordFunction } from "@/lib/music/key";
import {
  appendLine,
  deleteLine,
  findLine,
  insertLineAfter,
  mergeWithPrevious,
  moveChord,
  setLineText,
  splitLine,
  allLines,
} from "@/lib/song/ops";
import { wordAt } from "@/lib/song/remap";
import { type LyricLine, uid } from "@/lib/song/types";
import { type DragState, laneRegistry, useEditor } from "@/store/editor";
import { useSongs } from "@/store/songs";
import { MenuItem, MenuSeparator, Popover, cn } from "../ui/primitives";
import { commitDraft, deleteChord, duplicateChord, nudgeChord } from "./actions";
import { ChordInput } from "./chord-input";
import { useSheet } from "./sheet-context";

const PILL_PAD = 6; // px of horizontal padding inside a chord pill, so the chord's first letter sits over its anchor
const PILL_GAP = 4;
const MAX_TRAILING = 48;

interface LaneItem {
  id: string;
  chord: string;
  index: number;
  state: "normal" | "dragging" | "origin";
}

/**
 * One lyric line with its chord lane.
 *
 * Geometry is measured from the real rendered text with DOM Ranges, so chords
 * align exactly with proportional fonts at any size. Chords anchor to a
 * character index; when two chords would overlap, the later one is nudged
 * right and a thin stem still points at its true anchor.
 */
export const LineRow = memo(function LineRow({
  line,
  sectionId,
  isLastInSection,
}: {
  line: LyricLine;
  sectionId: string;
  isLastInSection: boolean;
}) {
  const sheet = useSheet();
  const { display, toStored, layoutKey, showNumerals, currentKey } = sheet;
  const commit = useSongs((s) => s.commit);

  const selectedId = useEditor((s) => (s.selected?.lineId === line.id ? s.selected.chordId : null));
  const draft = useEditor((s) => (s.draft?.lineId === line.id ? s.draft : null));
  const editing = useEditor((s) => (s.lineEdit?.lineId === line.id ? s.lineEdit : null));
  const drag = useEditor((s) =>
    s.drag && (s.drag.sourceLineId === line.id || s.drag.targetLineId === line.id) ? s.drag : null,
  );
  const anyDrag = useEditor((s) => s.drag !== null);

  const rowRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef(new Map<string, HTMLElement>());
  const stemRefs = useRef(new Map<string, HTMLElement>());
  const leftsCache = useRef<{ key: string; lefts: number[]; end: number; unit: number } | null>(null);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverChord, setHoverChord] = useState<string | null>(null);

  // ------------------------------------------------------------------ geometry
  const metrics = useCallback(() => {
    const cacheKey = `${line.text}|${layoutKey}`;
    if (leftsCache.current?.key === cacheKey) return leftsCache.current;
    const span = textRef.current;
    const node = span?.firstChild;
    const origin = span?.getBoundingClientRect().left ?? 0;
    const lefts: number[] = [];
    let end = 0;
    const fontSize = span ? parseFloat(getComputedStyle(span).fontSize) : 18;
    let unit = fontSize * 0.5;
    if (node && node.nodeType === Node.TEXT_NODE && line.text.length) {
      const range = document.createRange();
      for (let i = 0; i < line.text.length; i++) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        lefts.push(r.left - origin);
        end = r.right - origin;
        if (line.text[i] === " ") unit = Math.max(r.width, fontSize * 0.42);
      }
    }
    leftsCache.current = { key: cacheKey, lefts, end, unit };
    return leftsCache.current;
  }, [line.text, layoutKey]);

  const xOf = useCallback(
    (index: number) => {
      const { lefts, end, unit } = metrics();
      if (index < lefts.length) return lefts[index];
      const base = lefts.length ? end + unit * 0.35 : 0;
      return base + (index - lefts.length) * unit;
    },
    [metrics],
  );

  /** Maps a viewport x to a chord anchor index. `floor` = the character under x; `nearest` = closest anchor. */
  const indexAt = useCallback(
    (clientX: number, mode: "floor" | "nearest" = "nearest") => {
      const origin = textRef.current?.getBoundingClientRect().left ?? 0;
      const x = clientX - origin;
      const { lefts } = metrics();
      const max = lefts.length + MAX_TRAILING;
      if (x <= 0) return 0;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i <= max; i++) {
        const xi = xOf(i);
        if (mode === "floor") {
          if (xi <= x) best = i;
          else break;
        } else {
          const d = Math.abs(xi - x);
          if (d < bestD) {
            bestD = d;
            best = i;
          } else if (xi > x) break;
        }
      }
      // Don't anchor a chord on whitespace when clicking: move to the next character.
      if (mode === "floor" && line.text[best] === " " && best + 1 < line.text.length) best += 1;
      return best;
    },
    [metrics, xOf, line.text],
  );

  useEffect(() => {
    laneRegistry.set(line.id, {
      indexAt: (x) => indexAt(x, "nearest"),
      xOf,
      rect: () => rowRef.current!.getBoundingClientRect(),
    });
    return () => {
      laneRegistry.delete(line.id);
    };
  }, [line.id, indexAt, xOf]);

  // ------------------------------------------------------------------ lane items (incl. drag preview)
  const items = useMemo<LaneItem[]>(() => {
    let list: LaneItem[] = line.chords.map((c) => ({ ...c, state: "normal" }));
    if (drag) {
      const sameLine = drag.sourceLineId === drag.targetLineId;
      if (drag.sourceLineId === line.id) {
        list = list.map((c) => {
          if (c.id !== drag.chordId) return c;
          if (sameLine && !drag.copy) return { ...c, index: drag.index, state: "dragging" };
          return { ...c, state: "origin" };
        });
      }
      if (drag.targetLineId === line.id && (!sameLine || drag.copy)) {
        const src = findDragChord(drag);
        if (src) list.push({ id: "__drag", chord: src, index: drag.index, state: "dragging" });
      }
      // A chord sitting where the dragged one will land gets replaced; show that.
      const landing = drag.targetLineId === line.id ? drag.index : null;
      if (landing !== null) {
        list = list.filter((c) => c.state !== "normal" || c.index !== landing);
      }
    }
    return [...list].sort((a, b) => a.index - b.index || (a.state === "dragging" ? 1 : -1));
  }, [line.chords, line.id, drag]);

  // ------------------------------------------------------------------ layout pass
  const draggingIndex = items.find((i) => i.state === "dragging")?.index;
  const focusIndex =
    draggingIndex ??
    (draft ? draft.index : undefined) ??
    (hoverChord ? line.chords.find((c) => c.id === hoverChord)?.index : undefined) ??
    (selectedId ? line.chords.find((c) => c.id === selectedId)?.index : undefined) ??
    hoverIndex ??
    null;

  useLayoutEffect(() => {
    let prevRight = -Infinity;
    for (const item of items) {
      const el = pillRefs.current.get(item.id);
      if (!el) continue;
      const anchor = xOf(item.index);
      const left = Math.max(anchor - PILL_PAD, item.state === "origin" ? -Infinity : prevRight + PILL_GAP);
      el.style.transform = `translateX(${left}px)`;
      if (item.state !== "origin") prevRight = left + el.offsetWidth;
      const stem = stemRefs.current.get(item.id);
      if (stem) {
        stem.style.transform = `translateX(${anchor}px)`;
        stem.style.opacity = left > anchor - PILL_PAD + 1 ? "1" : "";
      }
    }
    if (ghostRef.current && hoverIndex !== null) {
      ghostRef.current.style.transform = `translateX(${xOf(hoverIndex) - PILL_PAD}px)`;
    }
    if (draftRef.current && draft) {
      draftRef.current.style.transform = `translateX(${xOf(draft.index) - PILL_PAD - 1}px)`;
    }
    const hl = highlightRef.current;
    if (hl) {
      if (focusIndex === null || focusIndex >= line.text.length) {
        hl.style.opacity = "0";
      } else {
        const [s, e] = wordAt(line.text, focusIndex) ?? [focusIndex, focusIndex + 1];
        const x0 = xOf(s);
        const x1 = e < line.text.length ? xOf(e) : metrics().end;
        hl.style.opacity = "1";
        hl.style.transform = `translateX(${x0 - 2}px)`;
        hl.style.width = `${x1 - x0 + 4}px`;
      }
    }
  });

  // Re-measure once web fonts finish loading.
  useEffect(() => {
    leftsCache.current = null;
  }, [layoutKey]);

  // ------------------------------------------------------------------ lyric editing
  useEffect(() => {
    if (!editing || !inputRef.current) return;
    const el = inputRef.current;
    if (document.activeElement !== el) {
      el.focus({ preventScroll: false });
      const c = Math.min(editing.caret, el.value.length);
      el.setSelectionRange(c, c);
    }
  }, [editing]);

  const onLyricKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const caret = el.selectionStart ?? 0;
    const collapsed = el.selectionStart === el.selectionEnd;
    const editor = useEditor.getState();
    const songState = useSongs.getState();
    const song = songState.songs.find((s) => s.id === songState.activeId)!;

    if (e.key === "Enter") {
      e.preventDefault();
      const id = uid();
      commit((s) => splitLine(s, line.id, caret, id));
      editor.editLine(id, 0);
    } else if (e.key === "Backspace" && collapsed && caret === 0) {
      const res = mergeWithPrevious(song, line.id);
      if (res) {
        e.preventDefault();
        commit(() => res.song);
        editor.editLine(res.prevId, res.caret);
      } else if (line.text === "" && line.chords.length === 0) {
        const lines = allLines(song);
        const i = lines.findIndex((l) => l.id === line.id);
        const prev = lines[i - 1];
        const loc = findLine(song, line.id);
        if (prev && loc && loc.section.lines.length > 1) {
          e.preventDefault();
          commit((s) => deleteLine(s, line.id));
          editor.editLine(prev.id, prev.text.length);
        }
      }
    } else if (e.key === "Delete" && collapsed && caret === line.text.length) {
      const loc = findLine(song, line.id);
      const next = loc?.section.lines[loc.lineIndex + 1];
      if (next) {
        e.preventDefault();
        const res = mergeWithPrevious(song, next.id);
        if (res) commit(() => res.song);
        editor.editLine(line.id, caret);
      }
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const lines = allLines(song);
      const i = lines.findIndex((l) => l.id === line.id);
      const target = lines[i + (e.key === "ArrowUp" ? -1 : 1)];
      if (target) editor.editLine(target.id, Math.min(caret, target.text.length));
    } else if (e.key === "Escape") {
      e.preventDefault();
      editor.editLine(null);
    }
  };

  const startEditingAt = (clientX: number) => {
    if (useEditor.getState().drag) return;
    const caret = line.text ? Math.min(indexAt(clientX, "nearest"), line.text.length) : 0;
    useEditor.getState().editLine(line.id, caret);
  };

  // ------------------------------------------------------------------ chord drafting
  const openDraftAt = (clientX: number) => {
    const index = indexAt(clientX, "floor");
    const existing = line.chords.find((c) => c.index === index);
    useEditor.getState().startDraft({ lineId: line.id, chordId: existing?.id ?? null, index });
  };

  const draftChord = draft?.chordId ? line.chords.find((c) => c.id === draft.chordId) : null;
  const onDraftCommit = useCallback(
    (value: string, advance: "none" | "next" | "prev") => {
      const d = useEditor.getState().draft;
      const stored = toStored(value);
      if (!d || !stored) return;
      commitDraft(d, stored, advance);
    },
    [toStored],
  );
  const onDraftCancel = useCallback(() => useEditor.getState().startDraft(null), []);
  const onDraftDelete = useCallback(() => {
    const d = useEditor.getState().draft;
    if (d?.chordId) deleteChord({ lineId: d.lineId, chordId: d.chordId });
    useEditor.getState().startDraft(null);
  }, []);

  // ------------------------------------------------------------------ render
  const isEmpty = line.text.length === 0;
  const hasChords = line.chords.length > 0;
  const showGhost = hoverIndex !== null && !draft && !anyDrag && !line.chords.some((c) => c.index === hoverIndex);

  return (
    <div
      ref={rowRef}
      data-line-row={line.id}
      className="group/line relative"
      style={{ paddingBottom: "var(--line-gap)" }}
    >
      {/* Gutter actions */}
      <div className="no-print absolute -left-9 bottom-[var(--line-gap)] flex h-[1.6em] items-center opacity-0 transition-opacity group-hover/line:opacity-100 [@media(hover:none)]:opacity-60">
        <Popover
          trigger={({ toggle, open }) => (
            <button
              type="button"
              aria-label="Line actions"
              onClick={toggle}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded text-ink-4 hover:bg-muted hover:text-ink-2",
                open && "bg-muted text-ink-2",
              )}
            >
              <GripVertical size={14} />
            </button>
          )}
          className="w-56"
        >
          {(close) => (
            <>
              <MenuItem
                icon={<Plus />}
                onClick={() => {
                  const id = uid();
                  commit((s) => insertLineAfter(s, line.id, id));
                  useEditor.getState().editLine(id, 0);
                  close();
                }}
              >
                Insert line below
              </MenuItem>
              <MenuItem
                icon={<CornerDownLeft />}
                onClick={() => {
                  close();
                  useEditor.getState().startDraft({ lineId: line.id, chordId: null, index: 0 });
                }}
              >
                Add chord at start
              </MenuItem>
              <MenuItem
                icon={<Trash2 />}
                disabled={!hasChords}
                onClick={() => {
                  commit((s) => ({
                    ...s,
                    sections: s.sections.map((sec) => ({
                      ...sec,
                      lines: sec.lines.map((l) => (l.id === line.id ? { ...l, chords: [] } : l)),
                    })),
                  }));
                  close();
                }}
              >
                Clear chords on line
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash2 />}
                onClick={() => {
                  commit((s) => {
                    const next = deleteLine(s, line.id);
                    // Never leave a section without a line.
                    const sec = next.sections.find((x) => x.id === sectionId);
                    return sec && sec.lines.length === 0 ? appendLine(next, sectionId) : next;
                  });
                  close();
                }}
              >
                Delete line
              </MenuItem>
            </>
          )}
        </Popover>
      </div>

      {/* Chord lane */}
      <div
        ref={laneRef}
        data-lane={line.id}
        className={cn(
          "relative cursor-text select-none",
          "before:pointer-events-none before:absolute before:inset-x-0 before:bottom-[2px] before:top-[3px] before:rounded-md before:transition-colors",
          !anyDrag && "hover:before:bg-accent-softer",
          drag?.targetLineId === line.id && "before:bg-accent-softer",
        )}
        style={{ height: "var(--lane-h)", cursor: anyDrag ? "grabbing" : "copy" }}
        onPointerMove={(e) => {
          if (anyDrag || e.target !== e.currentTarget) return;
          setHoverIndex(indexAt(e.clientX, "floor"));
        }}
        onPointerLeave={() => setHoverIndex(null)}
        onPointerDown={(e) => {
          if (e.target !== e.currentTarget || e.button !== 0) return;
          e.preventDefault();
          openDraftAt(e.clientX);
          setHoverIndex(null);
        }}
      >
        {items.map((item) => (
          <ChordPill
            key={item.id}
            item={item}
            lineId={line.id}
            label={display(item.chord)}
            numeral={showNumerals ? (chordFunction(display(item.chord), currentKey)?.numeral ?? null) : null}
            selected={selectedId === item.id}
            hidden={draft?.chordId === item.id}
            refCb={(el) => {
              if (el) pillRefs.current.set(item.id, el);
              else pillRefs.current.delete(item.id);
            }}
            stemRef={(el) => {
              if (el) stemRefs.current.set(item.id, el);
              else stemRefs.current.delete(item.id);
            }}
            onHover={setHoverChord}
            text={line.text}
          />
        ))}

        {showGhost && (
          <div
            ref={ghostRef}
            className="pointer-events-none absolute bottom-[4px] left-0 flex h-[1.6em] items-center gap-0.5 rounded-md border border-dashed border-accent-line px-1.5 text-accent/70 chord-pill"
          >
            <Plus size={11} strokeWidth={2.5} />
          </div>
        )}

        {draft && (
          <div ref={draftRef} className="absolute bottom-0 left-0 z-30 h-0">
            <ChordInput
              key={`${draft.chordId ?? "new"}:${draft.index}`}
              initial={draftChord ? display(draftChord.chord) : ""}
              onCommit={onDraftCommit}
              onCancel={onDraftCancel}
              onDelete={draft.chordId ? onDraftDelete : undefined}
            />
          </div>
        )}
      </div>

      {/* Lyric */}
      <div className="relative">
        <div
          ref={highlightRef}
          aria-hidden
          className="pointer-events-none absolute left-0 top-[0.12em] h-[1.3em] rounded-[4px] bg-accent-soft opacity-0 transition-[opacity,transform,width] duration-100"
        />
        <span
          ref={textRef}
          className={cn(
            "lyric-text relative block min-h-[1.5em] cursor-text text-ink",
            editing && "invisible",
            // Chord-only (instrumental) lines collapse their empty lyric row.
            isEmpty && hasChords && !editing && "!min-h-0 h-[0.5em] overflow-hidden",
          )}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            startEditingAt(e.clientX);
          }}
        >
          {line.text || "​"}
        </span>
        {isEmpty && !editing && (
          <span
            className={cn(
              "lyric-text pointer-events-none absolute left-0 top-0 italic text-ink-4 transition-opacity",
              hasChords ? "hidden" : "opacity-0 group-hover/line:opacity-100",
            )}
          >
            {isLastInSection ? "Empty line — click to type" : "Empty line"}
          </span>
        )}
        {editing && (
          <input
            ref={inputRef}
            value={line.text}
            spellCheck={false}
            aria-label="Lyric line"
            placeholder={hasChords ? "Instrumental line — or type lyrics" : "Type lyrics…"}
            onChange={(e) =>
              commit((s) => setLineText(s, line.id, e.target.value, e.target.selectionEnd ?? undefined), {
                coalesce: `text:${line.id}`,
              })
            }
            onKeyDown={onLyricKeyDown}
            onBlur={() => {
              if (useEditor.getState().lineEdit?.lineId === line.id) useEditor.getState().editLine(null);
            }}
            className="lyric-text absolute inset-0 m-0 w-full min-w-[12ch] border-0 bg-transparent p-0 text-ink caret-accent outline-none placeholder:italic placeholder:text-ink-4"
          />
        )}
      </div>
    </div>
  );
});

function findDragChord(drag: DragState): string | null {
  const st = useSongs.getState();
  const song = st.songs.find((s) => s.id === st.activeId);
  const loc = song && findLine(song, drag.sourceLineId);
  return loc?.line.chords.find((c) => c.id === drag.chordId)?.chord ?? null;
}

// ---------------------------------------------------------------------------

const ChordPill = memo(function ChordPill({
  item,
  lineId,
  label,
  numeral,
  selected,
  hidden,
  refCb,
  stemRef,
  onHover,
  text,
}: {
  item: LaneItem;
  lineId: string;
  label: string;
  numeral: string | null;
  selected: boolean;
  hidden: boolean;
  refCb: (el: HTMLElement | null) => void;
  stemRef: (el: HTMLElement | null) => void;
  onHover: (id: string | null) => void;
  text: string;
}) {
  const gesture = useRef<{
    startX: number;
    startY: number;
    grab: number;
    dragging: boolean;
    pointerId: number;
    startIndex: number;
  } | null>(null);
  const isPreview = item.id === "__drag";

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || isPreview) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    gesture.current = {
      startX: e.clientX,
      startY: e.clientY,
      grab: e.clientX - rect.left,
      dragging: false,
      pointerId: e.pointerId,
      startIndex: item.index,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.dragging) {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 4) return;
      g.dragging = true;
      useEditor.getState().select({ lineId, chordId: item.id });
    }
    // Which line is under the pointer?
    let targetLineId = lineId;
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      const id = (el as HTMLElement).dataset?.lineRow;
      if (id) {
        targetLineId = id;
        break;
      }
    }
    const geo = laneRegistry.get(targetLineId);
    if (!geo) return;
    const index = geo.indexAt(e.clientX - g.grab + PILL_PAD);
    const prev = useEditor.getState().drag;
    if (prev && prev.targetLineId === targetLineId && prev.index === index && prev.copy === e.altKey) return;
    useEditor.getState().setDrag({
      chordId: item.id,
      sourceLineId: lineId,
      targetLineId,
      index,
      copy: e.altKey,
    });
    autoScroll(e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const editor = useEditor.getState();
    const drag = editor.drag;
    if (g.dragging && drag) {
      editor.setDrag(null);
      const newId = uid();
      const sameSpot = drag.targetLineId === lineId && drag.index === g.startIndex && !drag.copy;
      if (!sameSpot) {
        useSongs
          .getState()
          .commit((s) => moveChord(s, lineId, item.id, drag.targetLineId, drag.index, drag.copy, newId));
      }
      editor.select({ lineId: drag.targetLineId, chordId: drag.copy ? newId : item.id });
      return;
    }
    // Plain click: select; clicking an already-selected chord edits it.
    if (selected) editor.startDraft({ lineId, chordId: item.id, index: g.startIndex });
    else editor.select({ lineId, chordId: item.id });
    e.currentTarget.focus({ preventScroll: true });
  };

  const onPointerCancel = () => {
    gesture.current = null;
    useEditor.getState().setDrag(null);
  };

  const word = wordAt(text, item.index);
  const anchorLabel = word ? text.slice(word[0], word[1]) : item.index >= text.length ? "end of line" : "space";

  return (
    <>
      <span
        ref={stemRef}
        aria-hidden
        className="chord-stem pointer-events-none absolute -bottom-[3px] left-0 h-[9px] w-px bg-chord-fg/50 opacity-0 transition-opacity"
      />
      <div
        ref={refCb}
        className={cn(
          "absolute bottom-[4px] left-0 will-change-transform",
          item.state === "dragging" && "z-20",
          selected && "z-10",
          hidden && "invisible",
        )}
      >
        <button
          type="button"
          data-chord-id={item.id}
          aria-label={`Chord ${label} on “${anchorLabel}”`}
          aria-pressed={selected}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerEnter={() => onHover(item.id)}
          onPointerLeave={() => onHover(null)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            useEditor.getState().startDraft({ lineId, chordId: item.id, index: item.index });
          }}
          className={cn(
            "chord-pill flex h-[1.6em] touch-none items-center gap-1 whitespace-nowrap rounded-md border px-[5px] font-semibold leading-none tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow,opacity] duration-100",
            "cursor-grab active:cursor-grabbing focus:outline-none",
            selected
              ? "border-accent bg-accent text-white shadow-md dark:text-[#0b1120]"
              : "border-chord-line bg-chord-bg text-chord-fg hover:border-accent/60 hover:shadow-sm",
            item.state === "dragging" && "scale-[1.04] border-accent shadow-lg",
            item.state === "origin" && "opacity-30",
          )}
        >
          {label}
          {numeral && (
            <span className={cn("text-[0.78em] font-medium", selected ? "text-white/70" : "text-ink-3")}>{numeral}</span>
          )}
        </button>
        {selected && item.state === "normal" && <PillToolbar lineId={lineId} chordId={item.id} />}
      </div>
    </>
  );
});

function PillToolbar({ lineId, chordId }: { lineId: string; chordId: string }) {
  const ref = { lineId, chordId };
  const btn =
    "flex h-6 w-6 items-center justify-center rounded text-ink-3 transition-colors hover:bg-subtle hover:text-ink";
  return (
    <div
      className="no-print absolute bottom-full left-1/2 z-30 mb-1.5 flex -translate-x-1/2 animate-pop items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5 shadow-lg"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button type="button" className={btn} title="Move left (←)" onClick={() => nudgeChord(ref, "left")}>
        <ArrowLeft size={13} />
      </button>
      <button type="button" className={btn} title="Move right (→)" onClick={() => nudgeChord(ref, "right")}>
        <ArrowRight size={13} />
      </button>
      <span className="mx-0.5 h-4 w-px bg-line" />
      <button
        type="button"
        className={btn}
        title="Edit (Enter)"
        onClick={() => {
          const song = useSongs.getState().songs.find((s) => s.id === useSongs.getState().activeId);
          const c = song && findLine(song, lineId)?.line.chords.find((x) => x.id === chordId);
          if (c) useEditor.getState().startDraft({ lineId, chordId, index: c.index });
        }}
      >
        <Pencil size={12.5} />
      </button>
      <button type="button" className={btn} title="Duplicate (Ctrl/⌘ D)" onClick={() => duplicateChord(ref)}>
        <Copy size={12.5} />
      </button>
      <button
        type="button"
        className={cn(btn, "hover:bg-danger/10 hover:text-danger")}
        title="Delete (Del)"
        onClick={() => deleteChord(ref)}
      >
        <Trash2 size={12.5} />
      </button>
    </div>
  );
}

function autoScroll(clientY: number) {
  const scroller = document.querySelector<HTMLElement>("[data-sheet-scroller]");
  if (!scroller) return;
  const r = scroller.getBoundingClientRect();
  const edge = 56;
  if (clientY < r.top + edge) scroller.scrollBy({ top: -14 });
  else if (clientY > r.bottom - edge) scroller.scrollBy({ top: 14 });
}
