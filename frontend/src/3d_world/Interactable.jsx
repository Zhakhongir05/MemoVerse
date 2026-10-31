import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { useStage } from './stage'

const PARALLAX_X = 1.0
const PARALLAX_Y = 0.5
const HOVER_SCALE = 1.045

/**
 * Positions an object from its resolved placement and gives it the shared
 * hover / click / parallax behaviour. `children` is a render prop that
 * receives the hover state so individual props can react (e.g. CRT glow).
 *
 * In dev `editMode`, dragging an object moves it on its anchor plane (the 3D
 * floor for floor props, the image plane otherwise) and calls
 * `onMove(id, [x, y])` with the new normalized image position.
 */
export default function Interactable({
  object,
  placement,
  onSelect,
  onHover,
  onMove,
  editMode = false,
  children,
}) {
  const { floorY, fromFloorPoint, fromWorldAtZ } = useStage()
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)

  const group = useRef()
  const inner = useRef()
  const onMoveRef = useRef(onMove)

  useEffect(() => {
    onMoveRef.current = onMove
  }, [onMove])

  const { x, y, z, perspective, anchor, parallax } = placement
  const rotation = object.rotation.map(MathUtils.degToRad)
  // Scale is authored against the image plane; compensate for perspective.
  const scale = object.scale.map((value) => value * perspective)

  useEffect(() => {
    if (dragging) {
      document.body.style.cursor = 'grabbing'
      return () => {
        document.body.style.cursor = 'auto'
      }
    }
    if (hovered) {
      document.body.style.cursor = editMode ? 'grab' : 'pointer'
      return () => {
        document.body.style.cursor = 'auto'
      }
    }
    return undefined
  }, [hovered, dragging, editMode])

  // Drag on the prop's anchor plane.
  useEffect(() => {
    if (!dragging) return undefined

    const raycaster = new Raycaster()
    const ndc = new Vector2()
    const point = new Vector3()
    const onFloor = anchor === 'floor'
    const plane = onFloor
      ? new Plane(new Vector3(0, 1, 0), -floorY)
      : new Plane(new Vector3(0, 0, 1), -z)

    const handlePointerMove = (event) => {
      const rect = gl.domElement.getBoundingClientRect()
      if (!rect.width || !rect.height) return

      ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)

      if (!raycaster.ray.intersectPlane(plane, point)) return

      const next = onFloor
        ? fromFloorPoint(point.x, point.z)
        : fromWorldAtZ(point.x, point.y, z)

      onMoveRef.current?.(object.id, next)
    }

    const handlePointerUp = () => setDragging(false)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [
    dragging,
    camera,
    gl,
    z,
    anchor,
    floorY,
    object.id,
    fromFloorPoint,
    fromWorldAtZ,
  ])

  useFrame(({ pointer }, delta) => {
    if (!group.current) return

    if (dragging) {
      group.current.position.set(x, y, z)
      return
    }

    const depth = Math.max(parallax ?? 0, 0)
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
      const target = hovered && !editMode ? HOVER_SCALE : 1
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

  const handlePointerDown = (event) => {
    if (!editMode) return
    event.stopPropagation()
    setDragging(true)
  }

  const handleClick = (event) => {
    event.stopPropagation()
    if (editMode || !object.interactive) return
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
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <group ref={inner}>{children(hovered)}</group>
    </group>
  )
}
