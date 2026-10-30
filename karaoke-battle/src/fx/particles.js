// One shared full-screen canvas for confetti and spark bursts.

let canvas = null
let ctx = null
let parts = []
let raf = 0
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function ensure() {
  if (canvas) return
  canvas = document.createElement('canvas')
  canvas.className = 'fx-particles'
  canvas.setAttribute('aria-hidden', 'true')
  document.body.appendChild(canvas)
  ctx = canvas.getContext('2d')
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = innerWidth * dpr
    canvas.height = innerHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  resize()
  addEventListener('resize', resize)
}

function tick() {
  ctx.clearRect(0, 0, innerWidth, innerHeight)
  ctx.globalCompositeOperation = 'lighter'
  parts = parts.filter((p) => p.life > 0)
  for (const p of parts) {
    p.vy += p.g
    p.vx *= p.drag
    p.vy *= p.drag
    p.x += p.vx
    p.y += p.vy
    p.rot += p.vr
    p.life -= 1
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 25))
    ctx.fillStyle = p.color
    if (p.kind === 'confetti') {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      ctx.restore()
    } else {
      ctx.beginPath()
      ctx.arc(p.x, p.y, Math.max(0, p.size * (p.life / p.max)), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.globalAlpha = 1
  raf = parts.length ? requestAnimationFrame(tick) : 0
}

function add(list) {
  ensure()
  parts.push(...list)
  if (!raf) raf = requestAnimationFrame(tick)
}

/** Radial spark burst, e.g. for a PERFECT line. */
export function burst(x, y, colors, count = 40) {
  if (reduced()) count = Math.min(count, 8)
  add(
    Array.from({ length: count }, (_, i) => {
      const a = Math.random() * Math.PI * 2
      const s = 2 + Math.random() * 7
      const life = 40 + Math.random() * 30
      return { kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, g: 0.12, drag: 0.96, rot: 0, vr: 0, size: 2 + Math.random() * 3, color: colors[i % colors.length], life, max: life }
    }),
  )
}

/** Confetti raining from the top of the screen. */
export function confetti(colors, count = 160) {
  if (reduced()) count = 30
  add(
    Array.from({ length: count }, (_, i) => {
      const life = 140 + Math.random() * 120
      return { kind: 'confetti', x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, g: 0.04, drag: 0.995, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, size: 8 + Math.random() * 7, color: colors[i % colors.length], life, max: life }
    }),
  )
}
