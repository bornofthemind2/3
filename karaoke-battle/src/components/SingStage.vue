<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { parseSong, harmonize, lineSyllables, foldToOctave, pitchClassName } from '../game/music.js'
import { createTracker, createCpuSinger, simulate, DIFFICULTIES } from '../game/scoring.js'
import { playBacking, getAudioContext, sfx } from '../audio/engine.js'
import { mic } from '../audio/mic.js'
import { burst } from '../fx/particles.js'
import { vibrate, keepAwake, toggleFullscreen, canFullscreen } from '../fx/device.js'
import { setBackdropColors } from '../fx/background.js'

const props = defineProps({
  song: { type: Object, required: true },
  challenge: { type: Object, required: true },
  singers: { type: Array, required: true },
  difficulty: { type: String, default: 'medium' },
})
const emit = defineEmits(['done', 'quit'])

// Mic + output latency: judge the singer slightly behind the band.
const MIC_LATENCY = 0.12
const RATING_COLORS = { PERFECT: '#facc15', GREAT: '#22d3ee', GOOD: '#a3e635', MISS: '#f87171' }
const RATING_BUZZ = { PERFECT: [15, 40, 15, 40, 30], GREAT: [25], GOOD: [], MISS: [80] }

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
      const color = RATING_COLORS[e.rating]
      popup(e.rating, color, e.rating.toLowerCase())
      if (RATING_BUZZ[e.rating].length && !byId[e.player].cpu) vibrate(RATING_BUZZ[e.rating])
      if (e.rating === 'PERFECT' || e.rating === 'GREAT') {
        const r = lyricsEl.value?.getBoundingClientRect()
        if (r) burst(r.left + r.width / 2, r.top + r.height * 0.35, [color, byId[e.player].color, '#ffffff'], e.rating === 'PERFECT' ? 70 : 30)
      }
    } else if (e.type === 'eliminated') {
      popup(`${byId[e.player].name} STRUCK OUT!`, '#f87171', 'big')
      sfx('strike')
      vibrate([120, 60, 120])
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
const stageEl = ref(null)
const lyricsEl = ref(null)
const fullscreenOk = canFullscreen()
let backing = null
let sparks = []
let pendingSparks = []
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
watch(activeOwner, (o) => setBackdropColors(o.color), { immediate: true })

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

  // Beat pulse drives the lane's glow (1 on the beat, fading to 0).
  if (state.beat > -8) stageEl.value?.style.setProperty('--pulse', (1 - (((state.beat % 1) + 1) % 1)).toFixed(3))

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
      const hit = res && res.credit > 0
      trail.push({ beat: judgeBeat, midi: foldToOctave(midi, ref), hit, color: byId[owner].color })
      if (hit && note && Math.random() < 0.5) pendingSparks.push({ midi: note.midi, color: byId[owner].color })
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
  const playX = W * 0.18
  // Narrow (phone) lanes show less of the future so notes stay readable.
  const secondsAhead = Math.max(1.8, Math.min(3.2, c.clientWidth / 320))
  const pxPerBeat = ((W - playX) / secondsAhead) * spb
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
      const h = Math.max(8 * dpr, rowH * 0.72)
      const top = y(n.midi) - h / 2
      const active = beat >= n.start && beat < n.start + n.dur
      const body = g.createLinearGradient(0, top, 0, top + h)
      body.addColorStop(0, color + '66')
      body.addColorStop(1, color + '1a')
      g.fillStyle = body
      roundRect(g, x0 + 1, top, x1 - x0 - 2, h, h / 2)
      g.fill()
      g.strokeStyle = color
      g.lineWidth = (active ? 2.5 : 1.5) * dpr
      g.shadowColor = color
      g.shadowBlur = active ? 18 * dpr : 0
      roundRect(g, x0 + 1, top, x1 - x0 - 2, h, h / 2)
      g.stroke()
      g.shadowBlur = 0
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

  // Sparks fly off the playhead while the singer is on pitch.
  for (const s of pendingSparks) {
    for (let k = 0; k < 2; k++) {
      sparks.push({ x: playX, y: y(s.midi), vx: -(1 + Math.random() * 3) * dpr, vy: (Math.random() - 0.5) * 3 * dpr, life: 30, color: s.color })
    }
  }
  pendingSparks = []
  g.globalCompositeOperation = 'lighter'
  sparks = sparks.filter((s) => s.life > 0)
  for (const s of sparks) {
    s.x += s.vx
    s.y += s.vy
    s.vy += 0.08 * dpr
    s.life--
    g.globalAlpha = s.life / 30
    g.fillStyle = s.color
    g.beginPath()
    g.arc(s.x, s.y, 2.2 * dpr, 0, Math.PI * 2)
    g.fill()
  }
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'

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
  keepAwake(true)
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
  keepAwake(false)
  setBackdropColors('#ff3d9a')
  resizeObs?.disconnect()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="stageEl" class="stage" :style="{ '--owner': activeOwner.color }">
    <header class="topbar">
      <button class="btn ghost icon" aria-label="Quit song" @click="quit">✕</button>
      <div class="song-meta">
        <div class="song-title">{{ song.title }}</div>
        <div class="song-sub">
          <span class="chip">{{ challenge.icon }} {{ challenge.name }}</span>
          <span class="chip hide-xs">{{ difficulty }}</span>
          <span v-if="challenge.multiplier" class="chip gold">×{{ challenge.multiplier }}</span>
        </div>
      </div>
      <button class="btn ghost icon" :aria-label="state.paused ? 'Resume' : 'Pause'" @click="togglePause">{{ state.paused ? '▶' : '❚❚' }}</button>
      <button v-if="fullscreenOk" class="btn ghost icon hide-xs-land" aria-label="Toggle fullscreen" @click="toggleFullscreen">⛶</button>
    </header>

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
          <span v-if="state.live[s.id]?.combo >= 3" class="combo">🔥{{ state.live[s.id].combo }}</span>
          <span v-if="challenge.strikes" class="strikes">
            <span v-for="k in challenge.strikes" :key="k" :class="{ hit: k <= (state.live[s.id]?.misses || 0) }">✖</span>
          </span>
        </div>
      </div>
    </div>

    <div class="lane-wrap">
      <canvas ref="canvas" class="lane"></canvas>
      <div v-if="hasHuman && !micReady" class="mic-warn">
        <span>🎙️ No mic, humans can't score</span>
        <button class="btn small" @click="enableMic">Enable mic</button>
        <span v-if="micError" class="err">{{ micError }}</span>
      </div>
      <div v-if="countdown" :key="countdown" class="countdown">{{ countdown }}</div>
      <div v-if="state.phase === 'finished'" class="countdown finish">FINISH!</div>
      <div v-if="state.paused" class="paused">
        <div class="paused-title">Paused</div>
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

    <div ref="lyricsEl" class="lyrics">
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
              :class="{ masked: challenge.memory && s.p === 0 && state.beat < s.start - 0.5, sung: s.p > 0 && s.p < 1 }"
              :style="{ '--p': s.p * 100 + '%' }"
              >{{ s.text }}{{ s.space ? ' ' : '' }}</span
            >
          </template>
        </div>
      </template>
    </div>

    <footer class="bottombar">
      <div class="progress"><div :style="{ width: progress * 100 + '%' }"></div></div>
      <div v-if="challenge.guide === undefined || allCpu" class="controls">
        <button v-if="challenge.guide === undefined" class="btn small ghost" @click="toggleGuide">
          {{ state.guideOn ? '🔊 Guide on' : '🔇 Guide off' }}
        </button>
        <button v-if="allCpu" class="btn small ghost" @click="skipCpu">⏭ Skip CPU</button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.stage {
  --pulse: 0;
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  /* minmax(0, …) stops the sideways-scrolling score row from widening the stage. */
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(150px, 1fr) auto auto;
  gap: 10px;
  padding-block: calc(10px + var(--safe-t)) calc(10px + var(--safe-b));
  padding-left: var(--gutter-l);
  padding-right: var(--gutter-r);
  max-width: 1400px;
  margin: 0 auto;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
}
.song-meta {
  flex: 1;
  min-width: 0;
}
.song-title {
  font-family: var(--font-display);
  font-size: clamp(0.95rem, 2.6vw, 1.3rem);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.song-sub {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  overflow: hidden;
}

/* Scores scroll sideways on phones when there are many singers. */
.scores {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  padding: 4px 2px;
}
.scores::-webkit-scrollbar {
  display: none;
}
.score-card {
  flex: 1 0 120px;
  max-width: 240px;
  scroll-snap-align: start;
  padding: 8px 14px;
  border-radius: 16px;
  background: var(--glass);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  border: 1.5px solid var(--line);
  transition: border-color 0.25s, box-shadow 0.25s, transform 0.25s;
}
.score-card.active {
  border-color: var(--c);
  box-shadow: 0 0 calc(14px + var(--pulse) * 18px) color-mix(in srgb, var(--c) 55%, transparent);
  transform: translateY(-1px);
}
.score-card.out {
  opacity: 0.4;
  filter: grayscale(1);
}
.sc-name {
  color: var(--c);
  font-weight: 800;
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sc-score {
  font-family: var(--font-display);
  font-size: clamp(1.15rem, 3.4vw, 1.6rem);
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.sc-extra {
  font-size: 0.75rem;
  min-height: 1.1em;
  display: flex;
  gap: 8px;
  color: var(--muted);
}
.combo {
  color: #fb923c;
  font-weight: 800;
}
.strikes span {
  opacity: 0.3;
}
.strikes span.hit {
  opacity: 1;
  color: #f87171;
}

.lane-wrap {
  position: relative;
  min-height: 0;
  border-radius: 22px;
  overflow: hidden;
  background: linear-gradient(180deg, rgb(18 10 42 / 0.82), rgb(7 3 15 / 0.9));
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  border: 1px solid color-mix(in srgb, var(--owner) calc(20% + var(--pulse) * 40%), transparent);
  box-shadow: 0 0 calc(var(--pulse) * 40px) -10px var(--owner), inset 0 0 60px -30px var(--owner);
}
.lane {
  width: 100%;
  height: 100%;
  display: block;
  position: absolute;
  inset: 0;
}
.mic-warn {
  position: absolute;
  left: 8px;
  top: 8px;
  max-width: calc(100% - 16px);
  z-index: 2;
  background: rgb(59 29 42 / 0.88);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border: 1px solid #f43f5e55;
  padding: 4px 4px 4px 12px;
  border-radius: 999px;
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.78rem;
}
.mic-warn .btn {
  min-height: 32px;
  padding: 4px 12px;
  font-size: 0.75rem;
  flex: none;
}
.mic-warn .err {
  display: none;
}
.err {
  color: #fda4af;
  font-size: 0.8rem;
}
.countdown {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: clamp(4rem, 18vw, 8rem);
  font-weight: 900;
  color: var(--owner);
  text-shadow: 0 0 40px var(--owner), 0 0 90px var(--owner);
  animation: pop 0.5s cubic-bezier(0.2, 1.6, 0.4, 1);
  pointer-events: none;
}
.countdown.finish {
  font-size: clamp(2.4rem, 10vw, 4.5rem);
  color: var(--gold);
  text-shadow: 0 0 40px var(--gold);
}
@keyframes pop {
  from {
    transform: scale(2.2);
    opacity: 0;
    filter: blur(10px);
  }
}
.paused {
  position: absolute;
  inset: 0;
  background: rgb(7 3 15 / 0.6);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  display: grid;
  place-content: center;
  gap: 16px;
  text-align: center;
  z-index: 3;
}
.paused-title {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 900;
}
.row {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.popups {
  position: absolute;
  top: 12px;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.popup {
  font-family: var(--font-display);
  font-size: clamp(1.3rem, 5vw, 2rem);
  font-weight: 900;
  letter-spacing: 0.06em;
  text-shadow: 0 0 20px currentColor;
  animation: rise 1.3s cubic-bezier(0.2, 1.4, 0.4, 1) forwards;
}
.popup.big {
  font-size: clamp(1.1rem, 4.5vw, 2rem);
  text-align: center;
}
.popup.perfect {
  font-size: clamp(1.6rem, 6.5vw, 2.6rem);
  background: linear-gradient(90deg, #facc15, #fff, #facc15);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 14px #facc15);
}
@keyframes rise {
  0% {
    transform: translateY(24px) scale(0.5);
    opacity: 0;
  }
  15% {
    transform: translateY(0) scale(1.15);
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    transform: translateY(-30px) scale(1);
    opacity: 0;
  }
}
.mic-note {
  position: absolute;
  right: 10px;
  top: 10px;
  font-size: 0.8rem;
  color: var(--muted);
  background: rgb(0 0 0 / 0.5);
  padding: 4px 10px;
  border-radius: 999px;
}

.lyrics {
  min-height: 96px;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}
.lyric-line {
  font-family: var(--font-display);
  font-size: clamp(1.15rem, 4.6vw, 2.4rem);
  font-weight: 700;
  line-height: 1.3;
}
.lyric-line.next {
  font-size: clamp(0.85rem, 2.8vw, 1.35rem);
  opacity: 0.4;
}
.who {
  display: inline-block;
  font-family: var(--font-body);
  font-size: max(0.7rem, 0.4em);
  vertical-align: middle;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--c);
  color: #07030f;
  margin-right: 8px;
  font-weight: 900;
}
.syl {
  white-space: pre;
  background: linear-gradient(90deg, var(--c) var(--p), #fff var(--p));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.syl.sung {
  filter: drop-shadow(0 0 10px var(--c));
}
.lyric-line.next .syl {
  background: none;
  color: #fff;
}
.masked {
  color: transparent !important;
  background: rgb(255 255 255 / 0.12) !important;
  border-radius: 6px;
}
.lyric-line > .masked {
  color: rgb(255 255 255 / 0.4) !important;
  background: none !important;
}

.bottombar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.progress {
  height: 6px;
  background: rgb(255 255 255 / 0.08);
  border-radius: 999px;
  overflow: hidden;
}
.progress div {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--owner));
  box-shadow: 0 0 12px var(--owner);
  transition: width 0.1s linear;
}
.controls {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
}

@media (max-width: 480px) {
  .hide-xs {
    display: none;
  }
  .score-card {
    padding: 6px 10px;
    flex-basis: 104px;
  }
}
/* Phone held sideways: squeeze everything around the lane. */
@media (max-height: 500px) and (orientation: landscape) {
  .stage {
    gap: 6px;
    grid-template-rows: auto auto minmax(100px, 1fr) auto auto;
  }
  .song-sub,
  .sc-extra,
  .lyric-line.next,
  .hide-xs-land {
    display: none;
  }
  .score-card {
    padding: 4px 10px;
  }
  .lyrics {
    min-height: 0;
  }
  .lyric-line {
    font-size: clamp(1rem, 4vh, 1.5rem);
  }
}
</style>
