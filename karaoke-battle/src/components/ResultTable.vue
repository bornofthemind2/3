<script setup>
defineProps({
  rows: { type: Array, required: true }, // [{ player, res }]
})
</script>

<template>
  <div class="table">
    <div v-for="(row, i) in rows" :key="row.player.id" class="row" :style="{ '--c': row.player.color, animationDelay: i * 0.12 + 's' }">
      <div class="rank">{{ i + 1 }}</div>
      <div class="who">
        <div class="name">{{ row.player.cpu ? '🤖 ' : '' }}{{ row.player.name }}</div>
        <div class="stats">
          {{ row.res.accuracy }}% on pitch · 🔥 {{ row.res.maxCombo }} max combo
          <span v-if="row.res.eliminated" class="out">· 💀 struck out</span>
        </div>
        <div class="ratings">
          <span class="r perfect">{{ row.res.ratings.PERFECT }} Perfect</span>
          <span class="r great">{{ row.res.ratings.GREAT }} Great</span>
          <span class="r good">{{ row.res.ratings.GOOD }} Good</span>
          <span class="r miss">{{ row.res.ratings.MISS }} Miss</span>
        </div>
      </div>
      <div class="score">{{ row.res.score.toLocaleString() }}</div>
    </div>
  </div>
</template>

<style scoped>
.table {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 14px 18px;
  border-radius: 16px;
  background: var(--panel);
  border-left: 5px solid var(--c);
  animation: slide 0.4s backwards;
}
@keyframes slide {
  from {
    transform: translateX(-30px);
    opacity: 0;
  }
}
.rank {
  font-size: 1.6rem;
  font-weight: 900;
  color: var(--muted);
}
.name {
  font-weight: 800;
  color: var(--c);
  font-size: 1.15rem;
}
.stats {
  color: var(--muted);
  font-size: 0.85rem;
}
.out {
  color: #f87171;
}
.ratings {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 6px;
}
.r {
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: #ffffff10;
}
.perfect {
  color: #facc15;
}
.great {
  color: #22d3ee;
}
.good {
  color: #a3e635;
}
.miss {
  color: #f87171;
}
.score {
  font-size: 1.8rem;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 520px) {
  .row {
    grid-template-columns: 28px 1fr;
  }
  .score {
    grid-column: 2;
  }
}
</style>
