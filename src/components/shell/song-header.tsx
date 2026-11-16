"use client";

import { Lightbulb, X } from "lucide-react";
import { useState } from "react";
import { keyLabel } from "@/lib/music/key";
import { songView } from "@/lib/song/serialize";
import type { Song } from "@/lib/song/types";
import { useSettings } from "@/store/settings";
import { useSongs } from "@/store/songs";
import { Kbd } from "../ui/primitives";

export function SongHeader({ song }: { song: Song }) {
  const notation = useSettings((s) => s.notation);
  const patch = useSongs((s) => s.patchSong);
  const view = songView(song, notation);
  const chordCount = song.sections.reduce((n, s) => n + s.lines.reduce((m, l) => m + l.chords.length, 0), 0);

  return (
    <header className="mb-10">
      <input
        value={song.title}
        onChange={(e) => patch(song.id, { title: e.target.value })}
        placeholder="Untitled song"
        aria-label="Song title"
        className="w-full bg-transparent text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ink outline-none placeholder:text-ink-4"
      />
      <input
        value={song.artist}
        onChange={(e) => patch(song.id, { artist: e.target.value })}
        placeholder="Add artist or notes"
        aria-label="Artist"
        className="mt-1 w-full bg-transparent text-[14.5px] text-ink-2 outline-none placeholder:text-ink-4"
      />
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-3">
        <Meta label="Key" value={keyLabel(view.currentKey, notation)} />
        {song.transpose !== 0 && <Meta label="Original" value={keyLabel(view.originalKey, notation)} />}
        {song.tempo ? <Meta label="Tempo" value={`${song.tempo} bpm`} /> : null}
        {song.timeSignature ? <Meta label="Time" value={song.timeSignature} /> : null}
        <Meta label="Chords" value={String(chordCount)} />
      </div>
      <FirstRunHint />
    </header>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label} <span className="font-medium text-ink-2">{value}</span>
    </span>
  );
}

const HINT_KEY = "chordsmith.hint.dismissed";

function FirstRunHint() {
  // Rendered client-side only (the workspace waits for hydration), so reading storage here is safe.
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(HINT_KEY) !== "1";
    } catch {
      return true;
    }
  });
  if (!show) return null;
  return (
    <div className="no-print mt-6 flex items-start gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 text-[13px] leading-relaxed text-ink-2 shadow-sm">
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent" />
      {/* Touch devices get touch wording; mouse/keyboard users get shortcuts. */}
      <div className="flex-1 [@media(pointer:coarse)]:hidden">
        <b className="font-semibold text-ink">Click just above any word</b> to place a chord. Type it, then press{" "}
        <Kbd>Space</Kbd> to jump to the next word. <b className="font-semibold text-ink">Drag</b> chords to move them —
        even to another line, or hold <Kbd>Alt</Kbd> to copy. Select a chord and use <Kbd>←</Kbd> <Kbd>→</Kbd> to nudge it. Press{" "}
        <Kbd>?</Kbd> for all shortcuts.
      </div>
      <div className="hidden flex-1 [@media(pointer:coarse)]:block">
        <b className="font-semibold text-ink">Tap just above any word</b> to add a chord.{" "}
        <b className="font-semibold text-ink">Drag</b> a chord to move it, or tap it to edit, copy or delete. Tap a lyric
        to change the text. Use the <b className="font-semibold text-ink">− Key +</b> controls to transpose.
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setShow(false);
          try {
            localStorage.setItem(HINT_KEY, "1");
          } catch {}
        }}
        className="rounded p-0.5 text-ink-3 hover:bg-subtle hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}
