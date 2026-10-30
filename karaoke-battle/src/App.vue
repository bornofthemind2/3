<script setup>
import { ref, watch, onMounted } from 'vue'
import { store, currentSingers, recordPerformance } from './game/battle.js'
import { startBackground } from './fx/background.js'
import { withTransition } from './fx/device.js'
import HomeScreen from './components/HomeScreen.vue'
import SetupScreen from './components/SetupScreen.vue'
import RoundIntro from './components/RoundIntro.vue'
import TurnIntro from './components/TurnIntro.vue'
import SingStage from './components/SingStage.vue'
import RoundResults from './components/RoundResults.vue'
import FinalResults from './components/FinalResults.vue'
import HallOfFame from './components/HallOfFame.vue'
import PracticeScreen from './components/PracticeScreen.vue'

const bg = ref(null)
// The rendered screen trails store.screen so each change can animate.
const view = ref(store.screen)
watch(
  () => store.screen,
  (s) => {
    const show = () => {
      view.value = s
      window.scrollTo(0, 0)
    }
    // Leaving the stage must be immediate: by now the next turn's state is
    // already set, and a lingering stage would re-key and start that song.
    if (view.value === 'sing') show()
    else withTransition(show)
  },
)

// Quitting a song mid-battle goes back to that turn's intro, where it can be restarted.
function quitSong() {
  store.screen = 'turn-intro'
}

onMounted(() => startBackground(bg.value))
</script>

<template>
  <canvas ref="bg" class="backdrop" aria-hidden="true"></canvas>
  <main class="app">
    <HomeScreen v-if="view === 'home'" />
    <SetupScreen v-else-if="view === 'setup'" />
    <PracticeScreen v-else-if="view === 'practice'" />
    <HallOfFame v-else-if="view === 'leaderboard'" />
    <template v-else-if="store.battle">
      <RoundIntro v-if="view === 'round-intro'" :key="'ri' + store.battle.round.number" />
      <TurnIntro v-else-if="view === 'turn-intro'" @start="store.screen = 'sing'" />
      <SingStage
        v-else-if="view === 'sing'"
        :key="`s${store.battle.round.number}-${store.battle.round.turn}`"
        :song="store.battle.round.song"
        :challenge="store.battle.round.challenge"
        :singers="currentSingers()"
        :difficulty="store.battle.difficulty"
        @done="recordPerformance"
        @quit="quitSong"
      />
      <RoundResults v-else-if="view === 'round-results'" />
      <FinalResults v-else-if="view === 'final'" />
    </template>
  </main>
</template>
