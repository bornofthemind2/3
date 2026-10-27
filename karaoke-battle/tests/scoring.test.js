import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SONGS } from '../src/game/songs.js'
import { parseSong, harmonize, noteToMidi, pitchClassDistance, lineSyllables } from '../src/game/music.js'
import { createTracker, simulate, createCpuSinger, mulberry32, MAX_BASE_SCORE } from '../src/game/scoring.js'

test('all songs parse and harmonize', () => {
  for (const song of SONGS) {
    const p = parseSong(song)
    assert.ok(p.notes.length > 10, song.id)
    assert.equal(p.lines.length, song.lines.length)
    const bars = harmonize(p, song)
    assert.ok(bars.length > 0)
    assert.equal(bars[bars.length - 1].name, 'I')
    for (let i = 0; i < p.lines.length; i++) assert.ok(lineSyllables(p, i).length > 0)
  }
})

test('note helpers', () => {
  assert.equal(noteToMidi('A4'), 69)
  assert.equal(noteToMidi('C4'), 60)
  assert.equal(pitchClassDistance(60, 72), 0)
  assert.equal(pitchClassDistance(60, 71), 1)
})

test('perfect singer gets max base score plus all PERFECT lines', () => {
  const song = SONGS[0]
  const p = parseSong(song)
  const owner = p.lines.map(() => 'a')
  const t = createTracker(p, owner)
  for (let b = 0; b < p.totalBeats; b += 0.05) {
    const i = t.noteAt(b)
    t.feed(b, i >= 0 ? p.notes[i].midi - 12 : null, 0.05) // an octave down still counts
  }
  const r = t.finish().a
  assert.equal(r.accuracy, 100)
  assert.equal(r.ratings.PERFECT, p.lines.length)
  assert.equal(r.score, MAX_BASE_SCORE + 150 * p.lines.length)
})

test('silence scores zero; strikes eliminate', () => {
  const p = parseSong(SONGS[1])
  const owner = p.lines.map(() => 'a')
  const events = []
  const t = createTracker(p, owner, { strikes: 2, onEvent: (e) => events.push(e) })
  for (let b = 0; b < p.totalBeats; b += 0.05) t.feed(b, null, 0.05)
  const r = t.finish().a
  assert.equal(r.score, 0)
  assert.equal(r.eliminated, true)
  assert.ok(events.some((e) => e.type === 'eliminated'))
})

test('line duel splits lines and skilled CPU beats weak CPU', () => {
  const p = parseSong(SONGS[5])
  const owner = p.lines.map((_, i) => (i % 2 ? 'weak' : 'pro'))
  const rng = mulberry32(42)
  const r = simulate(p, owner, { pro: createCpuSinger(0.95, rng), weak: createCpuSinger(0.2, rng) })
  assert.ok(r.pro.score > r.weak.score, JSON.stringify(r))
  assert.ok(r.pro.accuracy <= 100 && r.weak.accuracy >= 0)
})

test('pitch detector finds a sine wave', async () => {
  const { detectPitch } = await import('../src/audio/mic.js')
  for (const f of [110, 220, 330, 440, 660]) {
    const sr = 44100
    const buf = new Float32Array(2048)
    for (let i = 0; i < buf.length; i++) buf[i] = 0.5 * Math.sin((2 * Math.PI * f * i) / sr)
    const { freq } = detectPitch(buf, sr)
    assert.ok(Math.abs(freq - f) / f < 0.02, `${f} -> ${freq}`)
  }
})
