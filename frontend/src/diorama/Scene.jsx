import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'
import { BackSide, CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

import Interactable from './Interactable'
import ContactShadow from './ContactShadow'
import { getObjectComponent } from './registry'
import { layoutObjects } from './layout'
import { normalizeScene, MOCK_SCENE } from './sceneSchema'
import {
  BACKDROP_Z,
  CAMERA_FOV,
  CAMERA_Z,
  StageContext,
  createStageMapping,
  useStage,
} from './stage'
import DevScenePanel from './DevScenePanel'

/* -------------------------------------------------------------------------- */
/* Stage                                                                      */
/* -------------------------------------------------------------------------- */

function StageProvider({ background, stage, children }) {
  const size = useThree((state) => state.size)
  const camera = useThree((state) => state.camera)

  const mapping = useMemo(
    () =>
      createStageMapping({
        viewportWidth: size.width,
        viewportHeight: size.height,
        fov: camera.fov ?? CAMERA_FOV,
        imageWidth: background.width,
        imageHeight: background.height,
        floorLine: stage.floorLine,
      }),
    [
      size.width,
      size.height,
      camera.fov,
      background.width,
      background.height,
      stage.floorLine,
    ],
  )

  return (
    <StageContext.Provider value={mapping}>{children}</StageContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/* Background                                                                 */
/* -------------------------------------------------------------------------- */

function BackgroundImage({ url }) {
  const texture = useTexture(url)

  useEffect(() => {
    // oxlint-disable-next-line react/immutability
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
  }, [texture])

  return (
    <mesh position={[0, 0, BACKDROP_Z]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

// A broken/blocked image URL must never take the whole demo down.
class TextureBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.warn('[MemoVerse] Background image failed to load:', error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function Background({ background }) {
  const { stageWidth, stageHeight } = useStage()

  if (!background.url) return null

  return (
    <group scale={[stageWidth, stageHeight, 1]}>
      <TextureBoundary key={background.url}>
        <Suspense fallback={null}>
          <BackgroundImage url={background.url} />
        </Suspense>
      </TextureBoundary>
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/* Floor                                                                      */
/* -------------------------------------------------------------------------- */

// The painted room supplies the far floor; this plane is the real foreground
// floor. It starts at the paint line and runs toward the camera, so props can
// stand on it with real perspective and contact shadows. It is unlit and
// textured in canvas so its color matches the painted backdrop exactly.
function Floor({ stage }) {
  const { stageWidth, floorY, backdropZ, floorNearZ } = useStage()
  const depth = floorNearZ - backdropZ

  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null

    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512

    const context = canvas.getContext('2d')
    if (!context) return null

    context.fillStyle = stage.floorColor
    context.fillRect(0, 0, 512, 512)

    // Light falloff toward the viewer.
    const gradient = context.createLinearGradient(0, 0, 0, 512)
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.02)')
    gradient.addColorStop(0.65, 'rgba(0, 0, 0, 0.1)')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.22)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 512, 512)

    // Plank ends across the room.
    context.strokeStyle = 'rgba(0, 0, 0, 0.1)'
    context.lineWidth = 2
    for (let y = 32; y < 512; y += 42) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(512, y)
      context.stroke()
    }

    // Seams running toward the wall.
    context.strokeStyle = 'rgba(0, 0, 0, 0.08)'
    for (let x = 0; x < 512; x += 74) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x, 512)
      context.stroke()
    }

    // Baked shadow where the wall meets the floor.
    const seam = context.createLinearGradient(0, 0, 0, 64)
    seam.addColorStop(0, 'rgba(0, 0, 0, 0.38)')
    seam.addColorStop(1, 'rgba(0, 0, 0, 0)')
    context.fillStyle = seam
    context.fillRect(0, 0, 512, 64)

    const result = new CanvasTexture(canvas)
    result.colorSpace = SRGBColorSpace
    result.wrapS = RepeatWrapping
    result.wrapT = RepeatWrapping
    result.repeat.set(4, 1)
    return result
  }, [stage.floorColor])

  return (
    <mesh
      position={[0, floorY, (backdropZ + floorNearZ) / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[stageWidth, depth]} />
      <meshBasicMaterial
        map={texture ?? undefined}
        color={texture ? '#ffffff' : stage.floorColor}
        toneMapped={false}
      />
    </mesh>
  )
}

/* -------------------------------------------------------------------------- */
/* Lighting                                                                   */
/* -------------------------------------------------------------------------- */

function Lighting({ atmosphere }) {
  return (
    <>
      <ambientLight
        color={atmosphere.ambientColor}
        intensity={atmosphere.ambientIntensity}
      />
      <directionalLight
        position={[4, 6, 8]}
        color={atmosphere.keyColor}
        intensity={atmosphere.keyIntensity}
      />
      <directionalLight position={[-5, 3, 5]} color="#7f8fc9" intensity={0.3} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                   */
/* -------------------------------------------------------------------------- */

function CameraRig({ enabled = true, orbit }) {
  const controls = useRef()
  const domElement = useThree((state) => state.gl.domElement)
  const azimuth = orbit?.azimuth ?? 0.35
  const polar = orbit?.polar ?? 0.2

  useEffect(() => {
    const handleDoubleClick = () => controls.current?.reset()
    domElement.addEventListener('dblclick', handleDoubleClick)
    return () => domElement.removeEventListener('dblclick', handleDoubleClick)
  }, [domElement])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={enabled}
      enableDamping
      dampingFactor={0.08}
      zoomToCursor
      rotateSpeed={0.7}
      zoomSpeed={0.8}
      panSpeed={0.7}
      minDistance={4}
      maxDistance={22}
      minPolarAngle={Math.PI / 2 - polar}
      maxPolarAngle={Math.PI / 2 + polar}
      minAzimuthAngle={-azimuth}
      maxAzimuthAngle={azimuth}
    />
  )
}

// Hides the void behind the backdrop when the camera orbits or zooms out.
function VoidBackdrop() {
  return (
    <mesh>
      <sphereGeometry args={[60, 32, 16]} />
      <meshBasicMaterial color="#0b0807" side={BackSide} />
    </mesh>
  )
}

/* -------------------------------------------------------------------------- */
/* Scene                                                                      */
/* -------------------------------------------------------------------------- */

function StageScene({ scene, onSelect, onHover, onMove, editMode }) {
  const mapping = useStage()
  const placements = useMemo(
    () => layoutObjects(scene.objects, mapping),
    [scene.objects, mapping],
  )

  return (
    <>
      <Lighting atmosphere={scene.atmosphere} />
      {scene.background.url && <VoidBackdrop />}
      <Background background={scene.background} />
      <Floor stage={scene.stage} />

      {scene.objects.map((object) => {
        const ObjectComponent = getObjectComponent(object.type)
        const placement = placements.get(object.id)

        if (!placement) return null

        return (
          <Interactable
            key={object.id}
            object={object}
            placement={placement}
            onSelect={onSelect}
            onHover={onHover}
            onMove={onMove}
            editMode={editMode}
          >
            {(hovered) => <ObjectComponent hovered={hovered} />}
          </Interactable>
        )
      })}

      {scene.objects.map((object) => {
        const placement = placements.get(object.id)

        if (!placement) return null

        return (
          <ContactShadow
            key={`shadow_${object.id}`}
            object={object}
            placement={placement}
          />
        )
      })}

      <CameraRig enabled={!editMode} orbit={scene.stage.orbit} />
    </>
  )
}

function SceneContents({ scene, ...rest }) {
  return (
    <StageProvider background={scene.background} stage={scene.stage}>
      <StageScene scene={scene} {...rest} />
    </StageProvider>
  )
}

export default function Scene({
  scene = MOCK_SCENE,
  loading = false,
  onSelect,
  onHover,
}) {
  const [override, setOverride] = useState(null)
  const [edited, setEdited] = useState(null)
  const [editMode, setEditMode] = useState(false)

  const incoming = useMemo(() => normalizeScene(scene), [scene])
  // A dev override/edit is tied to the incoming scene it was made against, so
  // generating a new memory always wins over stale calibration state.
  const active = useMemo(() => {
    if (edited?.base === incoming) return edited.scene
    if (override?.base === incoming) return normalizeScene(override.scene)
    return incoming
  }, [edited, override, incoming])

  const handleMove = useCallback(
    (id, position) => {
      setEdited((previous) => {
        const base = previous?.base === incoming ? previous.scene : active

        return {
          base: incoming,
          scene: {
            ...base,
            objects: base.objects.map((object) =>
              object.id === id ? { ...object, position } : object,
            ),
          },
        }
      })
    },
    [active, incoming],
  )

  const handleApply = useCallback(
    (next) => {
      setEdited(null)
      setOverride({ base: incoming, scene: next })
      setEditMode(false)
    },
    [incoming],
  )

  const handleReset = useCallback(() => {
    setEdited(null)
    setOverride(null)
    setEditMode(false)
  }, [])

  const toggleEditMode = useCallback(() => {
    if (!editMode) setEdited({ base: incoming, scene: normalizeScene(active) })
    setEditMode((value) => !value)
  }, [active, editMode, incoming])

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 50% 45%, #3a2a20 0%, #1a1210 60%, #0b0807 100%)',
      }}
    >
      <Canvas
        // The background image supplies the room and its baked lighting; props
        // use cheap contact blobs instead of a shadow map that would disagree
        // with the painted light direction.
        gl={{ alpha: true }}
        dpr={[1, 2]}
        camera={{
          position: [0, 0, CAMERA_Z],
          fov: CAMERA_FOV,
          near: 0.1,
          far: 100,
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <SceneContents
          scene={active}
          onSelect={onSelect}
          onHover={onHover}
          onMove={handleMove}
          editMode={editMode}
        />
      </Canvas>

      {/* Vignette binds the painted backdrop and the 3D floor together. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at 50% 42%, rgba(0, 0, 0, 0) 38%, rgba(11, 8, 7, 0.45) 100%)',
        }}
      />

      {/* Soft fade-through when the scene changes; remounts on each new scene. */}
      <div
        key={`${active.id}:${active.background.url ?? ''}`}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 4,
          pointerEvents: 'none',
          background: '#0b0807',
          animation: 'memoverse-scene-fade 500ms ease-out forwards',
        }}
      />

      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            color: 'rgba(255, 220, 190, 0.75)',
            fontFamily: 'ui-monospace, monospace',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            fontSize: 12,
          }}
        >
          building your memory…
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          zIndex: 5,
          pointerEvents: 'none',
          textAlign: 'right',
          lineHeight: 1.6,
          color: 'rgba(255, 220, 190, 0.55)',
          fontFamily: 'ui-monospace, Consolas, monospace',
          fontSize: 11,
          letterSpacing: '0.06em',
        }}
      >
        scroll — zoom
        <br />
        drag — orbit
        <br />
        right-drag — pan
        <br />
        double-click — reset
      </div>

      {import.meta.env.DEV && (
        <DevScenePanel
          key={JSON.stringify(incoming)}
          scene={active}
          baseScene={incoming}
          editMode={editMode}
          onToggleEditMode={toggleEditMode}
          onApply={handleApply}
          onReset={handleReset}
        />
      )}
    </div>
  )
}
