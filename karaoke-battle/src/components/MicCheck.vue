<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { mic } from '../audio/mic.js'
import { getAudioContext } from '../audio/engine.js'
import { midiToName } from '../game/music.js'

const ready = ref(mic.ready)
const error = ref(mic.error)
const level = ref(0)
const note = ref(null)
let raf = 0

async function enable() {
  await getAudioContext().resume()
  await mic.start()
  ready.value = mic.ready
  error.value = mic.error
  if (ready.value) tick()
}

function tick() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(tick)
  const r = mic.read()
  level.value = Math.min(1, r.rms * 8)
  if (r.midi != null) note.value = midiToName(r.midi)
}

onMounted(() => ready.value && tick())
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div class="mic-check">
    <template v-if="!ready">
      <button class="btn" @click="enable">🎙️ Enable microphone</button>
      <p class="hint">Needed for human singers. Headphones recommended so the mic only hears you.</p>
      <p v-if="error" class="err">{{ error }}</p>
    </template>
    <template v-else>
      <div class="meter"><div :style="{ width: level * 100 + '%' }"></div></div>
      <div class="detected">
        Sing a note: <strong>{{ note || '…' }}</strong>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mic-check {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.meter {
  height: 10px;
  border-radius: 999px;
  background: #ffffff14;
  overflow: hidden;
}
.meter div {
  height: 100%;
  background: linear-gradient(90deg, #a3e635, #facc15, #f43f5e);
  transition: width 0.05s;
}
.detected strong {
  font-size: 1.3rem;
  color: var(--accent2);
}
.hint {
  color: var(--muted);
  font-size: 0.85rem;
  margin: 0;
}
.err {
  color: #fda4af;
  margin: 0;
}
</style>
