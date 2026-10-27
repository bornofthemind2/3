// Battle state machine shared by all screens.

import { reactive } from 'vue'
import { SONGS, getSong } from './songs.js'

export const CHALLENGES = [
  { id: 'classic', name: 'Classic', icon: '🎤', desc: 'No tricks. Just sing your heart out.' },
  { id: 'speed', name: 'Speed Demon', icon: '⚡', desc: 'The band plays 25% faster.', speed: 1.25 },
  { id: 'key', name: 'Key Change', icon: '🎹', desc: 'Song is transposed up 3 semitones.', transpose: 3 },
  { id: 'noguide', name: 'No Guide Vocals', icon: '🙊', desc: 'The guide melody is muted. You\'re on your own.', guide: 0 },
  { id: 'blind', name: 'Blind Notes', icon: '🙈', desc: 'The pitch lane is hidden — sing by ear.', blind: true },
  { id: 'memory', name: 'Lyric Memory', icon: '🧠', desc: 'Upcoming lyrics are hidden until you sing them.', memory: true },
  { id: 'strikes', name: 'Three Strikes', icon: '💀', desc: 'Miss three lines and you\'re out for the rest of the song.', strikes: 3 },
  { id: 'golden', name: 'Golden Round', icon: '👑', desc: 'All points count double this round!', multiplier: 2 },
]

export function getChallenge(id) {
  return CHALLENGES.find((c) => c.id === id) || CHALLENGES[0]
}

export const PLAYER_COLORS = ['#ff3d9a', '#22d3ee', '#facc15', '#a3e635', '#c084fc', '#fb923c']

export const CPU_LEVELS = [
  { label: 'Shower Singer', skill: 0.35 },
  { label: 'Pub Star', skill: 0.6 },
  { label: 'Idol', skill: 0.8 },
  { label: 'Legend', skill: 0.95 },
]

export const store = reactive({
  screen: 'home',
  battle: null,
  practice: null,
})

let nextId = 1

export function makePlayer(i, overrides = {}) {
  return {
    id: `p${nextId++}`,
    name: `Singer ${i + 1}`,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    cpu: false,
    skill: CPU_LEVELS[1].skill,
    ...overrides,
  }
}

export function startBattle(config) {
  store.battle = {
    ...config,
    players: config.players.map((p) => ({ ...p, total: 0, roundScores: [] })),
    roundIndex: 0,
    round: null,
    history: [],
  }
  store.practice = null
  beginRound()
}

function pickChallenge(battle) {
  if (battle.challengeMode === 'off') return CHALLENGES[0]
  if (battle.challengeMode !== 'random') return getChallenge(battle.challengeMode)
  // Final round of a 3+ round battle is always golden for a dramatic finish.
  if (battle.rounds >= 3 && battle.roundIndex === battle.rounds - 1) return getChallenge('golden')
  const pool = CHALLENGES.filter((c) => c.id !== 'golden')
  const used = new Set(battle.history.map((h) => h.challenge.id))
  const fresh = pool.filter((c) => !used.has(c.id))
  const from = fresh.length ? fresh : pool
  return from[Math.floor(Math.random() * from.length)]
}

export function beginRound() {
  const b = store.battle
  const n = b.players.length
  // Rotate who goes first each round so nobody always opens.
  const order = b.players.map((_, i) => b.players[(i + b.roundIndex) % n].id)
  b.round = {
    number: b.roundIndex + 1,
    challenge: pickChallenge(b),
    song: null,
    order,
    turn: 0,
    results: {},
  }
  store.screen = 'round-intro'
}

export function randomSongId(exclude = []) {
  const pool = SONGS.filter((s) => !exclude.includes(s.id))
  const from = pool.length ? pool : SONGS
  return from[Math.floor(Math.random() * from.length)].id
}

export function chooseSong(songId) {
  store.battle.round.song = getSong(songId)
  store.screen = 'turn-intro'
}

/** Players singing in the current performance, in line order. */
export function currentSingers() {
  const b = store.battle
  const r = b.round
  const byId = (id) => b.players.find((p) => p.id === id)
  if (b.mode === 'duel') return r.order.map(byId)
  return [byId(r.order[r.turn])]
}

export function recordPerformance(results) {
  const b = store.battle
  const r = b.round
  const mult = r.challenge.multiplier || 1
  for (const [id, res] of Object.entries(results)) {
    r.results[id] = { ...res, score: res.score * mult }
  }
  if (b.mode === 'turns' && r.turn < r.order.length - 1) {
    r.turn++
    store.screen = 'turn-intro'
    return
  }
  for (const p of b.players) {
    const s = r.results[p.id]?.score || 0
    p.roundScores.push(s)
    p.total += s
  }
  b.history.push({ number: r.number, song: r.song, challenge: r.challenge, results: r.results })
  store.screen = 'round-results'
}

export function nextRound() {
  const b = store.battle
  b.roundIndex++
  if (b.roundIndex >= b.rounds) {
    saveBattleStats(b)
    store.screen = 'final'
  } else beginRound()
}

export function standings(battle = store.battle) {
  return [...battle.players].sort((a, b) => b.total - a.total)
}

// ---- Persistent hall of fame -------------------------------------------

const STATS_KEY = 'karaoke-battle.stats.v1'

export function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* storage unavailable */
  }
  return { singers: {}, songs: {}, battles: 0 }
}

function writeStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {
    /* storage unavailable */
  }
}

export function clearStats() {
  writeStats({ singers: {}, songs: {}, battles: 0 })
}

function recordSongBest(stats, songId, name, score, cpu) {
  const best = stats.songs[songId]
  if (!best || score > best.score) stats.songs[songId] = { name, score, cpu, date: Date.now() }
}

function saveBattleStats(battle) {
  const stats = loadStats()
  stats.battles++
  const ranking = standings(battle)
  const winners = ranking.filter((p) => p.total === ranking[0].total)
  for (const p of battle.players) {
    const key = p.cpu ? `🤖 ${p.name}` : p.name
    const s = (stats.singers[key] ||= { battles: 0, wins: 0, points: 0, best: 0 })
    s.battles++
    s.points += p.total
    if (winners.includes(p)) s.wins++
    s.best = Math.max(s.best, ...p.roundScores)
  }
  for (const h of battle.history) {
    for (const p of battle.players) {
      const res = h.results[p.id]
      if (res) recordSongBest(stats, h.song.id, p.name, Math.round(res.score / (h.challenge.multiplier || 1)), p.cpu)
    }
  }
  writeStats(stats)
}

export function savePracticeScore(songId, name, score) {
  const stats = loadStats()
  recordSongBest(stats, songId, name, score, false)
  writeStats(stats)
}
