<script setup>
import { ref, computed, onMounted } from 'vue'
import { store, chooseSong, randomSongId } from '../game/battle.js'
import { SONGS, songStars } from '../game/songs.js'
import { parseSong } from '../game/music.js'
import { sfx } from '../audio/engine.js'

const b = store.battle
const r = b.round
const revealed = ref(false)
const spinning = ref(false)
const highlight = ref(null)

const picker = computed(() => b.players.find((p) => p.id === r.order[0]))
const playedIds = b.history.map((h) => h.song.id)

const songs = SONGS.map((s) => {
  const p = parseSong(s)
  return { ...s, stars: songStars(p, s), seconds: Math.round((p.totalBeats * 60) / s.bpm) }
})

onMounted(() => {
  setTimeout(() => {
    revealed.value = true
    sfx('go')
  }, 700)
  // CPU pickers choose at random automatically.
  if (picker.value.cpu) setTimeout(spin, 1800)
})

function pick(id) {
  if (spinning.value) return
  sfx('select')
  chooseSong(id)
}

function spin() {
  if (spinning.value) return
  spinning.value = true
  const target = randomSongId(playedIds)
  const order = songs.map((s) => s.id)
  // Two full laps around the grid, slowing down, landing on the target.
  const steps = order.length * 2 + order.indexOf(target) + 1
  let i = 0
  const step = () => {
    highlight.value = order[i % order.length]
    sfx('select')
    i++
    if (i < steps) setTimeout(step, 50 + i * 8)
    else
      setTimeout(() => {
        spinning.value = false
        chooseSong(target)
      }, 700)
  }
  step()
}
</script>

<template>
  <div class="intro">
    <div class="round-no">ROUND {{ r.number }} <span>of {{ b.rounds }}</span></div>

    <div class="challenge" :class="{ revealed }">
      <div class="flip">
        <div class="face back">?</div>
        <div class="face front">
          <div class="c-icon">{{ r.challenge.icon }}</div>
          <div class="c-name">{{ r.challenge.name }}</div>
          <div class="c-desc">{{ r.challenge.desc }}</div>
        </div>
      </div>
    </div>

    <div class="pick-head">
      <h2>
        <span :style="{ color: picker.color }">{{ picker.name }}</span> picks the song
      </h2>
      <button class="btn" :disabled="spinning" @click="spin">🎲 Random</button>
    </div>

    <div class="songs">
      <button
        v-for="s in songs"
        :key="s.id"
        class="song"
        :class="{ hl: highlight === s.id, played: playedIds.includes(s.id) }"
        :disabled="spinning || picker.cpu"
        @click="pick(s.id)"
      >
        <div class="s-title">{{ s.title }}</div>
        <div class="s-artist">{{ s.artist }}</div>
        <div class="s-meta">
          <span>{{ '★'.repeat(s.stars) }}<span class="dim">{{ '★'.repeat(3 - s.stars) }}</span></span>
          <span>{{ s.seconds }}s · {{ s.bpm }} bpm</span>
        </div>
        <div v-if="playedIds.includes(s.id)" class="tag">sung</div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.intro {
  max-width: 980px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
  align-items: center;
}
.round-no {
  font-size: 2.6rem;
  font-weight: 900;
  letter-spacing: 0.06em;
}
.round-no span {
  font-size: 1.2rem;
  color: var(--muted);
}
.challenge {
  perspective: 900px;
  width: min(420px, 100%);
  height: 190px;
}
.flip {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.8s cubic-bezier(0.3, 1.4, 0.5, 1);
  transform-style: preserve-3d;
}
.challenge.revealed .flip {
  transform: rotateY(180deg);
}
.face {
  position: absolute;
  inset: 0;
  border-radius: 20px;
  backface-visibility: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 18px;
  text-align: center;
}
.back {
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  font-size: 5rem;
  font-weight: 900;
}
.front {
  transform: rotateY(180deg);
  background: var(--panel);
  border: 2px solid var(--accent2);
  box-shadow: 0 0 40px color-mix(in srgb, var(--accent2) 35%, transparent);
}
.c-icon {
  font-size: 2.6rem;
}
.c-name {
  font-size: 1.6rem;
  font-weight: 900;
}
.c-desc {
  color: var(--muted);
}
.pick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  flex-wrap: wrap;
}
.pick-head h2 {
  margin: 0;
}
.songs {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
  padding-bottom: 30px;
}
.song {
  position: relative;
  text-align: left;
  padding: 16px;
  border-radius: 16px;
  border: 2px solid #ffffff14;
  background: var(--panel);
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition: transform 0.12s, border-color 0.12s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.song:hover:not(:disabled) {
  transform: translateY(-3px);
  border-color: var(--accent);
}
.song:disabled {
  cursor: default;
}
.song.hl {
  border-color: var(--accent2);
  transform: scale(1.04);
  box-shadow: 0 0 30px color-mix(in srgb, var(--accent2) 45%, transparent);
}
.song.played {
  opacity: 0.6;
}
.s-title {
  font-weight: 800;
}
.s-artist {
  color: var(--muted);
  font-size: 0.85rem;
}
.s-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #facc15;
  margin-top: 6px;
}
.s-meta span:last-child {
  color: var(--muted);
}
.dim {
  opacity: 0.25;
}
.tag {
  position: absolute;
  top: 10px;
  right: 10px;
  font-size: 0.7rem;
  background: #ffffff18;
  padding: 2px 8px;
  border-radius: 999px;
}
</style>
