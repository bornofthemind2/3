<script setup>
import { store } from '../game/battle.js'
import { SONGS } from '../game/songs.js'
import { sfx, getAudioContext } from '../audio/engine.js'

function go(screen) {
  getAudioContext().resume()
  sfx('select')
  store.screen = screen
}

const bars = Array.from({ length: 24 }, (_, i) => ({ delay: -((i * 137) % 900) / 1000, hue: i / 23 }))
const features = [
  { icon: '👥', title: 'Up to 6 singers', text: 'Friends sharing one mic, or CPU rivals from Shower Singer to Legend.' },
  { icon: '🎲', title: 'Round challenges', text: 'Speed Demon, Key Change, Blind Notes, Three Strikes, Golden Round and more.' },
  { icon: '🎯', title: 'Live pitch scoring', text: 'Every note is judged as you sing. Chain combos and nail PERFECT lines.' },
]
</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="stage-lights" aria-hidden="true">
        <div class="eq">
          <i v-for="(b, i) in bars" :key="i" :style="{ animationDelay: b.delay + 's', '--h': b.hue }"></i>
        </div>
        <div class="mic">🎤</div>
      </div>
      <h1 class="logo">
        <span class="l1">KARAOKE</span>
        <span class="l2 shine">BATTLE</span>
      </h1>
      <p class="tag">Grab the mic, pick a song, survive the challenge. Highest score takes the crown.</p>
      <div class="actions">
        <button class="btn big" @click="go('setup')">⚔️ New Battle</button>
        <button class="btn big ghost" @click="go('practice')">🎧 Practice</button>
        <button class="btn big ghost" @click="go('leaderboard')">🏆 Hall of Fame</button>
      </div>
    </section>

    <section class="features">
      <div v-for="(f, i) in features" :key="f.title" class="feature panel" :style="{ animationDelay: 0.15 + i * 0.1 + 's' }">
        <div class="f-icon">{{ f.icon }}</div>
        <div>
          <h3>{{ f.title }}</h3>
          <p>{{ f.text }}</p>
        </div>
      </div>
    </section>
    <p class="foot">{{ SONGS.length }} public-domain songs · live synthesized band · best with headphones</p>
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(28px, 6vh, 56px);
  padding-top: clamp(8px, 4vh, 48px);
}
.hero {
  text-align: center;
  width: 100%;
}
.stage-lights {
  position: relative;
  height: clamp(110px, 18vh, 150px);
  display: grid;
  place-items: center;
}
.eq {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(3px, 0.8vw, 6px);
}
.eq i {
  width: clamp(4px, 1vw, 7px);
  height: 30%;
  border-radius: 99px;
  background: color-mix(in oklch, var(--accent) calc((1 - var(--h)) * 100%), var(--accent2));
  box-shadow: 0 0 14px color-mix(in oklch, var(--accent) calc((1 - var(--h)) * 100%), var(--accent2));
  animation: eq 0.9s ease-in-out infinite alternate;
  opacity: 0.75;
}
@keyframes eq {
  0% {
    height: 12%;
  }
  50% {
    height: 70%;
  }
  100% {
    height: 28%;
  }
}
.mic {
  position: relative;
  font-size: clamp(3.4rem, 10vw, 4.6rem);
  filter: drop-shadow(0 0 24px var(--accent));
  animation: bob 2.4s ease-in-out infinite;
}
@keyframes bob {
  50% {
    transform: translateY(-8px) rotate(-8deg);
  }
}
.logo {
  margin: 10px 0 0;
  display: flex;
  flex-direction: column;
  line-height: 0.95;
  font-weight: 900;
}
.l1 {
  font-size: clamp(2.2rem, 11vw, 5.2rem);
  letter-spacing: 0.08em;
  color: #fff;
  text-shadow: 0 0 18px var(--accent), 0 0 48px var(--accent);
}
.l2 {
  font-size: clamp(2.8rem, 14vw, 6.6rem);
  letter-spacing: 0.04em;
  filter: drop-shadow(0 0 22px rgb(34 211 238 / 0.5));
}
.tag {
  color: var(--muted);
  font-size: clamp(1rem, 2.8vw, 1.15rem);
  max-width: 34ch;
  margin: 18px auto 26px;
}
.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 14px;
  width: 100%;
  max-width: 960px;
}
.feature {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  animation: up 0.6s cubic-bezier(0.2, 1, 0.3, 1) backwards;
}
@keyframes up {
  from {
    transform: translateY(16px);
    opacity: 0.2;
  }
}
.f-icon {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 1.3rem;
  background: linear-gradient(135deg, rgb(255 61 154 / 0.3), rgb(34 211 238 / 0.3));
  border: 1px solid var(--line);
}
.feature h3 {
  margin: 2px 0 4px;
}
.feature p {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.foot {
  color: var(--muted);
  font-size: 0.85rem;
  text-align: center;
  margin: 0;
}
@media (max-width: 640px) {
  .actions {
    flex-direction: column;
    max-width: 360px;
    margin: 0 auto;
  }
}
</style>
