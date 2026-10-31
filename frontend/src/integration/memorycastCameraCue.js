export function cameraCueTarget(cue, reducedMotion) {
  const target = cue?.camera?.target
  return !reducedMotion && Array.isArray(target) && target.length === 3 && target.every(n => Number.isFinite(n) && Math.abs(n) <= 20) ? target : null
}
