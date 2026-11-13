import { describe, expect, it } from "vitest";
import { analyzeChordLine, parseInlineLine, parseSongText } from "./parse";
import { remapChords } from "./remap";
import { createSampleSongs } from "./samples";
import { lineToText, songToChordPro } from "./serialize";
import type { ChordMarker } from "./types";

const ch = (index: number, chord = "G"): ChordMarker => ({ id: String(index), chord, index });

describe("remapChords", () => {
  const text = "Regier in mir, in deiner Kraft";
  const chords = [ch(0), ch(18, "D"), ch(25, "Em")];

  it("shifts chords after an insertion", () => {
    const next = "Regiere in mir, in deiner Kraft";
    expect(remapChords(text, next, chords, 7).map((c) => c.index)).toEqual([0, 19, 26]);
  });

  it("keeps a chord on its word when typing right before it", () => {
    // insert "X" at index 18 (start of "deiner")
    const next = text.slice(0, 18) + "X" + text.slice(18);
    expect(remapChords(text, next, chords, 19).map((c) => c.index)).toEqual([0, 19, 26]);
  });

  it("shifts chords after a deletion", () => {
    const next = "Regier in mir in deiner Kraft"; // removed comma at 13
    expect(remapChords(text, next, chords, 13).map((c) => c.index)).toEqual([0, 17, 24]);
  });

  it("collapses chords inside a deleted word", () => {
    const next = "Regier in mir, in Kraft"; // removed "deiner "
    expect(remapChords(text, next, [ch(20)]).map((c) => c.index)).toEqual([18]);
  });

  it("uses the caret to disambiguate repeated letters", () => {
    // "aab" -> "aaab": insert at 0 vs 1 vs 2 is ambiguous without caret
    expect(remapChords("aab", "aaab", [ch(1)], 1)[0].index).toBe(2);
    expect(remapChords("aab", "aaab", [ch(1)], 3)[0].index).toBe(1);
  });
});

describe("parsing", () => {
  it("parses inline chords", () => {
    expect(parseInlineLine("[G]Regier in mir, in deiner [D]Kraft")).toEqual({
      text: "Regier in mir, in deiner Kraft",
      chords: [
        { chord: "G", index: 0 },
        { chord: "D", index: 25 },
      ],
    });
  });

  it("keeps non-chord brackets as text", () => {
    expect(parseInlineLine("[Chorus] [Am]hallo").text).toBe("[Chorus] hallo");
  });

  it("detects chord-over-lyric lines", () => {
    const res = parseSongText("G            D\nRegier in mir, in deiner Kraft");
    expect(res.sections[0].lines[0].text).toBe("Regier in mir, in deiner Kraft");
    expect(res.sections[0].lines[0].chords.map((c) => [c.chord, c.index])).toEqual([
      ["G", 0],
      ["D", 13],
    ]);
  });

  it("does not mistake lyrics for chords", () => {
    expect(analyzeChordLine("Am Abend singen wir").isChordLine).toBe(false);
    expect(analyzeChordLine("A day in the life").isChordLine).toBe(false);
    expect(analyzeChordLine("G  D/F#  Em  C").isChordLine).toBe(true);
    expect(analyzeChordLine("| G . . . | D . . . |").isChordLine).toBe(false);
  });

  it("flags ambiguous single-token lines", () => {
    expect(analyzeChordLine("A").confidence).toBeLessThan(0.75);
  });

  it("splits on headings and blank lines, labels repeated paragraphs as chorus", () => {
    const res = parseSongText("Line one\nLine two\n\nHook line\n\nLine three\n\nHook line");
    expect(res.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"]);
    const res2 = parseSongText("[Refrain]\n[G]Hallo\nStrophe 2:\nWelt");
    expect(res2.sections.map((s) => [s.type, s.label])).toEqual([
      ["chorus", "Refrain"],
      ["verse", "Strophe 2"],
    ]);
  });
});

describe("serialize", () => {
  it("renders chords above lyrics, never overlapping", () => {
    const rows = lineToText(
      { id: "l", text: "Hier, wo das Licht beginnt", chords: [ch(0, "G"), ch(12, "D"), ch(14, "Em")] },
      (c) => c,
    );
    expect(rows[0]).toBe("G           D Em");
  });

  it("round-trips through ChordPro", () => {
    const [song] = createSampleSongs();
    const pro = songToChordPro(song, "auto");
    const reparsed = parseSongText(pro.replace(/\{comment: (.+)\}/g, "$1").replace(/\{.*\}\n/g, ""));
    const original = song.sections.flatMap((s) => s.lines.map((l) => l.chords.map((c) => c.chord)));
    const again = reparsed.sections.flatMap((s) => s.lines.map((l) => l.chords.map((c) => c.chord)));
    expect(again).toEqual(original);
  });
});
