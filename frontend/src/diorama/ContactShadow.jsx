import { useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'

import { FOOTPRINTS } from './registry'

const DEFAULT_FOOTPRINT = [1.6, 1.6]

/**
 * Cheap soft contact shadow under a grounded prop. The background image
 * already has baked lighting, so a neutral blob reads better than a real
 * shadow map whose light direction would disagree with the painting.
 */
export default function ContactShadow({ object, placement }) {
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null

    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128

    const context = canvas.getContext('2d')
    if (!context) return null

    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)')
    gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.28)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)

    const result = new CanvasTexture(canvas)
    result.colorSpace = SRGBColorSpace
    return result
  }, [])

  if (!texture || !placement || placement.anchor === 'image') return null

  const footprint = FOOTPRINTS[object.type] ?? DEFAULT_FOOTPRINT
  const width = footprint[0] * object.scale[0] * placement.perspective
  const depth = footprint[1] * object.scale[2] * placement.perspective

  return (
    <mesh
      position={[placement.x, placement.y + 0.004, placement.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={2}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.55}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
