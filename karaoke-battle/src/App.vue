<script setup>
import { store, currentSingers, recordPerformance } from './game/battle.js'
import HomeScreen from './components/HomeScreen.vue'
import SetupScreen from './components/SetupScreen.vue'
import RoundIntro from './components/RoundIntro.vue'
import TurnIntro from './components/TurnIntro.vue'
import SingStage from './components/SingStage.vue'
import RoundResults from './components/RoundResults.vue'
import FinalResults from './components/FinalResults.vue'
import HallOfFame from './components/HallOfFame.vue'
import PracticeScreen from './components/PracticeScreen.vue'

// Quitting a song mid-battle goes back to that turn's intro, where it can be restarted.
function quitSong() {
  store.screen = 'turn-intro'
}
</script>

<template>
  <main class="app">
    <HomeScreen v-if="store.screen === 'home'" />
    <SetupScreen v-else-if="store.screen === 'setup'" />
    <PracticeScreen v-else-if="store.screen === 'practice'" />
    <HallOfFame v-else-if="store.screen === 'leaderboard'" />
    <template v-else-if="store.battle">
      <RoundIntro v-if="store.screen === 'round-intro'" :key="'ri' + store.battle.round.number" />
      <TurnIntro v-else-if="store.screen === 'turn-intro'" @start="store.screen = 'sing'" />
      <SingStage
        v-else-if="store.screen === 'sing'"
        :key="`s${store.battle.round.number}-${store.battle.round.turn}`"
        :song="store.battle.round.song"
        :challenge="store.battle.round.challenge"
        :singers="currentSingers()"
        :difficulty="store.battle.difficulty"
        @done="recordPerformance"
        @quit="quitSong"
      />
      <RoundResults v-else-if="store.screen === 'round-results'" />
      <FinalResults v-else-if="store.screen === 'final'" />
    </template>
  </main>
</template>
