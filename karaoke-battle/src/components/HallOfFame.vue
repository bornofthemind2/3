<script setup>
import { ref, computed } from 'vue'
import { store, loadStats, clearStats } from '../game/battle.js'
import { SONGS } from '../game/songs.js'

const stats = ref(loadStats())
const confirming = ref(false)
const singers = computed(() =>
  Object.entries(stats.value.singers)
    .map(([name, s]) => ({ name, ...s }))
    .sort((a, b) => b.wins - a.wins || b.points - a.points),
)

function reset() {
  // Two-step button instead of confirm(), which embedded viewers block.
  if (!confirming.value) {
    confirming.value = true
    return
  }
  confirming.value = false
  clearStats()
  stats.value = loadStats()
}
</script>

<template>
  <div class="hof">
    <div class="head">
      <button class="btn small ghost" @click="store.screen = 'home'">← Back</button>
      <h2>🏆 Hall of Fame</h2>
    </div>
    <p class="muted">{{ stats.battles }} battle{{ stats.battles === 1 ? '' : 's' }} fought on this device.</p>

    <section class="panel">
      <h3>Top singers</h3>
      <p v-if="!singers.length" class="muted">No battles yet. Go start one!</p>
      <div v-else class="scroll">
      <table>
        <thead>
          <tr><th>#</th><th>Singer</th><th>Wins</th><th>Battles</th><th>Best round</th><th>Career points</th></tr>
        </thead>
        <tbody>
          <tr v-for="(s, i) in singers" :key="s.name">
            <td>{{ ['🥇', '🥈', '🥉'][i] || i + 1 }}</td>
            <td class="n">{{ s.name }}</td>
            <td>{{ s.wins }}</td>
            <td>{{ s.battles }}</td>
            <td>{{ s.best.toLocaleString() }}</td>
            <td>{{ s.points.toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </section>

    <section class="panel">
      <h3>Song records</h3>
      <div class="songs">
        <div v-for="song in SONGS" :key="song.id" class="song">
          <div class="t">{{ song.title }}</div>
          <div v-if="stats.songs[song.id]" class="rec">
            {{ stats.songs[song.id].score.toLocaleString() }} — {{ stats.songs[song.id].cpu ? '🤖 ' : '' }}{{ stats.songs[song.id].name }}
          </div>
          <div v-else class="rec muted">Unclaimed</div>
        </div>
      </div>
    </section>

    <div class="foot"><button class="btn small ghost" @click="reset">{{ confirming ? 'Click again to erase all records' : 'Reset records' }}</button></div>
  </div>
</template>

<style scoped>
.hof {
  max-width: 820px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head h2,
h3 {
  margin: 0;
}
h3 {
  margin-bottom: 12px;
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
  padding: 8px;
  text-align: right;
  border-bottom: 1px solid #ffffff10;
}
th:nth-child(-n + 2),
td:nth-child(-n + 2) {
  text-align: left;
}
th {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.85rem;
}
.n {
  font-weight: 700;
}
.songs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}
.song {
  padding: 12px;
  border-radius: 12px;
  background: #ffffff08;
}
.t {
  font-weight: 700;
}
.rec {
  color: #facc15;
  font-size: 0.9rem;
  margin-top: 4px;
}
.rec.muted {
  color: var(--muted);
}
.foot {
  display: flex;
  justify-content: center;
  padding-bottom: 30px;
}
@media (max-width: 560px) {
  th:nth-child(4),
  td:nth-child(4),
  th:nth-child(6),
  td:nth-child(6) {
    display: none;
  }
}
</style>
