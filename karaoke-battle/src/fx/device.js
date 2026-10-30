// Small wrappers around modern browser APIs. Each one degrades silently
// where the API is missing or refused.

import { nextTick } from 'vue'

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported */
  }
}

let wakeLock = null
export async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen')
    else if (!on && wakeLock) {
      await wakeLock.release()
      wakeLock = null
    }
  } catch {
    wakeLock = null
  }
}

export function canFullscreen() {
  return !!document.documentElement.requestFullscreen
}

export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
  } catch {
    /* refused */
  }
}

/** Run a DOM-changing update inside a View Transition when supported. */
export function withTransition(update) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!document.startViewTransition || reduced) return update()
  const t = document.startViewTransition(async () => {
    update()
    await nextTick()
  })
  // A transition can be skipped (e.g. the window resized mid-way); the
  // update still runs, so the rejection is harmless.
  t.ready.catch(() => {})
  t.finished.catch(() => {})
}
