# 🎤 Karaoke Battle

A KaraFun-style party karaoke game built with **Vue 3 + Vite**. Grab the mic, pick a song, survive the round's challenge. The highest score takes the crown.

## Features

- **Real-time pitch scoring**: autocorrelation pitch detection from your microphone. Every note is judged, octave-independent (so low and high voices both work), with PERFECT / GREAT / GOOD / MISS line ratings and combo streaks.
- **Scrolling note lane + karaoke lyrics**: notes fill in when you're on pitch, your voice draws a live trail, and lyrics highlight syllable by syllable.
- **Live backing band**: guide melody, bass, chords and hi-hats are synthesized with the Web Audio API and harmonized automatically for each song. No audio files needed.
- **Battle modes**
  - *Turn Battle*: everyone sings the same song in turn.
  - *Line Duel*: one song, color-coded lines alternate between singers.
- **2–6 singers**: humans sharing one mic and/or CPU rivals (Shower Singer → Legend).
- **Round challenges**: Speed Demon (1.25× tempo), Key Change (+3 semitones), No Guide Vocals, Blind Notes, Lyric Memory, Three Strikes, and Golden Round (double points, always the finale in random mode).
- **Song spin**: pick a song or hit 🎲 Random.
- **Podium, scorecard and Hall of Fame**: wins, best rounds and per-song records are saved in `localStorage`.
- **Practice mode**: sing any song solo with any challenge.
- 7 public-domain songs (melody + lyrics), defined in a compact text format in `src/game/songs.js`, so adding more is easy.

## Run it

```bash
cd karaoke-battle
npm install
npm run dev      # http://localhost:5173
npm test         # scoring / parsing / pitch-detector unit tests
npm run build    # static site in dist/
```

Microphone access needs `localhost` or HTTPS. **Use headphones** so the mic hears you and not the backing track. Keyboard: `Space` pauses, `Esc` quits a song.

## Adding a song

```js
{
  id: 'mysong', title: 'My Song', artist: 'Traditional',
  key: 'C', bpm: 100, beatsPerBar: 4, pickup: 0,
  lines: [
    'Hel-|C4|1 lo|E4|1 world|G4|2',   // syllable|note|beats; "-" joins syllables into a word
    'sing|A4|0.5 ~|G4|0.5 _|1',         // "~" holds the syllable over a new note, "_" is a rest
  ],
}
```

## Project layout

```
src/
  game/songs.js      song library
  game/music.js      parsing, auto-harmony, pitch helpers
  game/scoring.js    note/line scoring, CPU singers, simulation
  game/battle.js     battle state machine + Hall of Fame storage
  audio/engine.js    Web Audio backing band and SFX
  audio/mic.js       microphone + pitch detection
  components/        screens (setup, round intro, sing stage, results…)
```
