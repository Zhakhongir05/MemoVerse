import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { cameraCueTarget } from './memorycastCameraCue.js'

// Look-at only: retain the user's camera position instead of moving through
// unknown collider geometry. Manual OrbitControls input cancels the cue.
export default function MemoryCastCamera({ cue, controls, ready, stopDefaultJourney }) {
  const progress = useRef({ elapsed: 0, done: false, start: null })
  useEffect(() => {
    progress.current = { elapsed: 0, done: false, start: null }
    if (cue) stopDefaultJourney(0)
  }, [cue, stopDefaultJourney])
  useFrame((_, dt) => {
    const state = progress.current
    if (!cue || !ready || !controls.current || state.done) return
    const target = cameraCueTarget(cue, window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    if (!target) {
      state.done = true; cue.onReady?.(); return
    }
    state.start ||= controls.current.target.clone()
    state.elapsed += dt
    const seconds = Math.max(0.5, Math.min(4, cue.camera.transition_seconds || 2.5))
    const t = Math.min(1, state.elapsed / seconds)
    controls.current.target.lerpVectors(state.start, new Vector3(...target), t * t * (3 - 2 * t))
    controls.current.update()
    if (t === 1) { state.done = true; cue.onReady?.() }
  })
  return null
}
