import { parseSongText } from "./parse";
import type { Song } from "./types";
import { uid } from "./types";

/** Sample songs (original lyrics) written in inline chord notation and parsed like an import. */
const SAMPLES: { title: string; artist: string; key: string; tempo: number; time: string; source: string; favorite?: boolean }[] = [
  {
    title: "Wo das Licht beginnt",
    artist: "Lobpreis-Team · Entwurf",
    key: "G",
    tempo: 72,
    time: "4/4",
    favorite: true,
    source: `Intro
[G]      [D/F#]      [Em]      [C]

Strophe 1
[G]Leise fällt der [D/F#]Morgen in mein [Em]Herz
[C]alles, was ich [G]trage, wird ganz [D]leicht
[G]Du rufst meinen [D/F#]Namen durch den [Em]Lärm
[C]und dein Frieden [Dsus4]bleibt, wo [D]ich nicht bleib

Pre-Chorus
[Am7]Ich lass los, [C]ich lass los
[Em]alles, was mich [D]hält

Refrain
[G]Hier, wo das [D]Licht be[Em]ginnt
[C]bin ich zu [G]Haus, [D]bin ich ein [Em]Kind
[C]Über jedem [G]Traum, [D/F#]über jedem [Em]Ziel
[C]stehst du, und das [D]ist mir [G]viel

Strophe 2
[G]Wenn die Nacht zu [D/F#]lange auf mir [Em]liegt
[C]trägst du mich durch [G]Wasser und durch [D]Wind
[G]Deine Gnade [D/F#]schreibt ein neues [Em]Lied
[C]in das Herz von [Dsus4]einem müden [D]Kind

Bridge
[Em]Du bist [C]treu, du bist [G]treu
[D]jeden Morgen [Em]neu
[C]Was auch [G]kommt, du bleibst [D]nah

Outro
[C]      [D]      [G]`,
  },
  {
    title: "Harbor Lights",
    artist: "Demo · Folk",
    key: "D",
    tempo: 96,
    time: "6/8",
    source: `Verse 1
[D]Salt on the window, [A/C#]coffee gone [Bm]cold
[G]counting the boats as they [D]drift out of [A]sight
[D]you said the sea keeps [A/C#]all that it's [Bm]told
[G]so I whispered your name to the [Asus4]tide [A]

Chorus
[G]Leave the harbor [D]lights on
[A]I'll find my way [Bm]back home
[G]Through the fog and the [D]long night
[Em7]I'm not [A]sailing a[D]lone

Verse 2
[D]Gulls in the rigging, [A/C#]ropes in my [Bm]hands
[G]every mile is a [D]prayer that I [A]pray
[D]maps never show you [A/C#]where the heart [Bm]lands
[G]but the light on the water will [Asus4]stay [A]

Bridge
[Bm]Hold on, [G]hold on
[D]morning is [A]coming
[Bm]Hold on, [G]hold on
[Em7]I see the [A7]shore`,
  },
  {
    title: "Slow Morning Waltz",
    artist: "Jazz study",
    key: "Bb",
    tempo: 84,
    time: "3/4",
    source: `Verse
[Bbmaj7]Sunday in the [Gm7]kitchen
[Cm7]coffee on the [F7sus4]stove [F7]
[Bbmaj7]humming something [Ebmaj7]easy
[Ebm6]that nobody [Bbmaj7]wrote

Chorus
[Dm7b5]Stay a little [G7b9]longer
[Cm7]let the morning [F7]wait
[Bb/D]slow [Ebmaj7]waltz, [Edim7]no one's [Bb/F]counting
[Cm7]we're never [F7]late [Bb6]`,
  },
];

export function createSampleSongs(): Song[] {
  const now = Date.now();
  return SAMPLES.map((s, i) => ({
    id: uid(),
    title: s.title,
    artist: s.artist,
    originalKey: s.key,
    transpose: 0,
    sections: parseSongText(s.source).sections,
    favorite: !!s.favorite,
    tempo: s.tempo,
    timeSignature: s.time,
    createdAt: now - (i + 1) * 86_400_000,
    updatedAt: now - i * 3_600_000,
    lastOpenedAt: now - i * 3_600_000,
  }));
}
