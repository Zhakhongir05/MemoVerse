import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useTexture } from '@react-three/drei'
import { BackSide, SRGBColorSpace } from 'three'

import Interactable from './Interactable'
import { getObjectComponent } from './registry'
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

function StageProvider({ background, children }) {
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
      }),
    [size.width, size.height, camera.fov, background.width, background.height],
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

function CameraRig({ enabled = true }) {
  const controls = useRef()
  const domElement = useThree((state) => state.gl.domElement)

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
      maxDistance={24}
      minPolarAngle={Math.PI / 2 - 0.7}
      maxPolarAngle={Math.PI / 2 + 0.5}
      minAzimuthAngle={-1.0}
      maxAzimuthAngle={1.0}
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

function SceneContents({ scene, onSelect, onHover, onMove, editMode }) {
  return (
    <StageProvider background={scene.background}>
      <Lighting atmosphere={scene.atmosphere} />
      {scene.background.url && <VoidBackdrop />}
      <Background background={scene.background} />

      {scene.objects.map((object) => {
        const ObjectComponent = getObjectComponent(object.type)

        return (
          <Interactable
            key={object.id}
            object={object}
            onSelect={onSelect}
            onHover={onHover}
            onMove={onMove}
            editMode={editMode}
          >
            {(hovered) => <ObjectComponent hovered={hovered} />}
          </Interactable>
        )
      })}

      <CameraRig enabled={!editMode} />
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
        // The background image supplies the room and its lighting; there is no
        // 3D floor for shadows to land on, so the shadow map stays off.
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
