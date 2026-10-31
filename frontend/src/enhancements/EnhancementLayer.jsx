import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLoader } from '@react-three/fiber'
import { TransformControls } from '@react-three/drei'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Raycaster, Vector3 } from 'three'

import { ASSET_CATALOG } from './catalog.js'

/* -------------------------------------------------------------------------- */
/* Lighting                                                                   */
/* -------------------------------------------------------------------------- */

// Splat colors are captured, not relit. These lights exist only so the GLB
// overlays sit in the same mood as the SenseShift wash around them.
const MOOD_LIGHTS = {
  nostalgic: { ambient: '#ffe4c4', sky: '#fff1d8', ground: '#4a3427', key: '#ffcf9e', keyIntensity: 1.5 },
  joyful: { ambient: '#fff7dc', sky: '#fffbe6', ground: '#5a4a2f', key: '#fff3cb', keyIntensity: 1.8 },
  melancholic: { ambient: '#c9d6ef', sky: '#dbe6ff', ground: '#3b4058', key: '#d9e3ff', keyIntensity: 1.1 },
}

export function EnhancementLighting({ mood = 'nostalgic' }) {
  const light = MOOD_LIGHTS[mood] ?? MOOD_LIGHTS.nostalgic
  return (
    <>
      <ambientLight color={light.ambient} intensity={0.9} />
      <hemisphereLight color={light.sky} groundColor={light.ground} intensity={0.7} />
      <directionalLight position={[3, 5, 4]} color={light.key} intensity={light.keyIntensity} />
      <directionalLight position={[-4, 3, -3]} color={light.sky} intensity={0.35} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Model                                                                      */
/* -------------------------------------------------------------------------- */

const PALETTE = {
  wood: '#a77950',
  darkWood: '#7d5636',
  fabric: '#cfb194',
  cream: '#f2e7d6',
  metal: '#6b5b4a',
  shade: '#ffe4b7',
}

function Box({ position, size, color }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.82} />
    </mesh>
  )
}

// Used only when a catalog GLB fails to decode, so a broken asset never removes
// the memory object from the room.
function FallbackModel({ type }) {
  switch (type) {
    case 'bed':
      return (
        <>
          <Box position={[0, 0.14, 0]} size={[1.8, 0.28, 2.3]} color={PALETTE.wood} />
          <Box position={[0, 0.41, 0]} size={[1.66, 0.26, 2.14]} color={PALETTE.cream} />
          <Box position={[0, 0.56, 0.38]} size={[1.7, 0.09, 1.25]} color={PALETTE.fabric} />
          <Box position={[0, 0.56, -1.12]} size={[1.86, 0.9, 0.12]} color={PALETTE.darkWood} />
        </>
      )
    case 'desk':
      return (
        <>
          <Box position={[0, 0.76, 0]} size={[1.9, 0.08, 0.86]} color={PALETTE.wood} />
          {[-0.86, 0.86].flatMap((x) =>
            [-0.36, 0.36].map((z) => (
              <Box key={`${x}-${z}`} position={[x, 0.36, z]} size={[0.08, 0.72, 0.08]} color={PALETTE.darkWood} />
            )),
          )}
        </>
      )
    case 'chair':
      return (
        <>
          <Box position={[0, 0.46, 0]} size={[0.56, 0.09, 0.56]} color={PALETTE.fabric} />
          <Box position={[0, 0.8, -0.24]} size={[0.56, 0.62, 0.08]} color={PALETTE.wood} />
          {[-0.22, 0.22].flatMap((x) =>
            [-0.22, 0.22].map((z) => (
              <Box key={`${x}-${z}`} position={[x, 0.23, z]} size={[0.06, 0.46, 0.06]} color={PALETTE.darkWood} />
            )),
          )}
        </>
      )
    case 'lamp':
      return (
        <>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.06, 20]} />
            <meshStandardMaterial color={PALETTE.metal} />
          </mesh>
          <mesh position={[0, 0.55, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 1.02, 12]} />
            <meshStandardMaterial color={PALETTE.metal} />
          </mesh>
          <mesh position={[0, 1.16, 0]}>
            <coneGeometry args={[0.3, 0.44, 24, 1, true]} />
            <meshStandardMaterial color={PALETTE.shade} emissive={PALETTE.shade} emissiveIntensity={0.45} />
          </mesh>
        </>
      )
    case 'bookshelf':
      return (
        <>
          <Box position={[0, 1.15, 0]} size={[2.2, 2.3, 0.4]} color="#8a6844" />
          {[0.5, 0.95, 1.4, 1.85].map((y) => (
            <Box key={y} position={[0, y, 0.02]} size={[2.1, 0.04, 0.36]} color="#b0895f" />
          ))}
        </>
      )
    case 'armchair':
      return (
        <>
          <Box position={[0, 0.31, 0]} size={[0.9, 0.26, 0.84]} color="#9a5b3d" />
          <Box position={[0, 0.52, 0.02]} size={[0.76, 0.16, 0.72]} color="#b8744f" />
          <Box position={[0, 0.72, -0.35]} size={[0.9, 0.68, 0.16]} color="#9a5b3d" />
          <Box position={[-0.44, 0.55, 0]} size={[0.12, 0.34, 0.8]} color="#9a5b3d" />
          <Box position={[0.44, 0.55, 0]} size={[0.12, 0.34, 0.8]} color="#9a5b3d" />
        </>
      )
    case 'pendant':
      return (
        <>
          <mesh position={[0, -0.09, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.16, 8]} />
            <meshStandardMaterial color={PALETTE.metal} />
          </mesh>
          <mesh position={[0, -0.45, 0]}>
            <sphereGeometry args={[0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial
              color={PALETTE.shade}
              emissive={PALETTE.shade}
              emissiveIntensity={0.55}
              side={2}
            />
          </mesh>
        </>
      )
    case 'basket':
      return (
        <>
          <mesh position={[0, 0.17, 0]}>
            <cylinderGeometry args={[0.26, 0.21, 0.34, 20]} />
            <meshStandardMaterial color="#c9a878" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.365, 0]}>
            <cylinderGeometry args={[0.265, 0.265, 0.03, 20]} />
            <meshStandardMaterial color="#a8865a" />
          </mesh>
        </>
      )
    case 'rug':
      return (
        <mesh position={[0, 0.012, 0]}>
          <boxGeometry args={[2.6, 0.018, 1.8]} />
          <meshStandardMaterial color="#ded2bd" roughness={1} />
        </mesh>
      )
    default:
      return <Box position={[0, 0.5, 0]} size={[0.6, 1, 0.6]} color="#8a7a6a" />
  }
}

class ModelBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.warn('[MemoVerse] Enhancement model failed to load; using primitive fallback.', error)
  }

  render() {
    return this.state.failed ? <FallbackModel type={this.props.type} /> : this.props.children
  }
}

function LoadingPlaceholder({ size }) {
  const [width, height, depth] = size
  return (
    <mesh position={[0, height / 2, 0]}>
      <boxGeometry args={[width, height, depth]} />
      <meshBasicMaterial color="#ffd190" wireframe transparent opacity={0.35} depthWrite={false} />
    </mesh>
  )
}

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

function EnhancementModel({
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
  const gltf = useLoader(GLTFLoader, asset.url)
  const group = useRef(null)
  const snappedFor = useRef(null)
  const [hovered, setHovered] = useState(false)

  // The loaded scene is shared by every instance of this asset; clone meshes and
  // per-instance materials so hover/selection tinting cannot leak between props.
  const model = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse((object) => {
      if (!object.isMesh) return
      object.castShadow = false
      object.receiveShadow = false
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      const cloned = materials.map((material) => {
        const copy = material.clone()
        copy.userData.baseEmissive = copy.emissive ? copy.emissive.getHex() : 0x000000
        copy.userData.baseEmissiveIntensity = copy.emissiveIntensity ?? 0
        return copy
      })
      object.material = Array.isArray(object.material) ? cloned : cloned[0]
    })
    return clone
  }, [gltf])

  useEffect(() => {
    model.traverse((object) => {
      if (!object.isMesh) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!material.emissive) continue
        const base = material.userData.baseEmissive ?? 0x000000
        const baseIntensity = material.userData.baseEmissiveIntensity ?? 0
        material.emissive.set(selected ? '#ffcf8a' : hovered ? '#8a6f4a' : base)
        material.emissiveIntensity = selected ? baseIntensity + 0.45 : hovered ? baseIntensity + 0.2 : baseIntensity
      }
    })
  }, [model, selected, hovered])

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
        <group scale={asset.unitScale}>
          <ModelBoundary type={enhancement.type}>
            <Suspense fallback={<LoadingPlaceholder size={asset.size} />}>
              <primitive object={model} />
            </Suspense>
          </ModelBoundary>
        </group>
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

/* -------------------------------------------------------------------------- */
/* Layer                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Overlays approved GLBs on the World Labs splat room. Purely additive: the
 * splat renderer, its collider, and OrbitControls stay untouched.
 */
export default function EnhancementLayer({
  enhancements = [],
  collider = null,
  mood = 'nostalgic',
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
      <EnhancementLighting mood={mood} />
      {enhancements.map((enhancement) => (
        <EnhancementModel
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
