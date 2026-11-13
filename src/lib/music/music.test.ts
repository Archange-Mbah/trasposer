import { describe, expect, it } from "vitest";
import { chordTones, describeChord, isChord, normalizeChordInput, parseChord, transposeChord } from "./chord";
import { chordFunction, detectKey, keyName, parseKey, resolveAccidental, transposeKey } from "./key";

describe("parseChord", () => {
  it.each([
    "G", "Em", "F#m", "Bb", "C7", "Cmaj7", "CM7", "Am7", "Dsus4", "Dsus2", "Dsus", "Asus4/E",
    "Bdim", "B°", "Bdim7", "F#m7b5", "Bø7", "Caug", "C+", "G7#5", "Cadd9", "C6/9", "C13",
    "G7b9", "Cmaj9#11", "D/F#", "G/B", "Em7/D", "C/E", "Ebmaj7", "Abm", "A7(b9)", "Hm", "C♯m", "B♭",
  ])("accepts %s", (c) => {
    expect(isChord(c)).toBe(true);
  });

  it.each(["Do", "Be", "Email", "Add", "Gold", "a", "Am I", "C/", "Bed", "Hallo", "", "Dream"])(
    "rejects %s",
    (c) => {
      expect(isChord(c)).toBe(false);
    },
  );

  it("splits root, suffix and slash bass", () => {
    expect(parseChord("F#m7b5/C")).toEqual({
      rootPc: 6,
      rootAccidental: "sharp",
      suffix: "m7b5",
      bassPc: 0,
      bassAccidental: null,
    });
    expect(parseChord("C6/9")?.suffix).toBe("6/9");
    expect(parseChord("C6/9")?.bassPc).toBeNull();
  });
});

describe("transposeChord", () => {
  it("transposes the README example by +2", () => {
    expect(["G", "D", "Em", "C"].map((c) => transposeChord(c, 2, "sharp"))).toEqual(["A", "E", "F#m", "D"]);
  });

  it("preserves suffixes verbatim", () => {
    expect(transposeChord("Cmaj9#11", 3, "flat")).toBe("Ebmaj9#11");
    expect(transposeChord("Dsus4", -2, "sharp")).toBe("Csus4");
    expect(transposeChord("F#m7b5", 1, "sharp")).toBe("Gm7b5");
    expect(transposeChord("C6/9", 5, "flat")).toBe("F6/9");
    expect(transposeChord("A7(b9)", 1, "flat")).toBe("Bb7(b9)");
  });

  it("transposes slash chords (inversions) including the bass", () => {
    expect(transposeChord("D/F#", 2, "sharp")).toBe("E/G#");
    expect(transposeChord("D/F#", 1, "flat")).toBe("Eb/G");
    expect(transposeChord("G/B", -5, "sharp")).toBe("D/F#");
  });

  it("respects sharp/flat preference", () => {
    expect(transposeChord("C", 1, "sharp")).toBe("C#");
    expect(transposeChord("C", 1, "flat")).toBe("Db");
    expect(transposeChord("Bb", 2, "sharp")).toBe("C");
  });

  it("is reversible", () => {
    for (const c of ["G", "F#m7", "Bbmaj7/D", "Asus4", "Edim7"]) {
      for (let n = -11; n <= 11; n++) {
        const there = transposeChord(c, n, "sharp");
        expect(transposeChord(there, -n, "sharp")).toBe(normalizeChordInput(c, "sharp"));
      }
    }
  });

  it("transposes a full octave to the same pitch", () => {
    expect(transposeChord("Ebm7", 12, "flat")).toBe("Ebm7");
  });

  it("leaves non-chords untouched", () => {
    expect(transposeChord("N.C.", 3, "sharp")).toBe("N.C.");
  });

  it("reads German H as B", () => {
    expect(transposeChord("Hm", 1, "sharp")).toBe("Cm");
  });
});

describe("chord anatomy", () => {
  it("spells chord tones", () => {
    expect(chordTones("G", "sharp")).toEqual(["G", "B", "D"]);
    expect(chordTones("Em", "sharp")).toEqual(["E", "G", "B"]);
    expect(chordTones("Dsus4", "sharp")).toEqual(["D", "G", "A"]);
    expect(chordTones("C7", "flat")).toEqual(["C", "E", "G", "Bb"]);
    expect(chordTones("Cmaj7", "sharp")).toEqual(["C", "E", "G", "B"]);
    expect(chordTones("Bdim", "sharp")).toEqual(["B", "D", "F"]);
    expect(chordTones("Bm7b5", "sharp")).toEqual(["B", "D", "F", "A"]);
    expect(chordTones("Caug", "sharp")).toEqual(["C", "E", "G#"]);
    expect(chordTones("Cadd9", "sharp")).toEqual(["C", "D", "E", "G"]);
    expect(chordTones("D/F#", "sharp")).toEqual(["D", "F#", "A"]);
    expect(chordTones("C/G", "sharp")).toEqual(["C", "E", "G"]);
    expect(chordTones("Am7/G", "sharp")).toEqual(["A", "C", "E", "G"]);
  });

  it("describes chords in words", () => {
    expect(describeChord("Em", "sharp")).toBe("E minor");
    expect(describeChord("D7", "sharp")).toBe("D dominant seventh");
    expect(describeChord("Am7", "sharp")).toBe("A minor seventh");
    expect(describeChord("Cmaj7", "sharp")).toBe("C major seventh");
    expect(describeChord("D/F#", "sharp")).toBe("D major over F#");
    expect(describeChord("Asus4", "sharp")).toBe("A sus4");
  });
});

describe("keys", () => {
  it("detects common keys", () => {
    expect(keyName(detectKey(["G", "D", "Em", "C", "G", "D", "C", "G"])!.key)).toBe("G");
    expect(keyName(detectKey(["Am", "F", "C", "G", "Am"])!.key)).toBe("Am");
    expect(keyName(detectKey(["D", "A/C#", "Bm", "G", "D", "A", "D"])!.key)).toBe("D");
    expect(keyName(detectKey(["Bbmaj7", "Gm7", "Cm7", "F7", "Bbmaj7"])!.key)).toBe("Bb");
    expect(keyName(detectKey(["Em", "C", "G", "D", "Em", "B7", "Em"])!.key)).toBe("Em");
  });

  it("chooses spelling by key", () => {
    expect(resolveAccidental(parseKey("F"), "auto")).toBe("flat");
    expect(resolveAccidental(parseKey("A"), "auto")).toBe("sharp");
    expect(resolveAccidental(parseKey("Dm"), "auto")).toBe("flat");
    expect(resolveAccidental(parseKey("F"), "sharps")).toBe("sharp");
  });

  it("transposes keys", () => {
    expect(keyName(transposeKey(parseKey("G")!, 2))).toBe("A");
    expect(keyName(transposeKey(parseKey("G")!, -1))).toBe("F#");
    expect(keyName(transposeKey(parseKey("Em")!, 1))).toBe("Fm");
  });

  it("analyses chord function", () => {
    const G = parseKey("G")!;
    expect(chordFunction("Em", G)).toMatchObject({ numeral: "vi", diatonic: true });
    expect(chordFunction("D7", G)).toMatchObject({ numeral: "V7", diatonic: true });
    expect(chordFunction("Gm", G)).toMatchObject({ numeral: "i", diatonic: false });
    expect(chordFunction("F", G)).toMatchObject({ numeral: "♭VII", diatonic: false });
    expect(chordFunction("B7", parseKey("Em")!)).toMatchObject({ numeral: "V7", diatonic: true });
  });
});
