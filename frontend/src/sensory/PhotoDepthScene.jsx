import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'

// Generate a smooth depth map texture from the uploaded image so the 2D photo becomes a 3D relief mesh
function createDepthMapFromImage(imgElement) {
  const canvas = document.createElement('canvas')
  const width = 256
  const height = 256
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(imgElement, 0, 0, width, height)

  const imgData = ctx.getImageData(0, 0, width, height)
  const data = imgData.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    // Combine perceived luminance + vertical gradient (lower pixels closer, brighter foregrounds pop)
    const yRatio = Math.floor(i / 4 / width) / height
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    const depth = Math.min(255, Math.max(0, luma * 0.65 + yRatio * 255 * 0.35))
    data[i] = depth
    data[i + 1] = depth
    data[i + 2] = depth
  }
  ctx.putImageData(imgData, 0, 0)

  const depthTex = new THREE.CanvasTexture(canvas)
  depthTex.needsUpdate = true
  return depthTex
}

// Automatically extract distinct focal regions & story sentences when AI coordinates aren't provided
function extractHotspotsFromStoryAndPhoto(description = '', sceneObjects = []) {
  // 1. If backend AI returned objects from the photo, map them into 3D photo space
  if (Array.isArray(sceneObjects) && sceneObjects.length > 0) {
    return sceneObjects.map((obj, idx) => {
      const [rawX = 0, rawY = 0, rawZ = 0] = obj.position || [0, 0, 0]
      // Normalize coordinates onto the 3D photo mesh surface
      const x = Math.max(-3.8, Math.min(3.8, rawX))
      const y = Math.max(-2.2, Math.min(2.2, rawY))
      const z = Math.max(0.2, Math.min(1.4, (rawZ + 4) * 0.25))
      return {
        id: obj.id || `hotspot-${idx}`,
        title: (obj.label || obj.type || `Detail ${idx + 1}`).toUpperCase(),
        narration: obj.memory || `Focusing on the ${obj.label || obj.type} in your photograph.`,
        position: [x, y, z],
        audioUrl: obj.audioUrl || null,
      }
    })
  }

  // 2. Otherwise split the user's written story into meaningful memory moments across the 3D photo
  const sentences = description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5)

  if (sentences.length === 0) {
    return [
      {
        id: 'focal-center',
        title: 'Center of the Memory',
        narration: 'Look closely at the heart of this moment captured in your photograph.',
        position: [0, 0.2, 0.9],
      },
      {
        id: 'focal-left',
        title: 'Left Foreground',
        narration: 'Over on the left side, the atmosphere and surrounding details frame the scene.',
        position: [-2.1, -0.3, 0.85],
      },
      {
        id: 'focal-right',
        title: 'Right Details',
        narration: 'On the right side of the photograph, light and texture bring the memory back to life.',
        position: [2.1, 0.4, 0.85],
      },
    ]
  }

  // Distribute story sentences across natural focal points of the 3D photo
  const focalLayout = [
    [-1.8, 0.3, 0.9],
    [0.0, 0.1, 1.1],
    [1.9, -0.2, 0.9],
    [-1.1, -0.9, 1.0],
    [1.3, 0.8, 0.8],
  ]

  return sentences.slice(0, 5).map((sentence, idx) => {
    const pos = focalLayout[idx % focalLayout.length]
    // Extract a short title from the sentence
    const words = sentence.replace(/[^\w\s]/g, '').split(/\s+/).slice(0, 4).join(' ')
    return {
      id: `story-stop-${idx}`,
      title: words ? `${words}...` : `Memory Detail ${idx + 1}`,
      narration: sentence,
      position: pos,
      audioUrl: null,
    }
  })
}

// 1. 3D Depth-Extruded Interactive Photograph World
function Photo3DWorld({ imageUrl, mood, onSurfaceClick }) {
  const [textures, setTextures] = useState({ colorMap: null, depthMap: null, aspect: 1.5 })
  const meshRef = useRef()

  useEffect(() => {
    if (!imageUrl) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const colorTex = new THREE.Texture(img)
      colorTex.colorSpace = THREE.SRGBColorSpace
      colorTex.needsUpdate = true

      const depthTex = createDepthMapFromImage(img)
      const aspect = img.width && img.height ? img.width / img.height : 1.5
      setTextures({ colorMap: colorTex, depthMap: depthTex, aspect })
    }
    img.src = imageUrl
  }, [imageUrl])

  // Curved 3D Diorama Geometry so the user feels "inside" the photograph
  const geometry = useMemo(() => {
    const width = Math.min(11, Math.max(7.5, 6.2 * textures.aspect))
    const height = 6.2
    const geo = new THREE.PlaneGeometry(width, height, 160, 160)
    const pos = geo.attributes.position

    // Curve the edges forward slightly like an immersive 3D dome/diorama
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i)
      const vy = pos.getY(i)
      const curveZ = -0.045 * (vx * vx) - 0.025 * (vy * vy)
      pos.setZ(i, curveZ)
    }
    geo.computeVertexNormals()
    return geo
  }, [textures.aspect])

  // Subtle breathing motion in 3D space
  useFrame((state) => {
    if (!meshRef.current) return
    meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.25) * 0.03
  })

  if (!textures.colorMap) return null

  return (
    <group>
      {/* Main 3D Depth-Displaced Photo Mesh */}
      <mesh
        ref={meshRef}
        geometry={geometry}
        onClick={(e) => {
          // Shift+Click anywhere on the 3D photo to add a custom interactive object hotspot
          if (e.shiftKey && onSurfaceClick) {
            e.stopPropagation()
            onSurfaceClick([e.point.x, e.point.y, e.point.z + 0.35])
          }
        }}
      >
        <meshStandardMaterial
          map={textures.colorMap}
          displacementMap={textures.depthMap}
          displacementScale={1.35}
          displacementBias={-0.35}
          roughness={0.6}
          metalness={0.08}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Reflective 3D Floor beneath the photo world for depth grounding */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.2, 0]}>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial
          color={mood === 'Joyful' ? '#1e1b4b' : mood === 'Melancholic' ? '#090d16' : '#181326'}
          roughness={0.9}
        />
      </mesh>
    </group>
  )
}

// 2. Interactive 3D Object Anchor Floating Directly on the 3D Photo
function PhotoObjectHotspot({ stop, index, isActive, onSelect }) {
  const ringRef = useRef()
  const [hovered, setHovered] = useState(false)

  useFrame((state) => {
    if (!ringRef.current) return
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 3.5 + index) * 0.15
    ringRef.current.scale.set(pulse, pulse, pulse)
  })

  const accent = isActive ? '#fbbf24' : hovered ? '#38bdf8' : '#a855f7'

  return (
    <group position={stop.position}>
      {/* Glowing 3D Interactive Orb on the Object */}
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          onSelect(index)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'auto'
        }}
      >
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={isActive ? 2.2 : 1.1}
        />
      </mesh>

      {/* Pulsing Halo Ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.22, 0.28, 32]} />
        <meshBasicMaterial color={accent} side={THREE.DoubleSide} transparent opacity={0.75} />
      </mesh>

      {/* Floating 3D Caption when active or hovered */}
      {(isActive || hovered) && (
        <Html position={[0, 0.42, 0]} center distanceFactor={6}>
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.92)',
              color: '#f8fafc',
              padding: '10px 14px',
              borderRadius: '12px',
              width: isActive ? '240px' : '170px',
              border: `1px solid ${accent}`,
              boxShadow: '0 10px 25px rgba(0,0,0,0.6)',
              pointerEvents: 'none',
              fontFamily: 'system-ui, sans-serif',
              backdropFilter: 'blur(6px)',
            }}
          >
            <div
              style={{
                fontSize: '10.5px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: accent,
                marginBottom: '4px',
              }}
            >
              {isActive ? '🔊 Narrating Object' : `Click to Inspect #${index + 1}`}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: isActive ? '4px' : 0 }}>
              {stop.title}
            </div>
            {isActive && (
              <div style={{ fontSize: '12px', lineHeight: 1.4, opacity: 0.92 }}>
                {stop.narration}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  )
}

// 3. Guided Camera & Voiceover Tour Controller Inside the 3D Photo
function GuidedPhotoTourController({
  tourStops,
  activeStopIndex,
  isPlaying,
  onStopComplete,
  controlsRef,
}) {
  const { camera } = useThree()
  const targetCamPos = useRef(new THREE.Vector3(0, 0, 5.2))
  const targetLookAt = useRef(new THREE.Vector3(0, 0, 0))
  const isMoving = useRef(false)

  useEffect(() => {
    window.speechSynthesis?.cancel()

    if (activeStopIndex === null || activeStopIndex < 0 || activeStopIndex >= tourStops.length) {
      // Full 3D Photo overview position
      targetCamPos.current.set(0, 0, 5.2)
      targetLookAt.current.set(0, 0, 0)
      isMoving.current = true
      return
    }

    const stop = tourStops[activeStopIndex]
    targetCamPos.current.set(...stop.cameraPos)
    targetLookAt.current.set(...stop.lookAtPos)
    isMoving.current = true

    if (!isPlaying) return

    const timer = setTimeout(() => {
      if (stop.audioUrl) {
        const audio = new Audio(stop.audioUrl)
        audio.onended = () => onStopComplete(activeStopIndex)
        audio.onerror = () => onStopComplete(activeStopIndex)
        audio.play().catch(() => onStopComplete(activeStopIndex))
        return
      }

      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(stop.narration)
        utterance.rate = 0.94
        utterance.onend = () => onStopComplete(activeStopIndex)
        utterance.onerror = () => onStopComplete(activeStopIndex)
        window.speechSynthesis.speak(utterance)
      } else {
        setTimeout(() => onStopComplete(activeStopIndex), 4000)
      }
    }, 650)

    return () => {
      clearTimeout(timer)
      window.speechSynthesis?.cancel()
    }
  }, [activeStopIndex, isPlaying, tourStops, onStopComplete])

  useFrame((_, delta) => {
    if (!isMoving.current) return
    const step = Math.min(1, delta * 2.4)
    camera.position.lerp(targetCamPos.current, step)

    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, step)
      controlsRef.current.update()
    }

    if (!isPlaying && camera.position.distanceTo(targetCamPos.current) < 0.05) {
      isMoving.current = false
    }
  })

  return null
}

export default function Scene({
  scene,
  imageUrl,
  mood = 'Nostalgic',
  description = '',
  tourPlaying = false,
  onTourStateChange,
}) {
  const [activeStopIndex, setActiveStopIndex] = useState(null)
  const [internalPlaying, setInternalPlaying] = useState(false)
  const [customHotspots, setCustomHotspots] = useState([])
  const controlsRef = useRef()

  const isPlaying = tourPlaying || internalPlaying

  useEffect(() => {
    setInternalPlaying(tourPlaying)
    if (tourPlaying && activeStopIndex === null) {
      setActiveStopIndex(0)
    }
    if (!tourPlaying) {
      window.speechSynthesis?.cancel()
    }
  }, [tourPlaying])

  // Reset custom hotspots when user uploads a new photo
  useEffect(() => {
    setCustomHotspots([])
    setActiveStopIndex(null)
    setInternalPlaying(false)
  }, [imageUrl])

  // Build interactive 3D object hotspots inside the photo
  const photoHotspots = useMemo(() => {
    const base = extractHotspotsFromStoryAndPhoto(description || scene?.description, scene?.objects)
    return [...base, ...customHotspots]
  }, [description, scene, customHotspots])

  // Build sequential Guided Audio Tour stops (Overview + each 3D Hotspot inside the photo)
  const tourStops = useMemo(() => {
    const storyText = description || scene?.description || ''
    const introStop = {
      id: 'photo-overview',
      hotspotIndex: null,
      title: scene?.title || 'Entering Your Photograph',
      narration: storyText
        ? `Stepping inside your memory. ${storyText}`
        : 'Stepping inside your 3D photograph. Click any glowing point to explore the details up close.',
      cameraPos: [0, 0.2, 5.2],
      lookAtPos: [0, 0, 0],
      audioUrl: null,
    }

    const detailStops = photoHotspots.map((spot, idx) => {
      const [x, y, z] = spot.position
      return {
        id: spot.id,
        hotspotIndex: idx,
        title: spot.title,
        narration: spot.narration,
        // Fly camera close to this specific object inside the 3D photo
        cameraPos: [x * 0.75, y * 0.75, z + 2.1],
        lookAtPos: [x, y, z],
        audioUrl: spot.audioUrl || null,
      }
    })

    return [introStop, ...detailStops]
  }, [scene, description, photoHotspots])

  const activeStop = activeStopIndex !== null ? tourStops[activeStopIndex] : null

  useEffect(() => {
    onTourStateChange?.({ isPlaying, activeStop })
  }, [isPlaying, activeStop, onTourStateChange])

  const handleStopComplete = useCallback(
    (completedIdx) => {
      if (completedIdx + 1 < tourStops.length) {
        setActiveStopIndex(completedIdx + 1)
      } else {
        setInternalPlaying(false)
        setActiveStopIndex(null)
        onTourStateChange?.({ isPlaying: false, activeStop: null })
      }
    },
    [tourStops.length, onTourStateChange]
  )

  const handleSelectHotspot = (hotspotIdx) => {
    // +1 because index 0 in tourStops is the overview intro
    const stopIdx = hotspotIdx + 1
    setActiveStopIndex(stopIdx)
    setInternalPlaying(true)
    onTourStateChange?.({ isPlaying: true, activeStop: tourStops[stopIdx] })
  }

  // Allow user to Shift+Click any object in the 3D photo to add a custom memory hotspot
  const handleAddCustomHotspot = (point3D) => {
    const label = window.prompt('Name this object in your photo (e.g., Grandmother’s Radio):')
    if (!label) return
    const memoryText = window.prompt('What do you remember about this object?', `This is the ${label} in my memory.`)
    setCustomHotspots((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        title: label.toUpperCase(),
        narration: memoryText || label,
        position: point3D,
      },
    ])
  }

  const moodLightColor =
    mood === 'Joyful' ? '#fef08a' : mood === 'Melancholic' ? '#93c5fd' : '#fdba74'

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '460px', position: 'relative' }}>
      <Canvas camera={{ position: [0, 0, 5.2], fov: 50 }}>
        <ambientLight intensity={mood === 'Melancholic' ? 0.65 : 0.85} />
        <pointLight position={[4, 4, 6]} intensity={1.4} color={moodLightColor} />
        <pointLight position={[-4, -2, 4]} intensity={0.6} color="#93c5fd" />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.06}
          maxDistance={8}
          minDistance={1.4}
        />

        {imageUrl ? (
          <>
            {/* The Uploaded Image Transformed into a 3D Depth-Displaced World */}
            <Photo3DWorld
              imageUrl={imageUrl}
              mood={mood}
              onSurfaceClick={handleAddCustomHotspot}
            />

            {/* Interactive 3D Object Hotspots Inside the Photo */}
            {photoHotspots.map((spot, idx) => (
              <PhotoObjectHotspot
                key={spot.id}
                stop={spot}
                index={idx}
                isActive={activeStop?.hotspotIndex === idx}
                onSelect={handleSelectHotspot}
              />
            ))}
          </>
        ) : (
          <Html center>
            <div
              style={{
                color: '#cbd5e1',
                background: 'rgba(15, 23, 42, 0.85)',
                padding: '16px 22px',
                borderRadius: '12px',
                textAlign: 'center',
                width: '280px',
                fontFamily: 'system-ui, sans-serif',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <strong>Upload a Photograph</strong>
              <p style={{ fontSize: '13px', opacity: 0.8, marginTop: '6px' }}>
                Your photo will transform into an interactive 3D depth space with guided audio hotspots.
              </p>
            </div>
          </Html>
        )}

        {/* Camera & Voiceover Tour Controller */}
        <GuidedPhotoTourController
          tourStops={tourStops}
          activeStopIndex={activeStopIndex}
          isPlaying={isPlaying}
          onStopComplete={handleStopComplete}
          controlsRef={controlsRef}
        />
      </Canvas>

      {/* Helper Pill Overlay for Interacting with Objects in the 3D Photo */}
      {imageUrl && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'rgba(15, 23, 42, 0.8)',
            color: '#e2e8f0',
            padding: '6px 12px',
            borderRadius: '999px',
            fontSize: '12px',
            border: '1px solid rgba(255,255,255,0.15)',
            pointerEvents: 'none',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          💡 Click any glowing orb to inspect • <strong>Shift + Click</strong> anywhere on the 3D photo to tag an object
        </div>
      )}
    </div>
  )
}