// Microphone input + autocorrelation pitch detection.

import { getAudioContext } from './engine.js'
import { freqToMidi } from '../game/music.js'

/** Returns the fundamental frequency in Hz, or -1 for silence / no pitch. */
export function detectPitch(buf, sampleRate, minRms = 0.012) {
  const size = buf.length
  let rms = 0
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / size)
  if (rms < minRms) return { freq: -1, rms }

  // Trim the quiet edges so the correlation isn't dominated by them.
  const thr = 0.2
  let r1 = 0
  let r2 = size - 1
  for (let i = 0; i < size / 2; i++) if (Math.abs(buf[i]) < thr) { r1 = i; break }
  for (let i = 1; i < size / 2; i++) if (Math.abs(buf[size - i]) < thr) { r2 = size - i; break }
  const b = buf.subarray(r1, r2)
  const n = b.length

  const c = new Float32Array(n)
  for (let lag = 0; lag < n; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) sum += b[i] * b[i + lag]
    c[lag] = sum
  }
  let d = 0
  while (d < n - 1 && c[d] > c[d + 1]) d++
  let maxVal = -1
  let maxPos = -1
  // Only look at lags for ~70Hz..1100Hz (human singing range).
  const minLag = Math.max(d, Math.floor(sampleRate / 1100))
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / 70))
  for (let i = minLag; i < maxLag; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i]
      maxPos = i
    }
  }
  if (maxPos <= 0 || maxVal < c[0] * 0.3) return { freq: -1, rms }
  // Parabolic interpolation for sub-sample accuracy.
  const x1 = c[maxPos - 1]
  const x2 = c[maxPos]
  const x3 = c[maxPos + 1] ?? x2
  const a = (x1 + x3 - 2 * x2) / 2
  const bb = (x3 - x1) / 2
  const T0 = a ? maxPos - bb / (2 * a) : maxPos
  return { freq: sampleRate / T0, rms }
}

export class Mic {
  constructor() {
    this.stream = null
    this.analyser = null
    this.buf = null
    this.error = null
    this.sensitivity = 0.012
  }

  get ready() {
    return !!this.analyser
  }

  async start() {
    if (this.analyser) return true
    const ac = getAudioContext()
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      })
    } catch (e) {
      this.error = e.name === 'NotAllowedError' ? 'Microphone permission was denied.' : `Microphone unavailable (${e.message || e.name}).`
      return false
    }
    const src = ac.createMediaStreamSource(this.stream)
    this.analyser = ac.createAnalyser()
    this.analyser.fftSize = 2048
    src.connect(this.analyser)
    this.buf = new Float32Array(this.analyser.fftSize)
    this.error = null
    return true
  }

  /** { midi: number|null, rms } for the current audio frame. */
  read() {
    if (!this.analyser) return { midi: null, rms: 0 }
    this.analyser.getFloatTimeDomainData(this.buf)
    const { freq, rms } = detectPitch(this.buf, this.analyser.context.sampleRate, this.sensitivity)
    return { midi: freq > 0 ? freqToMidi(freq) : null, rms }
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.analyser = null
  }
}

export const mic = new Mic()
