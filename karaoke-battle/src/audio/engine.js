// Web Audio backing band: guide melody, bass, chord stabs, hi-hats and a
// count-in, all synthesized and scheduled ahead of time on one AudioContext.

import { midiToFreq } from '../game/music.js'

let ctx = null
let master = null
let analyser = null
let levelBuf = null

export function getAudioContext() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  return ctx
}

// Everything audible goes through one master node with an analyser on it,
// so visuals can react to the music.
function getMaster() {
  if (!master) {
    const ac = getAudioContext()
    master = ac.createGain()
    analyser = ac.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.6
    levelBuf = new Uint8Array(analyser.frequencyBinCount)
    master.connect(analyser)
    analyser.connect(ac.destination)
  }
  return master
}

/** Loudness of the bass/mid end of the current output, 0..1. */
export function getLevel() {
  if (!analyser || ctx.state !== 'running') return 0
  analyser.getByteFrequencyData(levelBuf)
  let sum = 0
  const n = 24
  for (let i = 1; i <= n; i++) sum += levelBuf[i]
  return Math.min(1, (sum / n / 255) * 1.6)
}

function noiseBuffer(ac) {
  const buf = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

/**
 * Schedule a full performance.
 * @returns {{ startAt: number, spb: number, countInBeats: number, stop(): void, setGuide(v): void }}
 */
export function playBacking(parsed, song, bars, opts = {}) {
  const ac = getAudioContext()
  const speed = opts.speed || 1
  const spb = 60 / (song.bpm * speed)
  const bpb = song.beatsPerBar
  const pickup = song.pickup || 0
  const countStart = pickup - bpb * (pickup > 0 ? 2 : 1)
  const countInBeats = -countStart
  const startAt = ac.currentTime + 0.25 + countInBeats * spb
  const at = (beat) => startAt + beat * spb

  const sources = []
  const bus = ac.createGain()
  bus.gain.value = opts.volume ?? 0.9
  const comp = ac.createDynamicsCompressor()
  bus.connect(comp).connect(getMaster())

  const guideBus = ac.createGain()
  guideBus.gain.value = opts.guide ?? 0.6
  guideBus.connect(bus)

  function tone(freq, t, dur, { type = 'sine', gain = 0.2, attack = 0.01, release = 0.08, dest = bus, filter } = {}) {
    const osc = ac.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = ac.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + attack)
    g.gain.setValueAtTime(gain, Math.max(t + attack, t + dur - release))
    g.gain.linearRampToValueAtTime(0, t + dur)
    let node = osc
    if (filter) {
      const f = ac.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.value = filter
      osc.connect(f)
      node = f
    }
    node.connect(g).connect(dest)
    osc.start(t)
    osc.stop(t + dur + 0.02)
    sources.push(osc)
  }

  const noise = noiseBuffer(ac)
  const hatFilter = ac.createBiquadFilter()
  hatFilter.type = 'highpass'
  hatFilter.frequency.value = 7000
  hatFilter.connect(bus)
  function hat(t, gain) {
    const src = ac.createBufferSource()
    src.buffer = noise
    const g = ac.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    src.connect(g).connect(hatFilter)
    src.start(t)
    src.stop(t + 0.06)
    sources.push(src)
  }

  // Count-in clicks.
  for (let b = countStart; b < 0; b++) {
    const accent = (((b - pickup) % bpb) + bpb) % bpb === 0
    tone(accent ? 1600 : 1100, at(b), 0.05, { gain: 0.25, attack: 0.002, release: 0.04 })
  }

  // Guide melody: a soft "voice" made of two detuned oscillators.
  for (const n of parsed.notes) {
    const t = at(n.start)
    const d = n.dur * spb * 0.95
    tone(midiToFreq(n.midi), t, d, { type: 'triangle', gain: 0.28, attack: 0.03, release: 0.06, dest: guideBus })
    tone(midiToFreq(n.midi) * 1.003, t, d, { type: 'sine', gain: 0.12, attack: 0.04, release: 0.06, dest: guideBus })
  }

  // Band.
  for (const bar of bars) {
    for (let b = bar.startBeat; b < bar.endBeat - 1e-6; b++) {
      const pos = Math.round(b - pickup - Math.floor((b - pickup) / bpb) * bpb)
      const t = at(b)
      if (pos === 0 || (bpb === 4 && pos === 2)) {
        tone(midiToFreq(36 + bar.root), t, spb * 0.9, { type: 'triangle', gain: 0.32, release: 0.1 })
      }
      if (pos !== 0 || bpb === 2) {
        for (const pc of bar.tones) {
          tone(midiToFreq(60 + pc), t, spb * 0.45, { type: 'sawtooth', gain: 0.035, filter: 1400, release: 0.12 })
        }
      }
      hat(t, pos === 0 ? 0.05 : 0.035)
      hat(t + spb / 2, 0.025)
    }
  }

  // Final chord ring-out.
  const last = bars[bars.length - 1]
  if (last) {
    const t = at(parsed.totalBeats)
    for (const pc of last.tones) tone(midiToFreq(60 + pc), t, spb * 2, { type: 'triangle', gain: 0.06 })
    tone(midiToFreq(36 + last.root), t, spb * 2, { type: 'triangle', gain: 0.3 })
  }

  return {
    startAt,
    spb,
    countInBeats,
    endAt: at(parsed.totalBeats + 2),
    setGuide(v) {
      guideBus.gain.setTargetAtTime(v, ac.currentTime, 0.05)
    },
    stop() {
      for (const s of sources) {
        try {
          s.stop()
        } catch {
          /* already stopped */
        }
      }
      bus.disconnect()
    },
  }
}

/** Short arcade-style jingles for UI moments. */
export function sfx(kind) {
  const ac = getAudioContext()
  const seq = {
    select: [[76, 0, 0.08]],
    go: [[72, 0, 0.1], [76, 0.1, 0.1], [79, 0.2, 0.1], [84, 0.3, 0.25]],
    win: [[72, 0, 0.12], [76, 0.12, 0.12], [79, 0.24, 0.12], [84, 0.36, 0.2], [79, 0.56, 0.1], [84, 0.66, 0.5]],
    strike: [[52, 0, 0.15], [47, 0.15, 0.3]],
  }[kind]
  if (!seq) return
  const t0 = ac.currentTime + 0.02
  for (const [m, off, d] of seq) {
    const osc = ac.createOscillator()
    osc.type = 'square'
    osc.frequency.value = midiToFreq(m)
    const g = ac.createGain()
    g.gain.setValueAtTime(0.06, t0 + off)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + off + d)
    osc.connect(g).connect(getMaster())
    osc.start(t0 + off)
    osc.stop(t0 + off + d + 0.02)
  }
}
