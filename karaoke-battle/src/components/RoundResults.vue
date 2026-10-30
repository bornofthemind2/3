<script setup>
import { computed, onMounted } from 'vue'
import { store, nextRound, standings } from '../game/battle.js'
import { sfx } from '../audio/engine.js'
import ResultTable from './ResultTable.vue'
import { burst } from '../fx/particles.js'

const b = store.battle
const r = b.round
const rows = computed(() =>
  b.players.map((player) => ({ player, res: r.results[player.id] })).sort((x, y) => y.res.score - x.res.score),
)
const tie = computed(() => rows.value.length > 1 && rows.value[0].res.score === rows.value[1].res.score)
const totals = computed(() => standings(b))
const maxTotal = computed(() => Math.max(1, ...b.players.map((p) => p.total)))
const last = b.roundIndex >= b.rounds - 1

onMounted(() => {
  sfx('win')
  if (!tie.value) burst(innerWidth / 2, innerHeight * 0.18, [rows.value[0].player.color, '#facc15', '#ffffff'], 60)
})
</script>

<template>
  <div class="results">
    <div class="label">ROUND {{ r.number }} RESULTS</div>
    <h2 v-if="tie">It's a tie!</h2>
    <h2 v-else>
      <span :style="{ color: rows[0].player.color }">{{ rows[0].player.name }}</span> wins the round!
    </h2>
    <p class="muted">{{ r.song.title }} · {{ r.challenge.icon }} {{ r.challenge.name }}<span v-if="r.challenge.multiplier"> (scores doubled)</span></p>

    <ResultTable :rows="rows" />

    <section v-if="b.rounds > 1" class="panel standings">
      <h3>Battle standings</h3>
      <div v-for="p in totals" :key="p.id" class="bar-row">
        <span class="bn" :style="{ color: p.color }">{{ p.name }}</span>
        <div class="bar"><div :style="{ width: (p.total / maxTotal) * 100 + '%', background: p.color }"></div></div>
        <span class="bt">{{ p.total.toLocaleString() }}</span>
      </div>
    </section>

    <div class="action-bar">
      <button class="btn big" @click="nextRound">{{ last ? '🏆 Final results' : `▶ Round ${r.number + 1}` }}</button>
    </div>
  </div>
</template>

<style scoped>
.results {
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.label {
  letter-spacing: 0.3em;
  color: var(--muted);
  font-weight: 800;
  text-align: center;
}
h2 {
  text-align: center;
  font-size: clamp(1.4rem, 6vw, 2rem);
  margin: 0;
}
.muted {
  text-align: center;
  margin: 0 0 8px;
}
.standings h3 {
  margin: 0 0 12px;
}
.bar-row {
  display: grid;
  grid-template-columns: minmax(0, 90px) 1fr auto;
  gap: 10px;
  align-items: center;
  margin: 6px 0;
}
.bn {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar {
  height: 12px;
  background: #ffffff10;
  border-radius: 999px;
  overflow: hidden;
}
.bar div {
  height: 100%;
  border-radius: 999px;
  box-shadow: 0 0 12px currentColor;
  animation: fill 1.1s cubic-bezier(0.2, 1, 0.3, 1) backwards 0.3s;
}
@keyframes fill {
  from {
    width: 0 !important;
  }
}
.bt {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

</style>
