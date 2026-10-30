<script setup>
import { computed, onMounted } from 'vue'
import { store, standings, startBattle } from '../game/battle.js'
import { sfx } from '../audio/engine.js'
import { confetti } from '../fx/particles.js'
import { vibrate } from '../fx/device.js'

const b = store.battle
const ranking = computed(() => standings(b))
const champs = computed(() => ranking.value.filter((p) => p.total === ranking.value[0].total))
const podium = computed(() => {
  const [a, bb, c] = ranking.value
  return [bb, a, c].filter(Boolean)
})

function rematch() {
  startBattle({
    players: b.players.map(({ id, name, color, cpu, skill }) => ({ id, name, color, cpu, skill })),
    mode: b.mode,
    rounds: b.rounds,
    difficulty: b.difficulty,
    challengeMode: b.challengeMode,
  })
}

onMounted(() => {
  sfx('win')
  vibrate([30, 50, 30, 50, 120])
  const colors = [...b.players.map((p) => p.color), '#facc15', '#ffffff']
  confetti(colors)
  setTimeout(() => confetti(colors, 90), 1400)
})
</script>

<template>
  <div class="final">
    <div class="crown">👑</div>
    <h1>
      <template v-if="champs.length > 1">Shared crown!</template>
      <template v-else>
        <span :style="{ color: champs[0].color, textShadow: `0 0 30px ${champs[0].color}` }">{{ champs[0].name }}</span>
      </template>
    </h1>
    <p class="muted">{{ champs.length > 1 ? champs.map((p) => p.name).join(' & ') + ' tie for the win' : 'is the Karaoke Battle champion!' }}</p>

    <div class="podium">
      <div v-for="p in podium" :key="p.id" class="step" :class="'place' + (ranking.indexOf(p) + 1)" :style="{ '--c': p.color }">
        <div class="pname">{{ p.cpu ? '🤖 ' : '' }}{{ p.name }}</div>
        <div class="ptotal">{{ p.total.toLocaleString() }}</div>
        <div class="block">{{ ranking.indexOf(p) + 1 }}</div>
      </div>
    </div>

    <section class="panel">
      <h3>Scorecard</h3>
      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Singer</th>
              <th v-for="h in b.history" :key="h.number" :title="h.song.title">R{{ h.number }} {{ h.challenge.icon }}</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in ranking" :key="p.id">
              <td :style="{ color: p.color, fontWeight: 700 }">{{ p.name }}</td>
              <td v-for="(s, i) in p.roundScores" :key="i">{{ s.toLocaleString() }}</td>
              <td class="tot">{{ p.total.toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="action-bar">
      <button class="btn big" @click="rematch">🔁 Rematch</button>
      <button class="btn big ghost" @click="store.screen = 'setup'">⚙️ New setup</button>
      <button class="btn big ghost" @click="store.screen = 'leaderboard'">🏆 Hall of Fame</button>
    </div>
  </div>
</template>

<style scoped>
.final {
  max-width: 820px;
  margin: 0 auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
}
.crown {
  font-size: 4rem;
  animation: bob 2s ease-in-out infinite;
}
@keyframes bob {
  50% {
    transform: translateY(-10px);
  }
}
h1 {
  font-size: clamp(2rem, 9vw, 4.5rem);
  margin: 0;
  overflow-wrap: anywhere;
}
.podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 10px;
  margin: 20px 0;
  width: 100%;
}
.step {
  flex: 0 1 180px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.pname {
  font-weight: 800;
  color: var(--c);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: clamp(0.8rem, 3vw, 1rem);
}
.ptotal {
  font-variant-numeric: tabular-nums;
}
.block {
  width: 100%;
  font-family: var(--font-display);
  box-shadow: 0 0 40px -10px var(--c);
  border-radius: 14px 14px 0 0;
  background: linear-gradient(180deg, var(--c), color-mix(in srgb, var(--c) 30%, #0b0618));
  font-size: 2.4rem;
  font-weight: 900;
  color: #0b0618;
  display: grid;
  place-items: center;
  animation: grow 0.8s cubic-bezier(0.3, 1.4, 0.5, 1) backwards;
}
.place1 .block {
  height: clamp(120px, 22vh, 170px);
  animation-delay: 0.6s;
}
.place2 .block {
  height: clamp(85px, 15vh, 120px);
  animation-delay: 0.3s;
}
.place3 .block {
  height: clamp(60px, 11vh, 85px);
}
@keyframes grow {
  from {
    transform: scaleY(0);
    transform-origin: bottom;
  }
}
.panel {
  width: 100%;
  text-align: left;
}
.panel h3 {
  margin: 0 0 10px;
}
.scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}
th,
td {
  padding: 8px 10px;
  text-align: right;
  border-bottom: 1px solid #ffffff10;
  white-space: nowrap;
}
th:first-child,
td:first-child {
  text-align: left;
}
th {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.85rem;
}
.tot {
  font-weight: 900;
}
</style>
