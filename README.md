# Transposer

A song editor for musicians, worship leaders and songwriters. You import or type lyrics, place chords exactly over the right syllable, and transpose with one click. An assistant explains the harmony in beginner-friendly language.

## Run it

```bash
npm install
cp .env.example .env.local   # optional: add OPENROUTER_API_KEY to enable the AI chat
npm run dev                  # http://localhost:3000
npm test                     # music-theory + song-model tests
```

Three sample songs (original lyrics) load on first run. Songs autosave to `localStorage`.

## Architecture

```
src/
  lib/music/        Music theory, framework-free and unit-tested
    notes.ts        pitch classes, sharp/flat spelling
    chord.ts        chord grammar & parser, transposition, chord tones, names
    key.ts          keys, key-aware spelling, diatonic chords, roman numerals, key detection
    insights.ts     function descriptions, progression patterns, capo & simplification hints
  lib/song/         Song model
    types.ts        Song → Section → LyricLine → ChordMarker (stable ids everywhere)
    ops.ts          pure, immutable editor operations (add/move/copy chords, split/merge lines, sections…)
    remap.ts        keeps chords attached to their characters while lyrics are edited
    parse.ts        text import: [inline] chords, chords-over-lyrics, headings, confidence flags
    serialize.ts    display view, plain-text and ChordPro export, assistant context
  lib/persistence/  SongRepository interface (localStorage now, Supabase later)
  store/            zustand stores: songs (+undo/redo, autosave), editor interaction state, settings
  components/
    editor/         song sheet, sections, lyric line + chord lane, chord input, commands
    shell/          workspace layout, toolbar (transpose/key/export), sidebar, dialogs
    assistant/      local theory insights + streaming chat
  app/api/assistant OpenRouter-backed chat endpoint (streams plain text)
```

### Key design decisions

- **Chords are stored in the original key** with a `transpose` offset on the song. Transposing is lossless, never accumulates enharmonic drift, and "reset to original" is exact. Spelling (♯/♭) is decided at display time from the target key, or forced by the user.
- **Chords anchor to a character index** in their line, not to pixel positions. The editor measures the rendered text with DOM `Range`s, so chords line up with proportional fonts at any size. When two chords would overlap, the later pill is pushed right and a thin stem still marks its true anchor.
- **Lyric edits remap chords** using the edited region (with the caret as a hint), so a chord stays on its word while you type before it, and collapses sensibly when its word is deleted.
- **Drag & drop is custom pointer handling** instead of dnd-kit, because chords must snap to characters and also move between lines. A lane registry maps screen x to a character index on any line.
- **All mutations are pure functions** (`lib/song/ops.ts`) committed through one store action. That gives undo/redo (with coalescing for typing and nudging), autosave and, later, sync for free.

## Roadmap

- **Phase 2:** PDF (pdf.js) and DOCX (mammoth) extraction feeding the existing `parseSongText` and correction UI.
- **Phase 3:** structured "suggest a change" proposals the user can preview and apply.
- **Phase 4:** Supabase auth and storage behind `SongRepository`; server-side PDF export.
