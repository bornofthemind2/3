// Song parsing, harmony and pitch helpers. Pure functions (no DOM / audio),
// so they can be unit tested in Node.

const NOTE_OFFSETS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function noteToMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name)
  if (!m) throw new Error(`Bad note "${name}"`)
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return 12 * (Number(m[3]) + 1) + NOTE_OFFSETS[m[1]] + acc
}

export function midiToName(midi) {
  const r = Math.round(midi)
  return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1)
}

export function pitchClassName(midi) {
  return NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12]
}

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440)
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function parseBeats(str) {
  if (str.includes('/')) {
    const [a, b] = str.split('/').map(Number)
    return a / b
  }
  return Number(str)
}

/**
 * Turn a song definition into a flat, timed list of notes and lines.
 * Times are in beats from the start of the song.
 */
export function parseSong(song, transpose = 0) {
  const notes = []
  const lines = []
  let beat = 0
  song.lines.forEach((text, lineIndex) => {
    const line = { index: lineIndex, start: null, end: 0, notes: [] }
    for (const token of text.trim().split(/\s+/)) {
      const parts = token.split('|')
      if (parts[0] === '_') {
        beat += parseBeats(parts[1])
        continue
      }
      const [rawSyl, noteName, beatsStr] = parts
      const dur = parseBeats(beatsStr)
      const hold = rawSyl === '~'
      const joinNext = rawSyl.endsWith('-')
      const note = {
        index: notes.length,
        line: lineIndex,
        midi: noteToMidi(noteName) + transpose,
        start: beat,
        dur,
        syl: hold ? '' : joinNext ? rawSyl.slice(0, -1) : rawSyl,
        hold,
        joinNext,
      }
      notes.push(note)
      line.notes.push(note.index)
      if (line.start === null) line.start = beat
      beat += dur
      line.end = beat
    }
    lines.push(line)
  })
  const midis = notes.map((n) => n.midi)
  return {
    id: song.id,
    notes,
    lines,
    totalBeats: beat,
    minMidi: Math.min(...midis),
    maxMidi: Math.max(...midis),
  }
}

/**
 * Words of a line grouped for display: holds (~) are merged into the
 * syllable they extend, and syllables are flagged with trailing spaces.
 */
export function lineSyllables(parsed, lineIndex) {
  const out = []
  for (const idx of parsed.lines[lineIndex].notes) {
    const n = parsed.notes[idx]
    if (n.hold && out.length) {
      out[out.length - 1].end = n.start + n.dur
      out[out.length - 1].space = !n.joinNext
      continue
    }
    out.push({ text: n.syl, start: n.start, end: n.start + n.dur, space: !n.joinNext })
  }
  return out
}

const CHORDS = [
  { name: 'I', degree: 0, tones: [0, 4, 7] },
  { name: 'IV', degree: 5, tones: [5, 9, 0] },
  { name: 'V', degree: 7, tones: [7, 11, 2] },
  { name: 'vi', degree: 9, tones: [9, 0, 4] },
]

/**
 * Automatic accompaniment: choose I / IV / V / vi for each bar by how much
 * melody time lands on chord tones. Returns [{ startBeat, root, tones }].
 */
export function harmonize(parsed, song, transpose = 0) {
  const tonic = (NOTE_OFFSETS[song.key[0]] + transpose + 120) % 12
  const bpb = song.beatsPerBar
  const pickup = song.pickup || 0
  const firstBar = pickup > 0 ? -1 : 0
  const lastBar = Math.ceil((parsed.totalBeats - pickup) / bpb) - 1
  const bars = []
  for (let bar = firstBar; bar <= lastBar; bar++) {
    const s = Math.max(0, pickup + bar * bpb)
    const e = pickup + (bar + 1) * bpb
    const weights = CHORDS.map(() => 0)
    for (const n of parsed.notes) {
      const overlap = Math.min(e, n.start + n.dur) - Math.max(s, n.start)
      if (overlap <= 0) continue
      const pc = (((n.midi - tonic) % 12) + 12) % 12
      CHORDS.forEach((c, i) => {
        if (c.tones.includes(pc)) weights[i] += overlap * (pc === c.degree ? 1.25 : 1)
      })
    }
    // Small bias towards the tonic, and always resolve the last bar home.
    weights[0] += 0.3
    let best = 0
    weights.forEach((w, i) => {
      if (w > weights[best] + 1e-9) best = i
    })
    if (bar === lastBar) best = 0
    const c = CHORDS[best]
    bars.push({
      startBeat: s,
      endBeat: e,
      name: c.name,
      root: (tonic + c.degree) % 12,
      tones: c.tones.map((t) => (tonic + t) % 12),
    })
  }
  return bars
}

/** Distance in semitones between two pitches, ignoring the octave (0..6). */
export function pitchClassDistance(a, b) {
  const d = (((a - b) % 12) + 12) % 12
  return Math.min(d, 12 - d)
}

/** Move `midi` into the octave nearest to `ref`. */
export function foldToOctave(midi, ref) {
  return midi + 12 * Math.round((ref - midi) / 12)
}
