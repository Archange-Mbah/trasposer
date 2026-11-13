"use client";

import { AlertTriangle, ClipboardPaste, FileText, FileType2, Monitor, Moon, Sun, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { detectKey, keyLabel } from "@/lib/music/key";
import { parseSongText } from "@/lib/song/parse";
import { lineToText } from "@/lib/song/serialize";
import { useSettings } from "@/store/settings";
import { useSongs } from "@/store/songs";
import { Button, Kbd, Segmented, cn, isMac } from "../ui/primitives";

type DialogId = "shortcuts" | "settings" | "import";

export const useDialogs = create<{ current: DialogId | null; open: (d: DialogId) => void; close: () => void }>()(
  (set) => ({
    current: null,
    open: (current) => set({ current }),
    close: () => set({ current: null }),
  }),
);

export function Dialogs() {
  const current = useDialogs((s) => s.current);
  if (current === "shortcuts") return <ShortcutsDialog />;
  if (current === "settings") return <SettingsDialog />;
  if (current === "import") return <ImportDialog />;
  return null;
}

function Modal({
  title,
  description,
  children,
  footer,
  width = 520,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const close = useDialogs((s) => s.close);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="no-print fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/25 p-4 pt-[8vh] animate-fade" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="flex max-h-[84vh] w-full animate-pop flex-col rounded-xl border border-line bg-surface shadow-lg"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-ink-2">{description}</p>}
          </div>
          <Button icon size="sm" aria-label="Close" onClick={close}>
            <X size={15} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ShortcutsDialog() {
  const m = isMac() ? "⌘" : "Ctrl";
  const groups: [string, [string[], string][]][] = [
    [
      "Chords",
      [
        [["Click above a word"], "Add a chord"],
        [["Space"], "Save chord & jump to next word"],
        [["Enter"], "Save chord"],
        [["Drag"], "Move chord (also to another line)"],
        [["Alt", "Drag"], "Copy chord"],
        [["←", "→"], "Nudge selected chord"],
        [["⇧", "← →"], "Jump selected chord by word"],
        [["↑", "↓"], "Select chord on line above / below"],
        [["Tab"], "Select next chord"],
        [["Enter"], "Edit selected chord"],
        [[m, "D"], "Duplicate selected chord"],
        [["Del"], "Delete selected chord"],
      ],
    ],
    [
      "Lyrics",
      [
        [["Click a lyric"], "Edit text"],
        [["Enter"], "Split line"],
        [["⌫"], "Merge with line above (at start)"],
        [["↑", "↓"], "Move between lines"],
      ],
    ],
    [
      "Song",
      [
        [["]"], "Transpose up"],
        [["["], "Transpose down"],
        [[m, "Z"], "Undo"],
        [[m, "⇧", "Z"], "Redo"],
        [[m, "/"], "Toggle assistant"],
        [[m, "P"], "Print / PDF"],
        [[m, "Alt", "N"], "New song"],
      ],
    ],
  ];
  return (
    <Modal title="Keyboard shortcuts" width={620}>
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {groups.map(([name, items]) => (
          <div key={name} className={cn(name === "Chords" && "sm:row-span-2")}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{name}</h3>
            <ul className="space-y-1.5">
              {items.map(([keys, label], i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
                  <span>{label}</span>
                  <span className="flex shrink-0 gap-1">
                    {keys.map((k) => (k.length > 3 && !k.includes("←") ? <span key={k} className="text-[12px] text-ink-3">{k}</span> : <Kbd key={k}>{k}</Kbd>))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function SettingsDialog() {
  const s = useSettings();
  const row = "flex items-center justify-between gap-6 py-3";
  return (
    <Modal title="Settings" description="Preferences are saved on this device.">
      <div className="divide-y divide-line">
        <div className={row}>
          <div>
            <div className="text-[13.5px] font-medium">Appearance</div>
            <div className="text-[12.5px] text-ink-3">Light, dark, or follow your system.</div>
          </div>
          <div className="w-[210px]">
            <Segmented
              value={s.theme}
              onChange={(theme) => s.set({ theme })}
              options={[
                { value: "light", label: <Sun size={14} />, title: "Light" },
                { value: "dark", label: <Moon size={14} />, title: "Dark" },
                { value: "system", label: <Monitor size={14} />, title: "System" },
              ]}
            />
          </div>
        </div>
        <div className={row}>
          <div>
            <div className="text-[13.5px] font-medium">Chord spelling</div>
            <div className="text-[12.5px] text-ink-3">Auto follows the key: F → B♭, A → F♯.</div>
          </div>
          <div className="w-[210px]">
            <Segmented
              value={s.notation}
              onChange={(notation) => s.set({ notation })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "sharps", label: "Sharps ♯" },
                { value: "flats", label: "Flats ♭" },
              ]}
            />
          </div>
        </div>
        <div className={row}>
          <div>
            <div className="text-[13.5px] font-medium">Lyric font</div>
            <div className="text-[12.5px] text-ink-3">Serif reads like a book; sans like a lead sheet.</div>
          </div>
          <div className="w-[210px]">
            <Segmented
              value={s.lyricFont}
              onChange={(lyricFont) => s.set({ lyricFont })}
              options={[
                { value: "serif", label: <span className="font-serif text-[14px]">Serif</span> },
                { value: "sans", label: "Sans" },
              ]}
            />
          </div>
        </div>
        <div className={row}>
          <div>
            <div className="text-[13.5px] font-medium">Line spacing</div>
          </div>
          <div className="w-[210px]">
            <Segmented
              value={s.lineSpacing}
              onChange={(lineSpacing) => s.set({ lineSpacing })}
              options={[
                { value: "compact", label: "Compact" },
                { value: "comfortable", label: "Normal" },
                { value: "relaxed", label: "Relaxed" },
              ]}
            />
          </div>
        </div>
        <label className={cn(row, "cursor-pointer")}>
          <div>
            <div className="text-[13.5px] font-medium">Show chord functions</div>
            <div className="text-[12.5px] text-ink-3">Roman numerals (I, IV, vi…) next to every chord.</div>
          </div>
          <input
            type="checkbox"
            checked={s.showNumerals}
            onChange={(e) => s.set({ showNumerals: e.target.checked })}
            className="size-4 accent-[var(--accent)]"
          />
        </label>
        <div className={row}>
          <div>
            <div className="text-[13.5px] font-medium">Account & sync</div>
            <div className="text-[12.5px] text-ink-3">Songs are stored in this browser. Cloud sync arrives with accounts.</div>
          </div>
          <span className="rounded-full bg-subtle px-2 py-0.5 text-[11.5px] font-medium text-ink-3">Coming soon</span>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

const PLACEHOLDER = `Paste your lyrics here — with or without chords.

Verse 1
G               D
Regier in mir, in deiner Kraft
Em          C
Über jeden Traum

or inline:  [G]Regier in mir, in deiner [D]Kraft`;

function ImportDialog() {
  const [tab, setTab] = useState<"paste" | "pdf" | "docx">("paste");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [forceLyric, setForceLyric] = useState<Set<number>>(new Set());
  const textRef = useRef<HTMLTextAreaElement>(null);
  const close = useDialogs((s) => s.close);

  useEffect(() => textRef.current?.focus(), []);

  const result = useMemo(() => parseSongText(text, { forceLyric }), [text, forceLyric]);
  const key = useMemo(
    () => detectKey(result.sections.flatMap((s) => s.lines.flatMap((l) => l.chords.map((c) => c.chord)))),
    [result],
  );
  const lineCount = result.sections.reduce((n, s) => n + s.lines.length, 0);
  // Ambiguous lines flagged by the parser, plus ones the user already switched to lyrics (so they can switch back).
  const review = useMemo(() => {
    const raw = text.replace(/\r\n?/g, "\n").split("\n");
    const forced = [...forceLyric].map((i) => ({ rawLine: i, text: raw[i]?.trim() ?? "" }));
    return [...result.uncertain.map((u) => ({ rawLine: u.rawLine, text: u.text })), ...forced].sort(
      (a, b) => a.rawLine - b.rawLine,
    );
  }, [result, forceLyric, text]);

  const doImport = () => {
    const firstLyric = result.sections.flatMap((s) => s.lines).find((l) => l.text.trim())?.text.trim();
    useSongs.getState().createSong({
      title: title.trim() || firstLyric?.slice(0, 48) || "Imported song",
      sections: result.sections,
      originalKey: key ? undefined : "C",
    });
    close();
  };

  return (
    <Modal
      title="Import lyrics"
      description="Chords written above lines or in [brackets] are separated from the lyrics automatically."
      width={980}
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-ink-3">
            {lineCount > 0
              ? `${result.sections.length} sections · ${lineCount} lines · ${result.chordCount} chords${key ? ` · ${keyLabel(key.key)}` : ""}`
              : "Nothing to import yet"}
          </span>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={lineCount === 0} onClick={doImport}>
            Open in editor
          </Button>
        </>
      }
    >
      <div className="mb-4 w-[330px] max-w-full">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "paste", label: <><ClipboardPaste size={13} /> Paste</> },
            { value: "pdf", label: <><FileText size={13} /> PDF</> },
            { value: "docx", label: <><FileType2 size={13} /> Word</> },
          ]}
        />
      </div>
      {tab !== "paste" ? (
        <div className="flex h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-subtle/50 text-center">
          <p className="text-[14px] font-medium">{tab === "pdf" ? "PDF" : "Word (.docx)"} upload is coming next</p>
          <p className="mt-1 max-w-sm text-[13px] text-ink-2">
            For now, open the file, copy its text and paste it here. Line breaks are preserved, and chords are recognised.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => setTab("paste")}>
            Paste text instead
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Song title (optional)"
              className="h-9 rounded-md border border-line bg-surface px-3 text-[13.5px] outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
            />
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setForceLyric(new Set());
              }}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              className="h-[380px] resize-none rounded-md border border-line bg-surface p-3 font-mono text-[12.5px] leading-[1.6] outline-none placeholder:text-ink-4 focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
            />
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            {review.length > 0 && (
              <div className="rounded-md border border-warn/30 bg-warn-soft p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-warn">
                  <AlertTriangle size={13} /> Please check {review.length === 1 ? "this line" : "these lines"}
                </div>
                <ul className="space-y-1">
                  {review.map((u) => {
                    const isLyric = forceLyric.has(u.rawLine);
                    return (
                      <li key={u.rawLine} className="flex items-center justify-between gap-2 text-[12.5px]">
                        <code className="truncate font-mono text-ink">“{u.text}”</code>
                        <div className="w-[150px] shrink-0">
                          <Segmented
                            value={isLyric ? "lyric" : "chords"}
                            onChange={(v) =>
                              setForceLyric((prev) => {
                                const next = new Set(prev);
                                if (v === "lyric") next.add(u.rawLine);
                                else next.delete(u.rawLine);
                                return next;
                              })
                            }
                            options={[
                              { value: "chords", label: "Chords" },
                              { value: "lyric", label: "Lyric" },
                            ]}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <div className="min-h-[200px] flex-1 overflow-auto rounded-md border border-line bg-canvas p-3">
              {lineCount === 0 ? (
                <p className="pt-16 text-center text-[13px] text-ink-3">The structured preview appears here.</p>
              ) : (
                <div className="space-y-4">
                  {result.sections.map((s) => (
                    <div key={s.id}>
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{s.label}</div>
                      <pre className="whitespace-pre font-mono text-[12.5px] leading-[1.55]">
                        {s.lines.map((l) => (
                          <span key={l.id}>
                            {lineToText(l, (c) => c).map((row, i, rows) => (
                              <span key={i} className={cn("block", rows.length > 1 && i === 0 || (l.text.trim() === "" && l.chords.length) ? "font-semibold text-chord-fg" : "text-ink")}>
                                {row || " "}
                              </span>
                            ))}
                          </span>
                        ))}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
