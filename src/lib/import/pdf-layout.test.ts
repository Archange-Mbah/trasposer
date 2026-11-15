import { describe, expect, it } from "vitest";
import { parseSongText } from "../song/parse";
import { layoutPdfPages, type PdfTextRun } from "./pdf-layout";

/** Builds a run whose characters have uneven widths, like a proportional font. */
const run = (str: string, x: number, y: number, size = 12): PdfTextRun => {
  const width = [...str].reduce((w, ch) => w + (/[ilfrtj,. ]/.test(ch) ? 0.3 : /[mwMW]/.test(ch) ? 0.85 : 0.55) * size, 0);
  return { str, x, y, width, size };
};
/** x position of character `i` in a run made by `run()`. */
const xAt = (str: string, x: number, i: number, size = 12) =>
  x + [...str.slice(0, i)].reduce((w, ch) => w + (/[ilfrtj,. ]/.test(ch) ? 0.3 : /[mwMW]/.test(ch) ? 0.85 : 0.55) * size, 0);

describe("layoutPdfPages", () => {
  it("rebuilds lines, paragraphs and keeps chords over the right syllables", () => {
    const lyric1 = "Regier in mir, in deiner Kraft";
    const lyric2 = "Über jeden Traum";
    const L = 72;
    const pages = [
      [
        run("Verse 1", L, 700),
        // chord runs positioned above "Regier", "deiner", "Kraft"
        run("G", xAt(lyric1, L, 0), 684),
        run("D", xAt(lyric1, L, lyric1.indexOf("deiner")), 684),
        run("Em", xAt(lyric1, L, lyric1.indexOf("Kraft")), 684),
        run(lyric1, L, 670),
        run("C", xAt(lyric2, L, 0), 654),
        run("D", xAt(lyric2, L, lyric2.indexOf("Traum")), 654),
        run(lyric2, L, 640),
        // big gap → new section
        run("Chorus", L, 600),
        run("Halleluja,", L, 586),
        run("halleluja", L + 70, 586),
      ],
    ];
    const text = layoutPdfPages(pages);
    const song = parseSongText(text);
    expect(song.sections.map((s) => s.label)).toEqual(["Verse 1", "Chorus"]);
    const [l1, l2] = song.sections[0].lines;
    expect(l1.text).toBe(lyric1);
    expect(l1.chords.map((c) => [c.chord, l1.text.slice(c.index, c.index + 3)])).toEqual([
      ["G", "Reg"],
      ["D", "dei"],
      ["Em", "Kra"],
    ]);
    expect(l2.chords.map((c) => [c.chord, l2.text.slice(c.index, c.index + 3)])).toEqual([
      ["C", "Übe"],
      ["D", "Tra"],
    ]);
    expect(song.sections[1].lines[0].text).toBe("Halleluja, halleluja");
  });

  it("separates pages and drops empty ones", () => {
    const text = layoutPdfPages([[run("Line one", 72, 700)], [], [run("Line two", 72, 700)]]);
    expect(text).toBe("Line one\n\nLine two");
  });

  it("joins word-by-word runs with single spaces", () => {
    const words = ["Leise", "fällt", "der", "Morgen"];
    let x = 72;
    const runs = words.map((w) => {
      const r = run(w, x, 500);
      x += r.width + 3.2; // ~ one space at 12pt
      return r;
    });
    expect(layoutPdfPages([runs])).toBe("Leise fällt der Morgen");
  });
});

describe("layoutPdfPages with pdf.js whitespace items", () => {
  it("treats whitespace runs as word breaks (chords are not glued together)", () => {
    const lyric = "Regier in mir, in deiner Kraft";
    const L = 45;
    const dX = xAt(lyric, L, lyric.indexOf("deiner"));
    const text = layoutPdfPages([
      [
        run("G", L, 700, 10),
        { str: " ", x: L + 6, y: 700, width: dX - L - 6, size: 10 },
        run("D", dX, 700, 10),
        run(lyric, L, 686),
      ],
    ]);
    const line = parseSongText(text).sections[0].lines[0];
    expect(line.chords.map((c) => [c.chord, line.text.slice(c.index, c.index + 3)])).toEqual([
      ["G", "Reg"],
      ["D", "dei"],
    ]);
  });
});

describe("layoutPdfPages with touching chord labels", () => {
  it("keeps adjacent chord runs apart", () => {
    const lyric = "Am Abend singen wir dein Lied";
    const L = 45;
    const c1 = run("Cmaj7", xAt(lyric, L, lyric.indexOf("dein")), 700, 10);
    const text = layoutPdfPages([[run("Em", xAt(lyric, L, 3), 700, 10), c1, run("Dsus4", c1.x + c1.width, 700, 10), run(lyric, L, 686)]]);
    const line = parseSongText(text).sections[0].lines[0];
    expect(line.chords.map((c) => c.chord)).toEqual(["Em", "Cmaj7", "Dsus4"]);
  });
});
