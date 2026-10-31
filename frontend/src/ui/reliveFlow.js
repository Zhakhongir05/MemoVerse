export function reliveState(memory, canGenerate, hasViewer) {
  if (memory.world && hasViewer) return 'ready'
  if (!memory.photos.length) return 'needs-photo'
  if (!canGenerate || !hasViewer) return 'unavailable'
  return 'pending'
}

export function validateReliveResult(result) {
  if (!result?.world || typeof result.world !== 'object' || Array.isArray(result.world) || !Object.keys(result.world).length) {
    throw new Error('The environment was not ready. Please try again.')
  }
  return result
}
