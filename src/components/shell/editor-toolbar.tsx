"use client";

import {
  Check,
  ChevronDown,
  CloudOff,
  Copy,
  Download,
  FileText,
  Loader2,
  Menu,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  Star,
  Type,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { capoSuggestion } from "@/lib/music/insights";
import { keyLabel, keyName, normalizeOffset, semitoneDistance } from "@/lib/music/key";
import { songToChordPro, songToPlainText, songView } from "@/lib/song/serialize";
import type { Song } from "@/lib/song/types";
import { useEditor } from "@/store/editor";
import { FONT_SIZES, useSettings } from "@/store/settings";
import { transposeActions, useSongs } from "@/store/songs";
import { Button, MenuItem, MenuLabel, MenuSeparator, Popover, Segmented, Tip, cn, modKey } from "../ui/primitives";

export function EditorToolbar({ song, onOpenSidebar }: { song: Song; onOpenSidebar?: () => void }) {
  const { undo, redo, patchSong } = useSongs.getState();
  const canUndo = useSongs((s) => s.past.length > 0);
  const canRedo = useSongs((s) => s.future.length > 0);
  const assistantOpen = useSettings((s) => s.assistantOpen);
  const setSettings = useSettings((s) => s.set);
  const mod = modKey();

  return (
    <div className="no-print relative z-20 flex h-12 shrink-0 items-center gap-1 border-b border-line bg-canvas/85 px-2 backdrop-blur sm:px-3">
      {onOpenSidebar && (
        <Button icon variant="ghost" aria-label="Open library" onClick={onOpenSidebar}>
          <Menu size={17} />
        </Button>
      )}
      <div className="flex min-w-0 items-center gap-1 pl-1">
        <span className="truncate text-[13.5px] font-medium text-ink">{song.title || "Untitled song"}</span>
        <Tip label={song.favorite ? "Remove from favorites" : "Add to favorites"}>
          <Button
            icon
            size="sm"
            aria-label="Toggle favorite"
            onClick={() => patchSong(song.id, { favorite: !song.favorite })}
            className={cn(song.favorite && "text-amber-500 hover:text-amber-500")}
          >
            <Star size={14} fill={song.favorite ? "currentColor" : "none"} />
          </Button>
        </Tip>
      </div>

      <div className="mx-auto flex items-center gap-1 pl-2">
        <TransposeControl song={song} />
        <div className="mx-1.5 hidden h-5 w-px bg-line sm:block" />
        <Tip label="Undo" shortcut={`${mod}Z`}>
          <Button icon aria-label="Undo" disabled={!canUndo} onClick={undo}>
            <Undo2 size={16} />
          </Button>
        </Tip>
        <Tip label="Redo" shortcut={`${mod}⇧Z`}>
          <Button icon aria-label="Redo" disabled={!canRedo} onClick={redo}>
            <Redo2 size={16} />
          </Button>
        </Tip>
      </div>

      <div className="flex items-center gap-1">
        <SaveStatus />
        <DisplayMenu />
        <ExportMenu song={song} />
        <Tip label={assistantOpen ? "Hide assistant" : "Show assistant"} shortcut={`${mod}/`}>
          <Button
            icon
            aria-label="Toggle assistant"
            onClick={() => setSettings({ assistantOpen: !assistantOpen })}
            className={cn(assistantOpen && "text-ink")}
          >
            {assistantOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
          </Button>
        </Tip>
      </div>
    </div>
  );
}

function TransposeControl({ song }: { song: Song }) {
  const notation = useSettings((s) => s.notation);
  const setSettings = useSettings((s) => s.set);
  const view = songView(song, notation);
  const offset = song.transpose;
  const capo = capoSuggestion(view.currentKey);

  return (
    <div className="flex items-center">
      <div className="flex h-8 items-center rounded-lg border border-line bg-surface shadow-sm">
        <Tip label="Transpose down" shortcut="[">
          <button
            type="button"
            aria-label="Transpose down a semitone"
            onClick={() => transposeActions.by(-1)}
            className="flex h-full w-8 items-center justify-center rounded-l-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
          >
            <Minus size={14} />
          </button>
        </Tip>
        <Popover
          align="end"
          className="w-[300px] p-3 max-sm:-right-16"
          trigger={({ toggle, open }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label="Choose key"
              className={cn(
                "flex h-full min-w-[92px] items-center justify-center gap-1.5 border-x border-line px-2.5 text-[13px] transition-colors hover:bg-subtle",
                open && "bg-subtle",
              )}
            >
              <span className="text-ink-3">Key</span>
              <span className="font-semibold text-ink">{view.currentKeyName}</span>
              {offset !== 0 && (
                <span className="rounded bg-accent-soft px-1 text-[11px] font-semibold tabular-nums text-accent-ink">
                  {offset > 0 ? `+${offset}` : offset}
                </span>
              )}
              <ChevronDown size={13} className="text-ink-3" />
            </button>
          )}
        >
          {(close) => <KeyPicker song={song} close={close} notation={notation} onNotation={(n) => setSettings({ notation: n })} />}
        </Popover>
        <Tip label="Transpose up" shortcut="]">
          <button
            type="button"
            aria-label="Transpose up a semitone"
            onClick={() => transposeActions.by(1)}
            className="flex h-full w-8 items-center justify-center rounded-r-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
          >
            <Plus size={14} />
          </button>
        </Tip>
      </div>
      {offset !== 0 && (
        <Tip label={`Reset to original key (${keyName(view.originalKey, notation)})`}>
          <Button icon size="sm" className="ml-0.5" aria-label="Reset to original key" onClick={transposeActions.reset}>
            <RotateCcw size={14} />
          </Button>
        </Tip>
      )}
      {capo && (
        <span className="ml-1.5 hidden whitespace-nowrap text-[12px] text-ink-3 2xl:inline" title="Guitar tip">
          Capo {capo.capo} · {capo.shapeKey} shapes
        </span>
      )}
    </div>
  );
}

function KeyPicker({
  song,
  close,
  notation,
  onNotation,
}: {
  song: Song;
  close: () => void;
  notation: ReturnType<typeof useSettings.getState>["notation"];
  onNotation: (n: "auto" | "sharps" | "flats") => void;
}) {
  const view = songView(song, notation);
  const original = view.originalKey;
  const capo = capoSuggestion(view.currentKey);
  const keys = Array.from({ length: 12 }, (_, i) => {
    const pc = (original.tonicPc + i) % 12;
    const offset = semitoneDistance(original.tonicPc, pc);
    return { key: { tonicPc: pc, mode: original.mode }, offset };
  }).sort((a, b) => a.key.tonicPc - b.key.tonicPc);

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-ink-2">Transpose to</span>
        <span className="text-[11.5px] text-ink-3">Original: {keyLabel(original, notation)}</span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {keys.map(({ key, offset }) => {
          const active = normalizeOffset(song.transpose) === offset;
          const isOriginal = offset === 0;
          return (
            <button
              key={key.tonicPc}
              type="button"
              onClick={() => {
                transposeActions.to(offset);
                close();
              }}
              className={cn(
                "relative flex h-11 flex-col items-center justify-center rounded-md border text-[13.5px] font-semibold transition-colors",
                active
                  ? "border-accent bg-accent text-white dark:text-[#0b1120]"
                  : "border-line bg-surface text-ink hover:border-accent/50 hover:bg-accent-softer",
              )}
            >
              {keyName(key, notation)}
              <span className={cn("text-[10.5px] font-medium tabular-nums", active ? "text-white/75 dark:text-black/60" : "text-ink-3")}>
                {isOriginal ? "original" : offset > 0 ? `+${offset}` : offset}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[12px] text-ink-2">Accidentals</span>
        <div className="w-[160px]">
          <Segmented
            value={notation}
            onChange={onNotation}
            options={[
              { value: "auto", label: "Auto", title: "Follow the key signature" },
              { value: "sharps", label: "♯", title: "Always sharps" },
              { value: "flats", label: "♭", title: "Always flats" },
            ]}
          />
        </div>
      </div>
      {capo && (
        <p className="mt-3 rounded-md bg-subtle px-2.5 py-2 text-[12px] leading-relaxed text-ink-2">
          <b className="font-semibold text-ink">Guitar tip:</b> put a capo on fret {capo.capo} and play {capo.shapeKey} shapes
          to sound in {keyName(view.currentKey, notation)}.
        </p>
      )}
      <MenuSeparator />
      <MenuItem
        icon={<RotateCcw />}
        disabled={song.transpose === 0}
        onClick={() => {
          transposeActions.reset();
          close();
        }}
      >
        Reset to original key
      </MenuItem>
      <MenuItem
        onClick={() => {
          transposeActions.redetectKey();
          close();
        }}
      >
        Re-detect original key from chords
      </MenuItem>
    </div>
  );
}

function SaveStatus() {
  const state = useSongs((s) => s.saveState);
  return (
    <span className="mr-1 hidden items-center gap-1 text-[12px] text-ink-3 md:flex" aria-live="polite">
      {state === "saving" && (
        <>
          <Loader2 size={12} className="animate-spin" /> Saving
        </>
      )}
      {state === "saved" && (
        <>
          <Check size={13} className="text-ok" /> Saved
        </>
      )}
      {state === "error" && (
        <>
          <CloudOff size={13} className="text-danger" /> Not saved
        </>
      )}
    </span>
  );
}

function DisplayMenu() {
  const s = useSettings();
  return (
    <Popover
      align="end"
      className="w-[260px] p-3"
      trigger={({ toggle, open }) => (
        <Tip label="Display">
          <Button icon aria-label="Display options" onClick={toggle} className={cn(open && "bg-muted text-ink")}>
            <Type size={16} />
          </Button>
        </Tip>
      )}
    >
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[12px] text-ink-2">
            <span>Text size</span>
            <span className="tabular-nums text-ink-3">{s.fontSize}px</span>
          </div>
          <div className="flex items-center gap-2">
            <Button icon size="sm" variant="outline" aria-label="Smaller" onClick={() => s.set({ fontSize: Math.max(FONT_SIZES.min, s.fontSize - 1) })}>
              <Minus size={13} />
            </Button>
            <input
              type="range"
              min={FONT_SIZES.min}
              max={FONT_SIZES.max}
              value={s.fontSize}
              onChange={(e) => s.set({ fontSize: Number(e.target.value) })}
              className="h-1 flex-1 accent-[var(--accent)]"
              aria-label="Text size"
            />
            <Button icon size="sm" variant="outline" aria-label="Larger" onClick={() => s.set({ fontSize: Math.min(FONT_SIZES.max, s.fontSize + 1) })}>
              <Plus size={13} />
            </Button>
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[12px] text-ink-2">Line spacing</div>
          <Segmented
            value={s.lineSpacing}
            onChange={(v) => s.set({ lineSpacing: v })}
            options={[
              { value: "compact", label: "Compact" },
              { value: "comfortable", label: "Normal" },
              { value: "relaxed", label: "Relaxed" },
            ]}
          />
        </div>
        <div>
          <div className="mb-1.5 text-[12px] text-ink-2">Lyric font</div>
          <Segmented
            value={s.lyricFont}
            onChange={(v) => s.set({ lyricFont: v })}
            options={[
              { value: "serif", label: <span className="font-serif text-[14px]">Serif</span> },
              { value: "sans", label: "Sans" },
            ]}
          />
        </div>
        <label className="flex cursor-pointer items-center justify-between text-[12px] text-ink-2">
          <span>
            Show chord functions <span className="text-ink-3">(I, IV, vi…)</span>
          </span>
          <input
            type="checkbox"
            checked={s.showNumerals}
            onChange={(e) => s.set({ showNumerals: e.target.checked })}
            className="size-4 accent-[var(--accent)]"
          />
        </label>
      </div>
    </Popover>
  );
}

function download(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ExportMenu({ song }: { song: Song }) {
  const notation = useSettings((s) => s.notation);
  const [copied, setCopied] = useState(false);
  const slug = (song.title || "song").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase();
  return (
    <Popover
      align="end"
      className="w-60"
      trigger={({ toggle, open }) => (
        <Button variant="outline" onClick={toggle} className={cn("ml-0.5", open && "border-line-strong text-ink")}>
          <Download size={14} />
          <span className="hidden sm:inline">Export</span>
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>In current key · {songView(song, notation).currentKeyName}</MenuLabel>
          <MenuItem
            icon={<Printer />}
            shortcut={`${modKey()}P`}
            onClick={() => {
              close();
              useEditor.getState().clear();
              setTimeout(() => window.print(), 50);
            }}
          >
            Print / Save as PDF
          </MenuItem>
          <MenuItem
            icon={copied ? <Check /> : <Copy />}
            onClick={async () => {
              await navigator.clipboard.writeText(songToPlainText(song, notation));
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
                close();
              }, 700);
            }}
          >
            {copied ? "Copied" : "Copy as text"}
          </MenuItem>
          <MenuItem
            icon={<FileText />}
            onClick={() => {
              download(`${slug}.txt`, songToPlainText(song, notation));
              close();
            }}
          >
            Download .txt (chords over lyrics)
          </MenuItem>
          <MenuItem
            icon={<FileText />}
            onClick={() => {
              download(`${slug}.cho`, songToChordPro(song, notation));
              close();
            }}
          >
            Download ChordPro
          </MenuItem>
        </>
      )}
    </Popover>
  );
}
