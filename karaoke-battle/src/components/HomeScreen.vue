<script setup>
import { store } from '../game/battle.js'
import { SONGS } from '../game/songs.js'
import { sfx, getAudioContext } from '../audio/engine.js'

function go(screen) {
  getAudioContext().resume()
  sfx('select')
  store.screen = screen
}
</script>

<template>
  <div class="home">
    <div class="hero">
      <div class="mic-logo">🎤</div>
      <h1 class="logo">KARAOKE <span>BATTLE</span></h1>
      <p class="tag">Grab the mic, pick a song, survive the challenge. Highest score takes the crown.</p>
      <div class="actions">
        <button class="btn big" @click="go('setup')">⚔️ New Battle</button>
        <button class="btn big ghost" @click="go('practice')">🎧 Practice</button>
        <button class="btn big ghost" @click="go('leaderboard')">🏆 Hall of Fame</button>
      </div>
    </div>

    <div class="how">
      <div class="step">
        <div class="n">1</div>
        <h3>Assemble singers</h3>
        <p>2–6 friends sharing one mic, or challenge CPU rivals from Shower Singer to Legend.</p>
      </div>
      <div class="step">
        <div class="n">2</div>
        <h3>Face the challenge</h3>
        <p>Each round rolls a twist: Speed Demon, Key Change, Blind Notes, Three Strikes, Golden Round…</p>
      </div>
      <div class="step">
        <div class="n">3</div>
        <h3>Hit the notes</h3>
        <p>Real-time pitch detection scores every note. Chain combos and nail PERFECT lines for bonuses.</p>
      </div>
    </div>
    <p class="foot">{{ SONGS.length }} public-domain songs with a live synthesized backing band · works best with headphones</p>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px;
  padding-top: 6vh;
}
.hero {
  text-align: center;
}
.mic-logo {
  font-size: 4rem;
  animation: bob 2.4s ease-in-out infinite;
}
@keyframes bob {
  50% {
    transform: translateY(-8px) rotate(-8deg);
  }
}
.logo {
  font-size: clamp(2.6rem, 9vw, 5.5rem);
  font-weight: 900;
  letter-spacing: 0.04em;
  margin: 8px 0;
  line-height: 1;
  text-shadow: 0 0 30px var(--accent);
}
.logo span {
  color: var(--accent2);
  text-shadow: 0 0 30px var(--accent2);
}
.tag {
  color: var(--muted);
  font-size: 1.1rem;
  max-width: 520px;
  margin: 12px auto 28px;
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.how {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  width: 100%;
  max-width: 900px;
}
.step {
  background: var(--panel);
  border-radius: 18px;
  padding: 20px;
  border: 1px solid #ffffff10;
}
.step h3 {
  margin: 10px 0 6px;
}
.step p {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.n {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 900;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
}
.foot {
  color: var(--muted);
  font-size: 0.85rem;
  text-align: center;
}
</style>
