<script setup>
import { reactive, computed } from 'vue'
import { store, makePlayer, startBattle, CHALLENGES, CPU_LEVELS, PLAYER_COLORS } from '../game/battle.js'
import { DIFFICULTIES } from '../game/scoring.js'
import MicCheck from './MicCheck.vue'
import { sfx } from '../audio/engine.js'

const cfg = reactive({
  players: [makePlayer(0), makePlayer(1, { cpu: true, name: 'Robo Rita' })],
  mode: 'turns',
  rounds: 3,
  difficulty: 'medium',
  challengeMode: 'random',
})

const CPU_NAMES = ['Robo Rita', 'Auto Tuna', 'DJ Byte', 'Siri-nade', 'Max Volume', 'Pitchy Pete']

function addPlayer() {
  if (cfg.players.length >= 6) return
  const used = new Set(cfg.players.map((p) => p.color))
  const p = makePlayer(cfg.players.length)
  p.color = PLAYER_COLORS.find((c) => !used.has(c)) || p.color
  cfg.players.push(p)
}

function toggleCpu(p) {
  p.cpu = !p.cpu
  if (p.cpu && /^Singer \d+$/.test(p.name)) {
    p.name = CPU_NAMES.find((n) => !cfg.players.some((q) => q.name === n)) || 'CPU'
  }
}

const valid = computed(() => cfg.players.length >= 2 && cfg.players.every((p) => p.name.trim()))
const hasHuman = computed(() => cfg.players.some((p) => !p.cpu))

function start() {
  sfx('go')
  startBattle({
    players: cfg.players.map((p) => ({ ...p, name: p.name.trim() })),
    mode: cfg.mode,
    rounds: cfg.rounds,
    difficulty: cfg.difficulty,
    challengeMode: cfg.challengeMode,
  })
}
</script>

<template>
  <div class="setup">
    <div class="head">
      <button class="btn small ghost" @click="store.screen = 'home'">← Back</button>
      <h2>Set up your battle</h2>
    </div>

    <section class="panel">
      <h3>Singers <span class="muted">({{ cfg.players.length }}/6)</span></h3>
      <div class="players">
        <div v-for="(p, i) in cfg.players" :key="p.id" class="player" :style="{ '--c': p.color }">
          <div class="swatches">
            <button
              v-for="c in PLAYER_COLORS"
              :key="c"
              class="sw"
              :class="{ on: p.color === c }"
              :style="{ background: c }"
              :aria-label="`Color ${c}`"
              @click="p.color = c"
            ></button>
          </div>
          <input v-model="p.name" maxlength="16" :aria-label="`Singer ${i + 1} name`" />
          <div class="type">
            <button class="seg" :class="{ on: !p.cpu }" @click="p.cpu && toggleCpu(p)">🧑 Human</button>
            <button class="seg" :class="{ on: p.cpu }" @click="!p.cpu && toggleCpu(p)">🤖 CPU</button>
          </div>
          <select v-if="p.cpu" v-model.number="p.skill" aria-label="CPU level">
            <option v-for="l in CPU_LEVELS" :key="l.label" :value="l.skill">{{ l.label }}</option>
          </select>
          <button v-if="cfg.players.length > 2" class="remove" aria-label="Remove singer" @click="cfg.players.splice(i, 1)">✕</button>
          <div class="avatar" aria-hidden="true">{{ p.cpu ? '🤖' : (p.name.trim()[0] || '?').toUpperCase() }}</div>
        </div>
        <button v-if="cfg.players.length < 6" class="add" @click="addPlayer">+ Add singer</button>
      </div>
    </section>

    <section class="panel">
      <h3>Battle mode</h3>
      <div class="cards">
        <button class="card" :class="{ on: cfg.mode === 'turns' }" @click="cfg.mode = 'turns'">
          <div class="ci">🎙️</div>
          <strong>Turn Battle</strong>
          <span>Everyone sings the same song one after another. Best score wins the round.</span>
        </button>
        <button class="card" :class="{ on: cfg.mode === 'duel' }" @click="cfg.mode = 'duel'">
          <div class="ci">⚔️</div>
          <strong>Line Duel</strong>
          <span>One song, lines alternate between singers. Pass the mic fast!</span>
        </button>
      </div>
    </section>

    <div class="grid2">
      <section class="panel">
        <h3>Rounds</h3>
        <div class="segs">
          <button v-for="r in [1, 3, 5]" :key="r" class="seg" :class="{ on: cfg.rounds === r }" @click="cfg.rounds = r">{{ r }}</button>
        </div>
        <h3>Pitch strictness</h3>
        <div class="segs">
          <button
            v-for="(d, k) in DIFFICULTIES"
            :key="k"
            class="seg"
            :class="{ on: cfg.difficulty === k }"
            @click="cfg.difficulty = k"
          >
            {{ d.label }}
          </button>
        </div>
        <h3>Challenges</h3>
        <select v-model="cfg.challengeMode" aria-label="Challenges">
          <option value="random">🎲 Random each round (Golden finale)</option>
          <option value="off">Off — classic karaoke</option>
          <option v-for="c in CHALLENGES.slice(1)" :key="c.id" :value="c.id">Always {{ c.icon }} {{ c.name }}</option>
        </select>
      </section>
      <section class="panel">
        <h3>Mic check</h3>
        <MicCheck v-if="hasHuman" />
        <p v-else class="muted">All CPU battle — sit back and watch the robots sing.</p>
      </section>
    </div>

    <div class="action-bar">
      <button class="btn big" :disabled="!valid" @click="start">🎤 Start the battle</button>
    </div>
  </div>
</template>

<style scoped>
.setup {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 920px;
  margin: 0 auto;
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head h2 {
  margin: 0;
}
h3 {
  margin: 0 0 12px;
  font-size: 1rem;
}
h3:not(:first-child) {
  margin-top: 18px;
}
.players {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}
.player {
  position: relative;
  border-radius: 18px;
  padding: 14px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--c) 18%, transparent), rgb(255 255 255 / 0.03));
  border: 1.5px solid color-mix(in srgb, var(--c) 70%, transparent);
  box-shadow: 0 0 30px -12px var(--c);
  animation: pop-in 0.4s cubic-bezier(0.2, 1.5, 0.4, 1);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
@keyframes pop-in {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
}
.avatar {
  position: absolute;
  top: 12px;
  right: 52px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 900;
  background: var(--c);
  color: #07030f;
}
.swatches {
  display: flex;
  gap: 8px;
  padding-right: 80px;
}
.sw {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid transparent;
  box-shadow: 0 0 10px -2px currentColor;
  padding: 0;
  cursor: pointer;
}
.sw.on {
  border-color: #fff;
}
.type {
  display: flex;
  gap: 6px;
}
.type .seg {
  flex: 1;
}
.remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 44px;
  height: 44px;
  background: none;
  border: 0;
  color: var(--muted);
  cursor: pointer;
  font-size: 1rem;
}
.add {
  border: 2px dashed #ffffff30;
  border-radius: 14px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  min-height: 120px;
}
.add:hover {
  color: #fff;
  border-color: #fff;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.card {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border-radius: 14px;
  border: 2px solid #ffffff18;
  background: #ffffff08;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.card span {
  color: var(--muted);
  font-size: 0.9rem;
}
.card.on {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  box-shadow: 0 0 30px -10px var(--accent);
}
.ci {
  font-size: 1.6rem;
}
.grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 18px;
}
.segs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
select {
  width: 100%;
}

</style>
