// Real-time scoring. Feed it (beat, detectedMidi) frames while a song plays
// and it rates every note and line for whichever player owns that line.

import { pitchClassDistance } from './music.js'

export const DIFFICULTIES = {
  easy: { label: 'Easy', tolerance: 1.5 },
  medium: { label: 'Medium', tolerance: 1.0 },
  hard: { label: 'Hard', tolerance: 0.5 },
}

export const RATINGS = [
  { name: 'PERFECT', min: 0.9, bonus: 150 },
  { name: 'GREAT', min: 0.7, bonus: 75 },
  { name: 'GOOD', min: 0.4, bonus: 25 },
  { name: 'MISS', min: 0, bonus: 0 },
]

export const MAX_BASE_SCORE = 10000
// Nobody sustains a note perfectly; 80% of frames on pitch counts as full marks.
const FULL_CREDIT_RATIO = 0.8

export function rate(ratio) {
  return RATINGS.find((r) => ratio >= r.min)
}

/** Credit for one detected frame against a target note (0, 0.5 or 1). */
export function frameCredit(detected, target, tolerance) {
  if (detected == null) return 0
  const d = pitchClassDistance(detected, target)
  if (d <= tolerance) return 1
  if (d <= tolerance + 1) return 0.5
  return 0
}

/**
 * @param parsed      result of parseSong()
 * @param lineOwner   array: line index -> player id
 * @param opts        { tolerance, strikes (0 = off), onEvent(evt) }
 */
export function createTracker(parsed, lineOwner, opts = {}) {
  const tolerance = opts.tolerance ?? DIFFICULTIES.medium.tolerance
  const strikes = opts.strikes ?? 0
  const onEvent = opts.onEvent || (() => {})

  const players = {}
  for (const id of new Set(lineOwner)) {
    players[id] = {
      id,
      base: 0,
      bonus: 0,
      maxBeats: 0,
      combo: 0,
      maxCombo: 0,
      ratings: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 },
      misses: 0,
      eliminated: false,
    }
  }
  for (const n of parsed.notes) players[lineOwner[n.line]].maxBeats += n.dur

  const noteState = parsed.notes.map(() => ({ frames: 0, credit: 0, ratio: 0, done: false, hits: [] }))
  const lineState = parsed.lines.map(() => ({ done: false, rating: null }))
  let cursor = 0

  function finalizeNote(i) {
    const n = parsed.notes[i]
    const st = noteState[i]
    if (st.done) return
    st.done = true
    const p = players[lineOwner[n.line]]
    st.ratio = p.eliminated || st.frames === 0 ? 0 : Math.min(1, st.credit / st.frames / FULL_CREDIT_RATIO)
    p.base += (MAX_BASE_SCORE * n.dur * st.ratio) / p.maxBeats
    if (st.ratio >= 0.5) {
      p.combo++
      p.maxCombo = Math.max(p.maxCombo, p.combo)
    } else {
      p.combo = 0
    }
    onEvent({ type: 'note', note: i, player: p.id, ratio: st.ratio, combo: p.combo })

    const line = parsed.lines[n.line]
    if (line.notes[line.notes.length - 1] === i) finalizeLine(n.line)
  }

  function finalizeLine(li) {
    const line = parsed.lines[li]
    const p = players[lineOwner[li]]
    let num = 0
    let den = 0
    for (const idx of line.notes) {
      num += noteState[idx].ratio * parsed.notes[idx].dur
      den += parsed.notes[idx].dur
    }
    const ratio = den ? num / den : 0
    const r = p.eliminated ? RATINGS[RATINGS.length - 1] : rate(ratio)
    lineState[li] = { done: true, rating: r.name, ratio }
    if (!p.eliminated) {
      p.ratings[r.name]++
      p.bonus += r.bonus
      if (r.name === 'MISS') {
        p.misses++
        if (strikes && p.misses >= strikes) {
          p.eliminated = true
          onEvent({ type: 'eliminated', player: p.id, line: li })
        }
      }
    }
    onEvent({ type: 'line', line: li, player: p.id, rating: r.name, ratio })
  }

  return {
    players,
    noteState,
    lineState,

    /** Index of the note sounding at `beat`, or -1. */
    noteAt(beat) {
      for (let i = cursor; i < parsed.notes.length; i++) {
        const n = parsed.notes[i]
        if (beat < n.start) return -1
        if (beat < n.start + n.dur) return i
      }
      return -1
    },

    ownerOf(noteIndex) {
      return lineOwner[parsed.notes[noteIndex].line]
    },

    feed(beat, midi, frameBeats = 0) {
      while (cursor < parsed.notes.length) {
        const n = parsed.notes[cursor]
        if (beat >= n.start + n.dur) {
          finalizeNote(cursor)
          cursor++
        } else break
      }
      const i = this.noteAt(beat)
      if (i < 0) return null
      const n = parsed.notes[i]
      const st = noteState[i]
      if (players[lineOwner[n.line]].eliminated) return { note: i, credit: 0 }
      const credit = frameCredit(midi, n.midi, tolerance)
      st.frames++
      st.credit += credit
      if (credit > 0) {
        const last = st.hits[st.hits.length - 1]
        const step = frameBeats || 0.1
        if (last && beat - last[1] <= step * 2) last[1] = beat
        else st.hits.push([beat, beat])
      }
      return { note: i, credit }
    },

    finish() {
      this.feed(Infinity, null)
      const out = {}
      for (const p of Object.values(players)) {
        out[p.id] = {
          score: Math.round(p.base + p.bonus),
          accuracy: Math.round((p.base / MAX_BASE_SCORE) * 100),
          maxCombo: p.maxCombo,
          ratings: { ...p.ratings },
          eliminated: p.eliminated,
        }
      }
      return out
    },
  }
}

/** Small seeded RNG so CPU performances can be reproduced in tests. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A simulated singer. Decides once per note how well it'll sing it so the
 * errors are musical (wrong note, late entry, dropped note) rather than noise.
 * skill: 0 (tone-deaf) .. 1 (pro)
 */
export function createCpuSinger(skill, rng = Math.random) {
  const plans = new Map()
  function plan(note) {
    if (!plans.has(note.index)) {
      const r = rng()
      let offset = 0
      let silent = false
      if (r < (1 - skill) * 0.25) silent = true
      else if (r < (1 - skill) * 0.7) offset = (rng() < 0.5 ? -1 : 1) * (rng() < 0.5 ? 1 : 2)
      plans.set(note.index, {
        offset,
        silent,
        lateBy: rng() * (1 - skill) * 0.5 * note.dur,
        octave: rng() < 0.5 ? -12 : 0,
        wobble: (1 - skill) * 0.6 + 0.08,
      })
    }
    return plans.get(note.index)
  }
  return {
    pitchAt(note, beat) {
      if (!note) return null
      const p = plan(note)
      if (p.silent || beat - note.start < p.lateBy) return null
      return note.midi + p.octave + p.offset + (rng() - 0.5) * 2 * p.wobble
    },
  }
}

/** Run a whole song for CPU players instantly (used for "skip" and tests). */
export function simulate(parsed, lineOwner, cpuByPlayer, opts = {}, fps = 30, spb = 0.5) {
  const tracker = createTracker(parsed, lineOwner, opts)
  const step = 1 / fps / spb
  for (let b = 0; b < parsed.totalBeats; b += step) {
    const i = tracker.noteAt(b)
    let midi = null
    if (i >= 0) {
      const cpu = cpuByPlayer[tracker.ownerOf(i)]
      midi = cpu ? cpu.pitchAt(parsed.notes[i], b) : null
    }
    tracker.feed(b, midi, step)
  }
  return tracker.finish()
}
