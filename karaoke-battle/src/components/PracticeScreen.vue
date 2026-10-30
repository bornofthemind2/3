<script setup>
import { ref, reactive } from 'vue'
import { store, CHALLENGES, savePracticeScore, PLAYER_COLORS } from '../game/battle.js'
import { SONGS, songStars } from '../game/songs.js'
import { parseSong } from '../game/music.js'
import { DIFFICULTIES } from '../game/scoring.js'
import { getAudioContext, sfx } from '../audio/engine.js'
import MicCheck from './MicCheck.vue'
import SingStage from './SingStage.vue'
import ResultTable from './ResultTable.vue'

const opts = reactive({ name: 'Me', difficulty: 'easy', challenge: 'classic' })
const phase = ref('pick') // pick | sing | result
const song = ref(null)
const result = ref(null)
const runKey = ref(0)
const player = { id: 'solo', name: 'Me', color: PLAYER_COLORS[0], cpu: false }

const songs = SONGS.map((s) => ({ ...s, stars: songStars(parseSong(s), s) }))

function sing(s) {
  getAudioContext().resume()
  sfx('go')
  song.value = s
  player.name = opts.name.trim() || 'Me'
  runKey.value++
  phase.value = 'sing'
}

function done(res) {
  result.value = res.solo
  savePracticeScore(song.value.id, player.name, res.solo.score)
  phase.value = 'result'
}
</script>

<template>
  <div v-if="phase === 'pick'" class="practice">
    <div class="head">
      <button class="btn small ghost" @click="store.screen = 'home'">← Back</button>
      <h2>🎧 Practice</h2>
    </div>
    <div class="grid2">
      <section class="panel">
        <label>Your name <input v-model="opts.name" maxlength="16" /></label>
        <label>
          Pitch strictness
          <select v-model="opts.difficulty">
            <option v-for="(d, k) in DIFFICULTIES" :key="k" :value="k">{{ d.label }}</option>
          </select>
        </label>
        <label>
          Challenge
          <select v-model="opts.challenge">
            <option v-for="c in CHALLENGES" :key="c.id" :value="c.id">{{ c.icon }} {{ c.name }}</option>
          </select>
        </label>
      </section>
      <section class="panel"><MicCheck /></section>
    </div>
    <div class="songs">
      <button v-for="s in songs" :key="s.id" class="song" @click="sing(s)">
        <div class="s-title">{{ s.title }}</div>
        <div class="s-artist">{{ s.artist }} · <span class="stars">{{ '★'.repeat(s.stars) }}</span></div>
      </button>
    </div>
  </div>

  <SingStage
    v-else-if="phase === 'sing'"
    :key="runKey"
    :song="song"
    :challenge="CHALLENGES.find((c) => c.id === opts.challenge)"
    :singers="[player]"
    :difficulty="opts.difficulty"
    @done="done"
    @quit="phase = 'pick'"
  />

  <div v-else class="practice result">
    <h2>{{ song.title }}</h2>
    <ResultTable :rows="[{ player, res: result }]" />
    <div class="action-bar">
      <button class="btn big" @click="sing(song)">🔁 Sing again</button>
      <button class="btn big ghost" @click="phase = 'pick'">🎵 Another song</button>
    </div>
  </div>
</template>

<style scoped>
.practice {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.head {
  display: flex;
  gap: 14px;
  align-items: center;
}
h2 {
  margin: 0;
}
.grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-weight: 600;
}
.songs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
  padding-bottom: 30px;
}
.song {
  text-align: left;
  padding: 16px;
  border-radius: 18px;
  border: 1.5px solid var(--line);
  background: var(--glass);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  transition: transform 0.15s, border-color 0.2s;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
@media (hover: hover) {
  .song:hover {
    border-color: var(--accent);
  }
}
.song:active {
  transform: scale(0.97);
}
.s-title {
  font-weight: 800;
}
.s-artist {
  color: var(--muted);
  font-size: 0.85rem;
}
.stars {
  color: #facc15;
}
.result h2 {
  text-align: center;
}
.actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
</style>
