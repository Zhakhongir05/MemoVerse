// Only an existing, validated spatial anchor can drive narration focus.
export function podcastTarget(cue, anchors) {
  if (!cue?.anchor_id) return null
  const position = anchors?.find(anchor => anchor.id === cue.anchor_id)?.position
  return Array.isArray(position) && position.length === 3 && position.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 20) ? position : null
}
