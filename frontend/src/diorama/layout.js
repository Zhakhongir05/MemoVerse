import { resolveAnchor, SURFACE_HEIGHTS } from './registry'

/**
 * Resolves every normalized scene object into a world placement.
 *
 * Floor props are solved onto the 3D floor: their normalized Y maps to a
 * depth, so their base projects back onto the painted image position. Surface
 * props ride on another prop's top (e.g. a CRT on a desk) and follow it when
 * it moves. Wall/unknown props keep the original image-plane placement.
 */
export function layoutObjects(objects, mapping) {
  const byId = new Map()
  for (const object of objects) byId.set(object.id, object)

  const placements = new Map()
  const resolving = new Set()

  const place = (object) => {
    if (!object) return null
    if (placements.has(object.id)) return placements.get(object.id)
    if (resolving.has(object.id)) return null

    resolving.add(object.id)

    const anchor = resolveAnchor(object)
    let placement = null

    if (anchor === 'floor') {
      const z = mapping.floorZFromImageY(object.position[1])
      const perspective = mapping.perspectiveAtZ(z)

      placement = {
        anchor: 'floor',
        x: mapping.imageXToWorld(object.position[0], perspective),
        y: mapping.floorY,
        z,
        perspective,
        parallax: Math.max(0.15, 1 - perspective),
      }
    } else if (anchor === 'surface' && object.support) {
      const supportObject = byId.get(object.support)
      const support = place(supportObject)

      if (support && supportObject) {
        const z = support.z + 0.08
        const perspective = mapping.perspectiveAtZ(z)
        const offsetX =
          (object.position[0] - supportObject.position[0]) *
          mapping.stageWidth *
          support.perspective
        const surfaceHeight =
          (SURFACE_HEIGHTS[supportObject.type] ?? 1) *
          supportObject.scale[1] *
          support.perspective

        placement = {
          anchor: 'surface',
          x: support.x + offsetX,
          y: support.y + surfaceHeight,
          z,
          perspective,
          parallax: support.parallax,
        }
      }
    }

    if (!placement) {
      // Wall props and unknown types keep the original image-plane projection.
      const perspective = 1
      placement = {
        anchor: 'image',
        x: mapping.imageXToWorld(object.position[0], perspective),
        y: mapping.imageYToWorld(object.position[1], perspective),
        z: mapping.backdropZ + 0.05,
        perspective,
        parallax: Math.max(0, object.depth),
      }
    }

    resolving.delete(object.id)
    placements.set(object.id, placement)
    return placement
  }

  for (const object of objects) place(object)

  return placements
}
