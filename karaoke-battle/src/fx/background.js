// Full-screen WebGL backdrop: a slow neon aurora over a perspective grid
// that pulses with the music. Falls back to the CSS gradient when WebGL
// isn't available.

import { getLevel } from '../audio/engine.js'

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`

const FRAG = `
precision mediump float;
uniform vec2 res;
uniform float time;
uniform float energy;
uniform vec3 colA;
uniform vec3 colB;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / res;
  vec2 q = (gl_FragCoord.xy - 0.5 * res) / res.y;
  float t = time * 0.05;

  // Aurora curtains.
  float n = fbm(vec2(q.x * 1.4 + t, q.y * 0.6 - t * 0.6));
  float band = smoothstep(0.25, 0.0, abs(q.y - 0.18 - (n - 0.5) * 0.7));
  vec3 aurora = mix(colA, colB, smoothstep(0.2, 0.8, fbm(q * 1.2 - t)));
  vec3 col = vec3(0.025, 0.012, 0.06);
  col += aurora * band * (0.35 + energy * 0.9);
  col += aurora * 0.12 * fbm(q * 2.5 + t * 2.0);

  // Retro perspective floor grid, scrolling toward the viewer on the beat.
  if (q.y < -0.08) {
    float d = -0.08 - q.y;
    vec2 g = vec2(q.x / d, 1.0 / d + time * (0.6 + energy * 1.5));
    vec2 gl = abs(fract(g * vec2(0.5, 0.35)) - 0.5);
    float line = smoothstep(0.035, 0.0, min(gl.x, gl.y) * d * 6.0);
    float fade = smoothstep(0.0, 0.35, d) * smoothstep(0.75, 0.25, d);
    col += colA * line * fade * (0.35 + energy);
  }

  // Horizon glow + vignette.
  col += colB * 0.25 * exp(-abs(q.y + 0.08) * 18.0) * (0.6 + energy);
  col *= 1.0 - 0.55 * dot(uv - 0.5, uv - 0.5) * 2.0;
  gl_FragColor = vec4(col, 1.0);
}`

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

let accent = { a: hexToRgb('#ff3d9a'), b: hexToRgb('#22d3ee') }

/** Tint the backdrop, e.g. with the active singer's color. */
export function setBackdropColors(a, b = '#22d3ee') {
  accent = { a: hexToRgb(a), b: hexToRgb(b) }
}

export function startBackground(canvas) {
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false })
  if (!gl) return () => {}
  const compile = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return s
  }
  const prog = gl.createProgram()
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return () => {}
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const u = (n) => gl.getUniformLocation(prog, n)
  const uRes = u('res'), uTime = u('time'), uEnergy = u('energy'), uA = u('colA'), uB = u('colB')

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  // Render at reduced resolution: it's a soft backdrop, and phones thank us.
  const scale = Math.min(window.devicePixelRatio || 1, 1) * 0.5
  let raf = 0
  let energy = 0
  let cur = { a: [...accent.a], b: [...accent.b] }
  const t0 = performance.now()

  function resize() {
    canvas.width = Math.max(1, Math.floor(innerWidth * scale))
    canvas.height = Math.max(1, Math.floor(innerHeight * scale))
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  function frame() {
    raf = requestAnimationFrame(frame)
    if (document.hidden) return
    energy += (getLevel() - energy) * 0.15
    for (const k of ['a', 'b']) for (let i = 0; i < 3; i++) cur[k][i] += (accent[k][i] - cur[k][i]) * 0.03
    const time = reduced.matches ? 20 : (performance.now() - t0) / 1000
    gl.uniform2f(uRes, canvas.width, canvas.height)
    gl.uniform1f(uTime, time)
    gl.uniform1f(uEnergy, reduced.matches ? 0 : energy)
    gl.uniform3fv(uA, cur.a)
    gl.uniform3fv(uB, cur.b)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  resize()
  addEventListener('resize', resize)
  canvas.classList.add('on')
  frame()
  return () => {
    cancelAnimationFrame(raf)
    removeEventListener('resize', resize)
  }
}
