import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { MathUtils } from 'three'
import { useStage } from './stage'

const PARALLAX_X = 2.0
const PARALLAX_Y = 1.0
const HOVER_SCALE = 1.045

/**
 * Positions an object from normalized scene coordinates and gives it the
 * shared hover / click / parallax behaviour. `children` is a render prop that
 * receives the hover state so individual props can react (e.g. CRT glow).
 */
export default function Interactable({ object, onSelect, onHover, children }) {
  const { toWorld } = useStage()
  const [hovered, setHovered] = useState(false)

  const group = useRef()
  const inner = useRef()

  const [x, y, z] = toWorld(object.position[0], object.position[1], object.depth)
  const rotation = object.rotation.map(MathUtils.degToRad)
  const scale = object.scale

  useEffect(() => {
    if (!hovered) return undefined
    document.body.style.cursor = 'pointer'
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [hovered])

  useFrame(({ pointer }, delta) => {
    if (!group.current) return
    const depth = Math.max(object.depth, 0)
    const targetX = x + pointer.x * depth * PARALLAX_X
    const targetY = y + pointer.y * depth * PARALLAX_Y

    group.current.position.x = MathUtils.damp(
      group.current.position.x,
      targetX,
      6,
      delta,
    )
    group.current.position.y = MathUtils.damp(
      group.current.position.y,
      targetY,
      6,
      delta,
    )

    if (inner.current) {
      const target = hovered ? HOVER_SCALE : 1
      const next = MathUtils.damp(inner.current.scale.x, target, 12, delta)
      inner.current.scale.setScalar(next)
    }
  })

  const handlePointerOver = (event) => {
    if (!object.interactive) return
    event.stopPropagation()
    setHovered(true)
    onHover?.(object)
  }

  const handlePointerOut = (event) => {
    if (!object.interactive) return
    event.stopPropagation()
    setHovered(false)
    onHover?.(null)
  }

  const handleClick = (event) => {
    if (!object.interactive) return
    event.stopPropagation()
    onSelect?.(object, event)
  }

  return (
    <group
      ref={group}
      position={[x, y, z]}
      rotation={rotation}
      scale={scale}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    >
      <group ref={inner}>{children(hovered)}</group>
    </group>
  )
}
