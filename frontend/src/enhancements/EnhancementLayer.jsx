import { useEffect, useRef, useState } from 'react'
import { TransformControls } from '@react-three/drei'
import { Raycaster, Vector3 } from 'three'

import { ASSET_CATALOG } from './catalog.js'

/**
 * Finds the room surface an object should rest on, in scene units. A downward
 * ray from above the room meets the ceiling first and the floor last, so the
 * same cast serves both anchors.
 */
const SNAP_RAY_START = 50

function surfaceYAt(collider, [x, , z], anchor) {
  const raycaster = new Raycaster()
  raycaster.set(new Vector3(x, SNAP_RAY_START, z), new Vector3(0, -1, 0))
  const hits = raycaster.intersectObject(collider, true)
  if (hits.length === 0) return null
  return anchor === 'ceiling' ? hits[0].point.y : hits[hits.length - 1].point.y
}

/**
 * Placements draw as hit volumes only. The splat already shows the real room,
 * so a guessed mesh on top of it reads as a mistake; the invisible box still
 * gives every memory a place to be clicked, and its outline appears on hover
 * or when the memory is selected.
 */
function EnhancementBox({
  enhancement,
  collider,
  selected,
  calibrating,
  transformMode,
  onSelect,
  onHover,
  onTransform,
  onGround,
}) {
  const asset = ASSET_CATALOG[enhancement.assetId]
  const unit = asset?.unitScale ?? 1
  const [width, height, depth] = (asset?.size ?? [0.6, 1, 0.6]).map((n) => n * unit)
  // Ceiling pieces hang below their anchor; everything else rises from it.
  const hangs = enhancement.anchor === 'ceiling' || enhancement.type === 'pendant'
  const center = [0, hangs ? -height / 2 : height / 2, 0]

  const group = useRef(null)
  const snappedFor = useRef(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    document.body.style.cursor = hovered && !calibrating ? 'pointer' : ''
    return () => {
      document.body.style.cursor = ''
    }
  }, [hovered, calibrating])

  // Drop floor/ceiling pieces onto the room the collider describes. Keyed by
  // collider + surface footprint, so a manifest that arrives after the collider
  // still snaps, while our own y-only grounding update does not re-trigger.
  const snapKey = collider
    ? `${collider.uuid}:${enhancement.anchor}:${enhancement.position[0]}:${enhancement.position[2]}`
    : null
  useEffect(() => {
    if (!collider || enhancement.anchor === 'none') return
    if (snappedFor.current === snapKey) return
    snappedFor.current = snapKey
    collider.updateWorldMatrix(true, true)
    const y = surfaceYAt(collider, enhancement.position, enhancement.anchor)
    if (y === null) return
    const rounded = Math.round(y * 1000) / 1000
    console.info(`[MemoVerse] ${enhancement.id} anchored to ${enhancement.anchor} at y=${rounded} (was ${enhancement.position[1]})`)
    if (Math.abs(rounded - enhancement.position[1]) > 0.002) onGround?.(enhancement.id, rounded)
  }, [collider, enhancement.anchor, enhancement.id, enhancement.position, onGround, snapKey])

  const commitTransform = () => {
    const object = group.current
    if (!object) return
    onTransform?.(enhancement.id, {
      position: object.position.toArray().map((n) => Math.round(n * 1000) / 1000),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z].map((n) => Math.round(n * 1000) / 1000),
      scale: object.scale.toArray().map((n) => Math.min(20, Math.max(0.01, Math.round(n * 1000) / 1000))),
    })
  }

  const revealed = hovered || selected

  return (
    <>
      <group
        ref={group}
        name={`enhancement:${enhancement.id}`}
        position={enhancement.position}
        rotation={enhancement.rotation}
        scale={enhancement.scale}
        onClick={(event) => {
          event.stopPropagation()
          onSelect?.(enhancement.id)
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          setHovered(true)
          onHover?.(enhancement.id)
        }}
        onPointerOut={() => {
          setHovered(false)
          onHover?.(null)
        }}
      >
        {/* Hit volume: never rendered, still raycast, so the splat stays clean. */}
        <mesh position={center}>
          <boxGeometry args={[width, height, depth]} />
          <meshBasicMaterial visible={false} />
        </mesh>
        {revealed && (
          <mesh position={center} renderOrder={2} raycast={() => null}>
            <boxGeometry args={[width, height, depth]} />
            <meshBasicMaterial color={selected ? '#ffcf8a' : '#e8d3b0'} wireframe transparent opacity={selected ? 0.85 : 0.5} depthWrite={false} depthTest={false} />
          </mesh>
        )}
      </group>

      {selected && calibrating && (
        <TransformControls
          object={group}
          mode={transformMode}
          size={0.85}
          translationSnap={0.05}
          rotationSnap={Math.PI / 24}
          scaleSnap={0.05}
          onMouseUp={commitTransform}
        />
      )}
    </>
  )
}

/**
 * Overlays approved placements on the World Labs splat room as invisible hit
 * volumes. Purely additive: the splat renderer, its collider, and OrbitControls
 * stay untouched.
 */
export default function EnhancementLayer({
  enhancements = [],
  collider = null,
  selectedId = null,
  calibrating = false,
  transformMode = 'translate',
  onSelect,
  onHover,
  onTransform,
  onGround,
}) {
  return (
    <>
      {enhancements.map((enhancement) => (
        <EnhancementBox
          key={enhancement.id}
          enhancement={enhancement}
          collider={collider}
          selected={enhancement.id === selectedId}
          calibrating={calibrating}
          transformMode={transformMode}
          onSelect={onSelect}
          onHover={onHover}
          onTransform={onTransform}
          onGround={onGround}
        />
      ))}
    </>
  )
}
