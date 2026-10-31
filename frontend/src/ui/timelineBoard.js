export function zoomCamera(camera, nextScale, anchor) {
  const scale = Math.min(2, Math.max(0.4, nextScale))
  const ratio = scale / camera.scale
  return { scale, x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio }
}

export function readBoardPositions(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}')
    return Object.fromEntries(Object.entries(value).filter(([, point]) => Number.isFinite(point?.x) && Number.isFinite(point?.y)))
  } catch { return {} }
}

export function boardThread(entries, positions) {
  const points = entries.map((entry, index) => {
    const point = positions[entry.id] || { x: index * 300 + 40, y: [30, 150, 100, 170][index % 4] }
    return { x: point.x + 122.5, y: point.y + 258 + (entry.photos.length > 1 ? 29 : 0) }
  })
  if (!points.length) return ''
  return `M ${points[0].x - 110} ${points[0].y - 70} Q ${points[0].x - 50} ${points[0].y - 40} ${points[0].x} ${points[0].y} ` + points.slice(1).map((point, index) => {
    const previous = points[index]
    return `C ${previous.x + 100} ${previous.y + 90}, ${point.x - 100} ${point.y + 90}, ${point.x} ${point.y}`
  }).join(' ')
}
