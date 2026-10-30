<script setup>
import { computed } from 'vue'
import { store, currentSingers } from '../game/battle.js'
import { getAudioContext, sfx } from '../audio/engine.js'

const emit = defineEmits(['start'])
const b = store.battle
const r = b.round
const singers = computed(currentSingers)
const turnLabel = computed(() => (b.mode === 'duel' ? 'LINE DUEL' : `TURN ${r.turn + 1} of ${r.order.length}`))

function go() {
  getAudioContext().resume()
  sfx('go')
  emit('start')
}
</script>

<template>
  <div class="turn">
    <div class="label">{{ turnLabel }}</div>
    <div class="song">{{ r.song.title }} · {{ r.challenge.icon }} {{ r.challenge.name }}</div>

    <div v-if="b.mode === 'duel'" class="vs">
      <template v-for="(s, i) in singers" :key="s.id">
        <span v-if="i" class="x">VS</span>
        <span class="name" :style="{ color: s.color, textShadow: `0 0 30px ${s.color}` }">{{ s.cpu ? '🤖 ' : '' }}{{ s.name }}</span>
      </template>
    </div>
    <div v-else class="up">
      <div class="next">Up next</div>
      <div class="name" :style="{ color: singers[0].color, textShadow: `0 0 40px ${singers[0].color}` }">
        {{ singers[0].cpu ? '🤖 ' : '' }}{{ singers[0].name }}
      </div>
    </div>

    <p class="hint">
      <template v-if="b.mode === 'duel'">Lines are color-coded — sing only when it's your color. Pass the mic between lines!</template>
      <template v-else-if="singers[0].cpu">The CPU is warming up its circuits…</template>
      <template v-else>Pass the mic to {{ singers[0].name }}. Space pauses, Esc quits.</template>
    </p>
    <div class="rings" aria-hidden="true" :style="{ '--c': singers[0].color }"><i></i><i></i><i></i></div>
    <button class="btn big" @click="go">{{ singers.every((s) => s.cpu) ? '▶ Watch' : '🎤 I\'m ready!' }}</button>
  </div>
</template>

<style scoped>
.turn {
  position: relative;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding-top: 10vh;
}
.label {
  letter-spacing: 0.3em;
  color: var(--muted);
  font-weight: 800;
}
.song {
  font-size: 1.1rem;
}
.next {
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.2em;
}
.name {
  font-family: var(--font-display);
  font-size: clamp(2.2rem, 10vw, 5rem);
  overflow-wrap: anywhere;
  font-weight: 900;
  animation: zoom 0.5s cubic-bezier(0.3, 1.6, 0.5, 1);
}
.vs {
  display: flex;
  gap: 18px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}
.vs .name {
  font-size: clamp(2rem, 6vw, 3.6rem);
}
.x {
  font-weight: 900;
  color: var(--muted);
  font-size: 1.4rem;
}
@keyframes zoom {
  from {
    transform: scale(0.3);
    opacity: 0;
  }
}
.hint {
  color: var(--muted);
  max-width: 460px;
}
.rings {
  position: absolute;
  left: 50%;
  top: 40%;
  z-index: -1;
  pointer-events: none;
}
.rings i {
  position: absolute;
  width: 220px;
  height: 220px;
  margin: -110px;
  border-radius: 50%;
  border: 2px solid var(--c);
  box-shadow: 0 0 30px var(--c), inset 0 0 30px var(--c);
  animation: ring 2.4s ease-out infinite;
  opacity: 0;
}
.rings i:nth-child(2) {
  animation-delay: 0.8s;
}
.rings i:nth-child(3) {
  animation-delay: 1.6s;
}
@keyframes ring {
  0% {
    transform: scale(0.3);
    opacity: 0.8;
  }
  100% {
    transform: scale(2.4);
    opacity: 0;
  }
}
@media (max-width: 640px) {
  .turn .btn {
    width: 100%;
    max-width: 360px;
  }
}
</style>
