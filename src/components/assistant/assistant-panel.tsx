"use client";

import { ArrowUp, Info, Music2, PanelRightClose, RotateCcw, Sparkles, Square } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { chordTones, describeChord } from "@/lib/music/chord";
import {
  capoSuggestion,
  findPatterns,
  functionBlurb,
  relativeKey,
  simplerAlternatives,
} from "@/lib/music/insights";
import { chordFunction, detectKey, keyLabel, keyName } from "@/lib/music/key";
import { findLine, songChords } from "@/lib/song/ops";
import { wordAt } from "@/lib/song/remap";
import { songToAssistantContext, songView } from "@/lib/song/serialize";
import type { Song } from "@/lib/song/types";
import { useEditor } from "@/store/editor";
import { useSettings } from "@/store/settings";
import { Button, Tip, cn } from "../ui/primitives";

interface Msg {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

const NO_MESSAGES: Msg[] = [];

const useChat = create<{ bySong: Record<string, Msg[]>; set: (id: string, msgs: Msg[]) => void }>()((set) => ({
  bySong: {},
  set: (id, msgs) => set((s) => ({ bySong: { ...s.bySong, [id]: msgs } })),
}));

export function AssistantPanel({ song }: { song: Song }) {
  const notation = useSettings((s) => s.notation);
  const close = () => useSettings.getState().set({ assistantOpen: false });
  const messages = useChat((s) => s.bySong[song.id] ?? NO_MESSAGES);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selected = useEditor((s) => s.selected);

  const view = songView(song, notation);
  const selectedInfo = useMemo(() => {
    if (!selected) return null;
    const loc = findLine(song, selected.lineId);
    const chord = loc?.line.chords.find((c) => c.id === selected.chordId);
    if (!loc || !chord) return null;
    const w = wordAt(loc.line.text, chord.index);
    return {
      chord: view.display(chord.chord),
      word: w ? loc.line.text.slice(w[0], w[1]) : null,
      section: loc.section.label,
      lineNo: loc.lineIndex + 1,
    };
  }, [selected, song, view]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const store = useChat.getState();
    const history: Msg[] = [...(store.bySong[song.id] ?? []), { role: "user", content: q }];
    store.set(song.id, [...history, { role: "assistant", content: "" }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let context = `Current song, shown in ${keyLabel(view.currentKey, notation)}`;
    if (song.transpose !== 0)
      context += ` (transposed ${song.transpose > 0 ? "+" : ""}${song.transpose} semitones from the original ${keyLabel(view.originalKey, notation)})`;
    context += `. Chords are written on the line above the lyric they belong to, aligned to the syllable where they change:\n\n${songToAssistantContext(song, notation)}`;
    if (selectedInfo)
      context += `\nThe user has selected the chord ${selectedInfo.chord} in ${selectedInfo.section}, line ${selectedInfo.lineNo}${selectedInfo.word ? `, over the word “${selectedInfo.word}”` : ""}.`;

    let acc = "";
    const update = (content: string, error = false) =>
      useChat.getState().set(song.id, [...history, { role: "assistant", content, error }]);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.filter((m) => !m.error), context }),
        signal: ctrl.signal,
      });
      if (res.status === 503) {
        update(
          "The AI chat isn’t connected yet. Add `OPENROUTER_API_KEY` to `.env.local` and restart the dev server.\n\nEverything above — key detection, chord functions and explanations — works without it.",
          true,
        );
        return;
      }
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        update(acc);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") update(acc || "Couldn’t reach the assistant. Check your connection and try again.", !acc);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const suggestions = useMemo(() => {
    const list = [
      "What key is this song in, and why?",
      "How can I make the chorus sound more powerful?",
      "Suggest easier chords for a beginner guitarist.",
      "Can you suggest a more emotional progression for the bridge?",
    ];
    if (selectedInfo) list.unshift(`What else could I play instead of ${selectedInfo.chord}${selectedInfo.word ? ` on “${selectedInfo.word}”` : ""}?`);
    return list.slice(0, 4);
  }, [selectedInfo]);

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <Sparkles size={15} className="text-accent" />
        <span className="text-[13.5px] font-semibold">Assistant</span>
        <span className="text-[12px] text-ink-3">music theory helper</span>
        <div className="ml-auto flex items-center">
          {messages.length > 0 && (
            <Tip label="Clear conversation">
              <Button icon size="sm" aria-label="Clear conversation" onClick={() => useChat.getState().set(song.id, [])}>
                <RotateCcw size={14} />
              </Button>
            </Tip>
          )}
          <Button icon size="sm" aria-label="Close assistant" onClick={close}>
            <PanelRightClose size={16} />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {selectedInfo ? <ChordCard song={song} chord={selectedInfo.chord} word={selectedInfo.word} /> : <SongCard song={song} />}

        {messages.length === 0 ? (
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Ask about this song</div>
            <div className="flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] leading-snug text-ink-2 transition-colors hover:border-accent/40 hover:bg-accent-softer hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-8 rounded-xl rounded-br-sm bg-subtle px-3 py-2 text-[13.5px] leading-relaxed text-ink">
                  {m.content}
                </div>
              ) : (
                <div key={i} className={cn("text-[13.5px] leading-relaxed text-ink", m.error && "rounded-lg bg-warn-soft px-3 py-2")}>
                  {m.content ? <RichText text={m.content} /> : <TypingDots />}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <Composer busy={busy} onSend={send} onStop={() => abortRef.current?.abort()} />
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
          <Info size={11} className="mt-[2px] shrink-0" />
          The assistant sees your lyrics and chords but can’t hear your melody. Suggestions never change your song.
        </p>
      </div>
    </>
  );
}

function Composer({ busy, onSend, onStop }: { busy: boolean; onSend: (t: string) => void; onStop: () => void }) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [value]);
  const submit = () => {
    if (!value.trim()) return;
    onSend(value);
    setValue("");
  };
  return (
    <div className="flex items-end gap-2 rounded-xl border border-line bg-canvas px-3 py-2 focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask anything about chords, keys, progressions…"
        className="max-h-[140px] min-h-[22px] flex-1 resize-none bg-transparent text-[13.5px] leading-[1.45] text-ink outline-none placeholder:text-ink-3"
      />
      {busy ? (
        <button type="button" aria-label="Stop" onClick={onStop} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink text-canvas">
          <Square size={10} fill="currentColor" />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Send"
          disabled={!value.trim()}
          onClick={submit}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-opacity disabled:opacity-30 dark:text-[#0b1120]"
        >
          <ArrowUp size={15} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-pulse rounded-full bg-ink-4" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Local, instant insights (no network)
// ---------------------------------------------------------------------------

function Card({ title, icon, children }: { title: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-canvas/60 p-3.5">
      <h3 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Chip({ children, sub, muted }: { children: ReactNode; sub?: ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0.5 text-[12.5px] font-semibold",
        muted ? "border-line bg-surface text-ink-2" : "border-chord-line bg-chord-bg text-chord-fg",
      )}
    >
      {children}
      {sub && <span className="text-[10.5px] font-medium text-ink-3">{sub}</span>}
    </span>
  );
}

function SongCard({ song }: { song: Song }) {
  const notation = useSettings((s) => s.notation);
  const view = songView(song, notation);
  const displayed = songChords(song).map(view.display);
  const unique = [...new Set(displayed)];
  const detected = detectKey(displayed);
  const key = view.currentKey;
  const outside = unique.filter((c) => chordFunction(c, key)?.diatonic === false);
  const patterns = findPatterns(displayed, key).slice(0, 2);
  const capo = capoSuggestion(key);
  const agrees = detected && detected.key.tonicPc === key.tonicPc && detected.key.mode === key.mode;

  return (
    <Card title="This song" icon={<Music2 size={12} />}>
      {unique.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-ink-2">
          No chords yet. Click just above a word in the editor to add your first chord — I’ll analyse the harmony as you go.
        </p>
      ) : (
        <div className="space-y-3 text-[13px] leading-relaxed text-ink-2">
          <p>
            Key of <b className="font-semibold text-ink">{keyLabel(key, notation)}</b>
            {agrees ? (
              <> — the chords agree{detected.confidence > 0.6 ? " strongly" : ""}.</>
            ) : detected ? (
              <> — though the chords lean towards {keyLabel(detected.key, notation)}.</>
            ) : null}{" "}
            Its relative {key.mode === "major" ? "minor" : "major"} is {keyLabel(relativeKey(key), notation)}.
          </p>
          <div className="flex flex-wrap gap-1">
            {unique.map((c) => {
              const fn = chordFunction(c, key);
              return (
                <Chip key={c} sub={fn?.numeral} muted={fn?.diatonic === false}>
                  {c}
                </Chip>
              );
            })}
          </div>
          {outside.length === 0 ? (
            <p>Every chord comes from the key — that’s why it sounds cohesive.</p>
          ) : (
            <p>
              {outside.map((c, i) => (
                <Fragment key={c}>
                  {i > 0 && ", "}
                  <b className="font-semibold text-ink">{c}</b>
                </Fragment>
              ))}{" "}
              {outside.length === 1 ? "is" : "are"} from outside the key — a deliberate colour, or worth double-checking by ear.
            </p>
          )}
          {patterns.map((p) => (
            <p key={p.name}>
              Uses the <b className="font-semibold text-ink">{p.name}</b> progression. {p.note}
            </p>
          ))}
          {capo && (
            <p>
              Guitar: capo {capo.capo}, play <b className="font-semibold text-ink">{capo.shapeKey}</b> shapes.
            </p>
          )}
          <p className="text-[12px] text-ink-3">Select any chord to see what it does.</p>
        </div>
      )}
    </Card>
  );
}

function ChordCard({ song, chord, word }: { song: Song; chord: string; word: string | null }) {
  const notation = useSettings((s) => s.notation);
  const view = songView(song, notation);
  const fn = chordFunction(chord, view.currentKey);
  const tones = chordTones(chord, view.accidental) ?? [];
  const alternatives = simplerAlternatives(chord, view.accidental);
  return (
    <Card title="Selected chord">
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-semibold tracking-tight text-chord-fg">{chord}</span>
        <span className="text-[13px] text-ink-2">{describeChord(chord, view.accidental)}</span>
      </div>
      {word && <div className="mt-0.5 text-[12px] text-ink-3">over “{word}”</div>}
      <div className="mt-3 flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[12px] text-ink-3">Notes</span>
        {tones.map((t) => (
          <Chip key={t} muted>
            {t}
          </Chip>
        ))}
      </div>
      {fn && (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
          <b className="font-semibold text-ink">
            {fn.numeral} in {keyName(view.currentKey, notation)}.
          </b>{" "}
          {functionBlurb(fn.numeral, fn.diatonic, view.currentKey.mode)}
        </p>
      )}
      {alternatives.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-[12px] text-ink-3">Simpler option</div>
          {alternatives.map((a) => (
            <div key={a.chord + a.reason} className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-2">
              <Chip>{a.chord}</Chip>
              <span className="pt-0.5">{a.reason}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Minimal markdown: paragraphs, bullet/numbered lists, **bold**, `chord` chips.
// ---------------------------------------------------------------------------

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<b key={k++} className="font-semibold text-ink">{t.slice(2, -2)}</b>);
    else if (t.startsWith("`"))
      out.push(
        <code key={k++} className="mx-px rounded-[5px] border border-chord-line bg-chord-bg px-1 py-px font-sans text-[0.92em] font-semibold text-chord-fg">
          {t.slice(1, -1)}
        </code>,
      );
    else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function RichText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          const ordered = /^\s*\d+\./.test(lines[0]);
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={i} className={cn("space-y-1 pl-4", ordered ? "list-decimal" : "list-disc marker:text-ink-4")}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l.replace(/^#{1,4}\s+/, ""))}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
