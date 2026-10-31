import { Component, Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { SRGBColorSpace } from 'three'

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
/* Scene                                                                      */
/* -------------------------------------------------------------------------- */

function SceneContents({ scene, onSelect, onHover }) {
  return (
    <StageProvider background={scene.background}>
      <Lighting atmosphere={scene.atmosphere} />
      <Background background={scene.background} />

      {scene.objects.map((object) => {
        const ObjectComponent = getObjectComponent(object.type)

        return (
          <Interactable
            key={object.id}
            object={object}
            onSelect={onSelect}
            onHover={onHover}
          >
            {(hovered) => <ObjectComponent hovered={hovered} />}
          </Interactable>
        )
      })}
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

  const incoming = useMemo(() => normalizeScene(scene), [scene])
  const active = useMemo(
    () => (override ? normalizeScene(override) : incoming),
    [override, incoming],
  )

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
        gl={{ alpha: true }}
        shadows
        dpr={[1, 2]}
        camera={{
          position: [0, 0, CAMERA_Z],
          fov: CAMERA_FOV,
          near: 0.1,
          far: 100,
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <SceneContents scene={active} onSelect={onSelect} onHover={onHover} />
      </Canvas>

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

      {import.meta.env.DEV && (
        <DevScenePanel
          key={JSON.stringify(incoming)}
          scene={incoming}
          onApply={setOverride}
          onReset={() => setOverride(null)}
        />
      )}
    </div>
  )
}
