// World Labs does not currently expose a completion percentage in our saved-job
// contract. Keep estimates below completion until the saved result is confirmed.
export function estimatedWorldProgress(elapsedMs) {
  return Math.min(95, Math.round(1 + 94 * (1 - Math.exp(-Math.max(0, elapsedMs) / 120000))))
}
