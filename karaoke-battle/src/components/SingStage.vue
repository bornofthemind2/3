<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { parseSong, harmonize, lineSyllables, foldToOctave, pitchClassName } from '../game/music.js'
import { createTracker, createCpuSinger, simulate, DIFFICULTIES } from '../game/scoring.js'
import { playBacking, getAudioContext, sfx } from '../audio/engine.js'
import { mic } from '../audio/mic.js'

const props = defineProps({
  song: { type: Object, required: true },
  challenge: { type: Object, required: true },
  singers: { type: Array, required: true },
  difficulty: { type: String, default: 'medium' },
})
const emit = defineEmits(['done', 'quit'])

// Mic + output latency: judge the singer slightly behind the band.
const MIC_LATENCY = 0.12
const SECONDS_AHEAD = 3.2

const transpose = props.challenge.transpose || 0
const parsed = parseSong(props.song, transpose)
const bars = harmonize(parsed, props.song, transpose)
const lineOwner = parsed.lines.map((_, i) => props.singers[i % props.singers.length].id)
const byId = Object.fromEntries(props.singers.map((s) => [s.id, s]))
const cpus = Object.fromEntries(props.singers.filter((s) => s.cpu).map((s) => [s.id, createCpuSinger(s.skill)]))
const hasHuman = props.singers.some((s) => !s.cpu)
const allCpu = !hasHuman

const popups = ref([])
let popupId = 0
function popup(text, color, cls = '') {
  const id = ++popupId
  popups.value.push({ id, text, color, cls })
  setTimeout(() => (popups.value = popups.value.filter((p) => p.id !== id)), 1300)
}

const tracker = createTracker(parsed, lineOwner, {
  tolerance: DIFFICULTIES[props.difficulty].tolerance,
  strikes: props.challenge.strikes || 0,
  onEvent(e) {
    if (e.type === 'line') {
      const color = { PERFECT: '#facc15', GREAT: '#22d3ee', GOOD: '#a3e635', MISS: '#f87171' }[e.rating]
      popup(e.rating, color, e.rating.toLowerCase())
    } else if (e.type === 'eliminated') {
      popup(`${byId[e.player].name} STRUCK OUT!`, '#f87171', 'big')
      sfx('strike')
    }
  },
})

const state = reactive({
  beat: -99,
  phase: 'countin', // countin | singing | finished
  paused: false,
  micNote: null,
  live: {},
  guideOn: (props.challenge.guide ?? 0.6) > 0,
})
const micReady = ref(mic.ready)
const micError = ref(mic.error)

const canvas = ref(null)
let backing = null
let raf = 0
let trail = []
let finishedAt = 0
let resizeObs = null

const currentLine = computed(() => {
  const b = state.beat
  for (let i = 0; i < parsed.lines.length; i++) if (b < parsed.lines[i].end + 0.2) return i
  return parsed.lines.length - 1
})

function lineView(i) {
  if (i < 0 || i >= parsed.lines.length) return null
  const owner = byId[lineOwner[i]]
  return {
    owner,
    rating: tracker.lineState[i].rating,
    syllables: lineSyllables(parsed, i).map((s) => ({
      ...s,
      p: Math.max(0, Math.min(1, (state.beat - s.start) / (s.end - s.start))),
    })),
  }
}

const shownLines = computed(() => [lineView(currentLine.value), lineView(currentLine.value + 1)])
const countdown = computed(() => (state.beat < 0 ? Math.ceil(-state.beat) : 0))
const progress = computed(() => Math.max(0, Math.min(1, state.beat / parsed.totalBeats)))
const activeOwner = computed(() => byId[lineOwner[currentLine.value]])

function liveSnapshot() {
  const out = {}
  for (const [id, p] of Object.entries(tracker.players)) {
    out[id] = { score: Math.round(p.base + p.bonus), combo: p.combo, misses: p.misses, eliminated: p.eliminated }
  }
  state.live = out
}
liveSnapshot()

function loop() {
  raf = requestAnimationFrame(loop)
  const ac = getAudioContext()
  if (!backing || state.paused) return draw()
  const now = ac.currentTime
  state.beat = (now - backing.startAt) / backing.spb
  const judgeBeat = (now - backing.startAt - MIC_LATENCY) / backing.spb

  const reading = hasHuman ? mic.read() : { midi: null }
  state.micNote = reading.midi != null ? pitchClassName(reading.midi) : null

  if (judgeBeat >= 0 && judgeBeat < parsed.totalBeats) {
    if (state.phase === 'countin') state.phase = 'singing'
    const i = tracker.noteAt(judgeBeat)
    const note = i >= 0 ? parsed.notes[i] : null
    const owner = note ? lineOwner[note.line] : lineOwner[currentLine.value]
    const midi = byId[owner].cpu ? cpus[owner].pitchAt(note, judgeBeat) : reading.midi
    const res = tracker.feed(judgeBeat, midi, 1 / 60 / backing.spb)
    if (midi != null) {
      const ref = note ? note.midi : (parsed.minMidi + parsed.maxMidi) / 2
      trail.push({ beat: judgeBeat, midi: foldToOctave(midi, ref), hit: res && res.credit > 0, color: byId[owner].color })
    }
    trail = trail.filter((p) => p.beat > judgeBeat - 2.5 / backing.spb)
    liveSnapshot()
  } else if (judgeBeat >= parsed.totalBeats && state.phase !== 'finished') {
    finish()
  }
  if (state.phase === 'finished' && now - finishedAt > 1.8) {
    cancelAnimationFrame(raf)
    raf = 0
    emit('done', tracker.finish())
    return
  }
  draw()
}

function finish() {
  state.phase = 'finished'
  finishedAt = getAudioContext().currentTime
  liveSnapshot()
  sfx('go')
}

function draw() {
  const c = canvas.value
  if (!c) return
  const g = c.getContext('2d')
  const W = c.width
  const H = c.height
  const dpr = window.devicePixelRatio || 1
  g.clearRect(0, 0, W, H)
  const spb = backing ? backing.spb : 60 / props.song.bpm
  const playX = W * 0.2
  const pxPerBeat = ((W - playX) / SECONDS_AHEAD) * spb
  const beat = Math.max(state.beat - MIC_LATENCY / spb, -10)
  const lo = parsed.minMidi - 2
  const hi = parsed.maxMidi + 2
  const pad = 14 * dpr
  const rowH = (H - pad * 2) / (hi - lo)
  const y = (m) => H - pad - (m - lo) * rowH
  const x = (b) => playX + (b - beat) * pxPerBeat

  // Lane grid.
  for (let m = lo; m <= hi; m++) {
    g.fillStyle = [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12) ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.055)'
    g.fillRect(0, y(m) - rowH / 2, W, rowH - 1)
  }

  if (!props.challenge.blind) {
    for (const n of parsed.notes) {
      const x0 = x(n.start)
      const x1 = x(n.start + n.dur)
      if (x1 < -10 || x0 > W + 10) continue
      const st = tracker.noteState[n.index]
      const color = byId[lineOwner[n.line]].color
      const h = Math.max(6 * dpr, rowH * 0.7)
      const top = y(n.midi) - h / 2
      g.globalAlpha = 0.28
      g.fillStyle = color
      roundRect(g, x0 + 1, top, x1 - x0 - 2, h, h / 2)
      g.fill()
      g.globalAlpha = 1
      g.strokeStyle = color
      g.lineWidth = 1.5 * dpr
      roundRect(g, x0 + 1, top, x1 - x0 - 2, h, h / 2)
      g.stroke()
      // Filled-in where the singer was on pitch.
      g.save()
      roundRect(g, x0 + 1, top, x1 - x0 - 2, h, h / 2)
      g.clip()
      g.fillStyle = color
      g.shadowColor = color
      g.shadowBlur = 16 * dpr
      for (const [a, b] of st.hits) g.fillRect(x(a), top, Math.max(x(b) - x(a), 2 * dpr), h)
      g.restore()
    }
  } else {
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.font = `${18 * dpr}px system-ui`
    g.textAlign = 'center'
    g.fillText('🙈  Blind Notes — sing by ear', W / 2, H / 2)
  }

  // Singer's pitch trail.
  for (const p of trail) {
    const px = x(p.beat)
    g.beginPath()
    g.arc(px, y(p.midi), (p.hit ? 4 : 2.5) * dpr, 0, Math.PI * 2)
    g.fillStyle = p.hit ? '#fff' : 'rgba(255,255,255,0.35)'
    g.fill()
  }

  // Playhead.
  const grad = g.createLinearGradient(playX - 30 * dpr, 0, playX, 0)
  grad.addColorStop(0, 'rgba(255,255,255,0)')
  grad.addColorStop(1, 'rgba(255,255,255,0.12)')
  g.fillStyle = grad
  g.fillRect(playX - 30 * dpr, 0, 30 * dpr, H)
  g.fillStyle = '#fff'
  g.fillRect(playX - dpr, 0, 2 * dpr, H)
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function resize() {
  const c = canvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  c.width = c.clientWidth * dpr
  c.height = c.clientHeight * dpr
  draw()
}

async function enableMic() {
  await mic.start()
  micReady.value = mic.ready
  micError.value = mic.error
}

function togglePause() {
  const ac = getAudioContext()
  state.paused = !state.paused
  if (state.paused) ac.suspend()
  else ac.resume()
}

function toggleGuide() {
  state.guideOn = !state.guideOn
  backing?.setGuide(state.guideOn ? 0.6 : 0)
}

function teardown() {
  cancelAnimationFrame(raf)
  raf = 0
  backing?.stop()
  backing = null
  getAudioContext().resume()
}

function quit() {
  teardown()
  emit('quit')
}

function skipCpu() {
  teardown()
  emit('done', simulate(parsed, lineOwner, Object.fromEntries(Object.entries(byId).map(([id, s]) => [id, createCpuSinger(s.skill)])), {
    tolerance: DIFFICULTIES[props.difficulty].tolerance,
    strikes: props.challenge.strikes || 0,
  }))
}

function onKey(e) {
  if (e.code === 'Space' && state.phase !== 'finished') {
    e.preventDefault()
    togglePause()
  } else if (e.code === 'Escape') quit()
}

onMounted(async () => {
  resizeObs = new ResizeObserver(resize)
  resizeObs.observe(canvas.value)
  resize()
  window.addEventListener('keydown', onKey)
  await getAudioContext().resume()
  backing = playBacking(parsed, props.song, bars, {
    speed: props.challenge.speed || 1,
    guide: state.guideOn ? 0.6 : 0,
  })
  loop()
})

onBeforeUnmount(() => {
  teardown()
  resizeObs?.disconnect()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="stage" :style="{ '--owner': activeOwner.color }">
    <header class="stage-top">
      <div class="song-meta">
        <div class="song-title">{{ song.title }}</div>
        <div class="song-sub">
          <span class="chip">{{ challenge.icon }} {{ challenge.name }}</span>
          <span class="chip">{{ difficulty }}</span>
          <span v-if="challenge.multiplier" class="chip gold">×{{ challenge.multiplier }} points</span>
        </div>
      </div>
      <div class="scores">
        <div
          v-for="s in singers"
          :key="s.id"
          class="score-card"
          :class="{ active: activeOwner.id === s.id, out: state.live[s.id]?.eliminated }"
          :style="{ '--c': s.color }"
        >
          <div class="sc-name">{{ s.cpu ? '🤖 ' : '' }}{{ s.name }}</div>
          <div class="sc-score">{{ (state.live[s.id]?.score || 0).toLocaleString() }}</div>
          <div class="sc-extra">
            <span v-if="state.live[s.id]?.combo >= 3">🔥 {{ state.live[s.id].combo }} combo</span>
            <span v-if="challenge.strikes" class="strikes">
              <span v-for="k in challenge.strikes" :key="k" :class="{ hit: k <= (state.live[s.id]?.misses || 0) }">✖</span>
            </span>
          </div>
        </div>
      </div>
    </header>

    <div v-if="hasHuman && !micReady" class="mic-warn">
      🎙️ No microphone — human singers can't score.
      <button class="btn small" @click="enableMic">Enable mic</button>
      <span v-if="micError" class="err">{{ micError }}</span>
    </div>

    <div class="lane-wrap">
      <canvas ref="canvas" class="lane"></canvas>
      <div v-if="countdown" class="countdown" :key="countdown">{{ countdown }}</div>
      <div v-if="state.phase === 'finished'" class="countdown finish">FINISH!</div>
      <div v-if="state.paused" class="paused">
        <div>PAUSED</div>
        <div class="row">
          <button class="btn" @click="togglePause">▶ Resume</button>
          <button class="btn ghost" @click="quit">Quit song</button>
        </div>
      </div>
      <div class="popups">
        <div v-for="p in popups" :key="p.id" class="popup" :class="p.cls" :style="{ color: p.color }">{{ p.text }}</div>
      </div>
      <div v-if="hasHuman && micReady" class="mic-note">🎙️ {{ state.micNote || '—' }}</div>
    </div>

    <div class="lyrics">
      <template v-for="(line, li) in shownLines" :key="li">
        <div v-if="line" class="lyric-line" :class="{ next: li === 1 }" :style="{ '--c': line.owner.color }">
          <span v-if="singers.length > 1" class="who">{{ line.owner.name }}</span>
          <template v-if="li === 1 && challenge.memory">
            <span class="masked">• • • • •</span>
          </template>
          <template v-else>
            <span
              v-for="(s, si) in line.syllables"
              :key="si"
              class="syl"
              :class="{ masked: challenge.memory && s.p === 0 && state.beat < s.start - 0.5 }"
              :style="{ '--p': s.p * 100 + '%' }"
              >{{ s.text }}{{ s.space ? ' ' : '' }}</span
            >
          </template>
        </div>
      </template>
    </div>

    <footer class="stage-bottom">
      <div class="progress"><div :style="{ width: progress * 100 + '%' }"></div></div>
      <div class="controls">
        <button class="btn small ghost" @click="togglePause">{{ state.paused ? '▶ Resume' : '⏸ Pause' }}</button>
        <button v-if="challenge.guide === undefined" class="btn small ghost" @click="toggleGuide">
          {{ state.guideOn ? '🔊 Guide on' : '🔇 Guide off' }}
        </button>
        <button v-if="allCpu" class="btn small ghost" @click="skipCpu">⏭ Skip CPU</button>
        <button class="btn small ghost" @click="quit">✕ Quit</button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.stage {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;
  min-height: calc(100vh - 40px);
}
.stage-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}
.song-title {
  font-size: 1.4rem;
  font-weight: 800;
}
.song-sub {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.scores {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.score-card {
  min-width: 130px;
  padding: 8px 14px;
  border-radius: 14px;
  background: var(--panel);
  border: 2px solid transparent;
  transition: all 0.2s;
}
.score-card.active {
  border-color: var(--c);
  box-shadow: 0 0 22px color-mix(in srgb, var(--c) 45%, transparent);
}
.score-card.out {
  opacity: 0.4;
  filter: grayscale(1);
}
.sc-name {
  color: var(--c);
  font-weight: 700;
  font-size: 0.85rem;
}
.sc-score {
  font-size: 1.6rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.sc-extra {
  font-size: 0.75rem;
  min-height: 1em;
  display: flex;
  gap: 8px;
  color: var(--muted);
}
.strikes span {
  opacity: 0.3;
}
.strikes span.hit {
  opacity: 1;
  color: #f87171;
}
.mic-warn {
  background: #3b1d2a;
  border: 1px solid #f43f5e55;
  padding: 10px 14px;
  border-radius: 12px;
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.err {
  color: #fda4af;
  font-size: 0.85rem;
}
.lane-wrap {
  position: relative;
  flex: 1;
  min-height: 240px;
  border-radius: 18px;
  overflow: hidden;
  background: linear-gradient(180deg, #120a2a, #0b0618);
  border: 1px solid #ffffff14;
}
.lane {
  width: 100%;
  height: 100%;
  display: block;
  position: absolute;
  inset: 0;
}
.countdown {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 7rem;
  font-weight: 900;
  color: var(--owner);
  text-shadow: 0 0 40px var(--owner);
  animation: pop 0.5s ease-out;
  pointer-events: none;
}
.countdown.finish {
  font-size: 4.5rem;
  color: #facc15;
  text-shadow: 0 0 40px #facc15;
}
@keyframes pop {
  from {
    transform: scale(1.6);
    opacity: 0;
  }
}
.paused {
  position: absolute;
  inset: 0;
  background: #0009;
  backdrop-filter: blur(4px);
  display: grid;
  place-content: center;
  gap: 16px;
  font-size: 2.4rem;
  font-weight: 900;
  text-align: center;
}
.row {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.popups {
  position: absolute;
  top: 16px;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.popup {
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-shadow: 0 0 20px currentColor;
  animation: rise 1.3s ease-out forwards;
}
.popup.big {
  font-size: 2.4rem;
}
.popup.perfect {
  font-size: 2.6rem;
}
@keyframes rise {
  0% {
    transform: translateY(20px) scale(0.6);
    opacity: 0;
  }
  15% {
    transform: translateY(0) scale(1.1);
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    transform: translateY(-30px);
    opacity: 0;
  }
}
.mic-note {
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 0.85rem;
  color: var(--muted);
  background: #0008;
  padding: 4px 10px;
  border-radius: 999px;
}
.lyrics {
  min-height: 130px;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.lyric-line {
  font-size: clamp(1.4rem, 4vw, 2.5rem);
  font-weight: 800;
  line-height: 1.25;
}
.lyric-line.next {
  font-size: clamp(1rem, 2.6vw, 1.5rem);
  opacity: 0.45;
}
.who {
  display: inline-block;
  font-size: 0.45em;
  vertical-align: middle;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--c);
  color: #0b0618;
  margin-right: 10px;
  font-weight: 800;
}
.syl {
  white-space: pre;
  background: linear-gradient(90deg, var(--c) var(--p), #fff var(--p));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.lyric-line.next .syl {
  background: none;
  color: #fff;
}
.masked {
  color: transparent !important;
  background: #ffffff1c !important;
  border-radius: 6px;
}
.lyric-line > .masked {
  color: #ffffff66 !important;
  background: none !important;
}
.stage-bottom {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.progress {
  height: 6px;
  background: #ffffff14;
  border-radius: 999px;
  overflow: hidden;
}
.progress div {
  height: 100%;
  background: var(--owner);
  transition: width 0.1s linear;
}
.controls {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}
@media (max-width: 640px) {
  .countdown {
    font-size: 5rem;
  }
  .score-card {
    min-width: 0;
    flex: 1;
  }
}
</style>
