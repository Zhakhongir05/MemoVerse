import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { DoubleSide } from 'three'

const COLORS = {
  floor: '#3d2a1f',
  wallBack: '#7b5a43',
  wallSide: '#6a4c39',
  bedFrame: '#4f3527',
  mattress: '#d8c6a5',
  blanket: '#4b6f6b',
  pillow: '#e7dcc4',
  desk: '#4a3023',
  rug: '#5d4038',
  rugInner: '#7a5a47',
}

function Room() {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color={COLORS.floor} roughness={0.9} />
      </mesh>

      {/* Back wall */}
      <mesh position={[0, 3, -5]} receiveShadow>
        <boxGeometry args={[10, 6, 0.1]} />
        <meshStandardMaterial color={COLORS.wallBack} roughness={0.95} />
      </mesh>

      {/* Left wall, forming a corner */}
      <mesh position={[-5, 3, 0]} receiveShadow>
        <boxGeometry args={[0.1, 6, 10]} />
        <meshStandardMaterial color={COLORS.wallSide} roughness={0.95} />
      </mesh>
    </group>
  )
}

function Bed() {
  // Headboard sits toward the back wall, blanket toward the camera
  return (
    <group position={[-3.2, 0, 1.2]}>
      <mesh position={[0, 0.225, 0]} castShadow receiveShadow>
        <boxGeometry args={[3, 0.45, 4.2]} />
        <meshStandardMaterial color={COLORS.bedFrame} roughness={0.8} />
      </mesh>

      <mesh position={[0, 0.675, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.85, 0.45, 4.0]} />
        <meshStandardMaterial color={COLORS.mattress} roughness={0.95} />
      </mesh>

      {/* Headboard */}
      <mesh position={[0, 0.7, -2.2]} castShadow receiveShadow>
        <boxGeometry args={[3, 1.4, 0.22]} />
        <meshStandardMaterial color={COLORS.bedFrame} roughness={0.8} />
      </mesh>

      {/* Two pillows */}
      <mesh position={[-0.67, 1.05, -1.6]} rotation={[0.08, 0, 0]} castShadow>
        <boxGeometry args={[1.15, 0.3, 0.85]} />
        <meshStandardMaterial color={COLORS.pillow} roughness={1} />
      </mesh>
      <mesh position={[0.67, 1.05, -1.6]} rotation={[0.08, 0, 0]} castShadow>
        <boxGeometry args={[1.15, 0.3, 0.85]} />
        <meshStandardMaterial color={COLORS.pillow} roughness={1} />
      </mesh>

      {/* Blanket folded across the foot of the bed */}
      <mesh position={[0, 0.98, 0.75]} castShadow>
        <boxGeometry args={[2.95, 0.16, 2.6]} />
        <meshStandardMaterial color={COLORS.blanket} roughness={0.95} />
      </mesh>
    </group>
  )
}

function Desk() {
  const legPositions = [
    [-1.85, 0.65, 0.7],
    [1.85, 0.65, 0.7],
    [-1.85, 0.65, -0.7],
    [1.85, 0.65, -0.7],
  ]

  return (
    <group position={[2, 0, -4.1]}>
      <mesh position={[0, 1.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[4, 0.15, 1.7]} />
        <meshStandardMaterial color={COLORS.desk} roughness={0.7} />
      </mesh>

      {legPositions.map((position, index) => (
        <mesh key={index} position={position} castShadow>
          <boxGeometry args={[0.14, 1.3, 0.14]} />
          <meshStandardMaterial color={COLORS.desk} roughness={0.8} />
        </mesh>
      ))}

      {/* A couple of VHS tapes for atmosphere */}
      <mesh position={[-1.35, 1.415, 0.6]} rotation={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.36, 0.08, 0.23]} />
        <meshStandardMaterial color="#26262b" roughness={0.6} />
      </mesh>
      <mesh position={[-1.35, 1.495, 0.6]} rotation={[0, -0.12, 0]} castShadow>
        <boxGeometry args={[0.36, 0.08, 0.23]} />
        <meshStandardMaterial color="#22304a" roughness={0.6} />
      </mesh>
    </group>
  )
}

function CRT_TV({ position }) {
  const [hovered, setHovered] = useState(false)

  // Keep the cursor from getting stuck if the scene unmounts mid-hover
  useEffect(() => () => {
    document.body.style.cursor = 'auto'
  }, [])

  const handlePointerOver = (event) => {
    event.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }

  const handlePointerOut = (event) => {
    event.stopPropagation()
    setHovered(false)
    document.body.style.cursor = 'auto'
  }

  return (
    <group
      position={position}
      scale={hovered ? 1.06 : 1}
      onClick={(event) => {
        event.stopPropagation()
        console.log('MEMORY_TRIGGER: TV')
      }}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* TV body */}
      <mesh position={[0, 0.575, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 1.15, 1.1]} />
        <meshStandardMaterial
          color={hovered ? '#6d6257' : '#3b3734'}
          roughness={0.65}
          metalness={0.1}
        />
      </mesh>

      {/* Screen housing */}
      <mesh position={[-0.08, 0.65, 0.56]}>
        <boxGeometry args={[1.18, 0.78, 0.05]} />
        <meshStandardMaterial color="#101c1a" roughness={0.2} metalness={0.3} />
      </mesh>

      {/* Glowing screen */}
      <mesh position={[-0.08, 0.65, 0.59]}>
        <planeGeometry args={[1.04, 0.68]} />
        <meshStandardMaterial
          color="#8ff2d9"
          emissive="#5fd4b8"
          emissiveIntensity={hovered ? 1.8 : 1.2}
          toneMapped={false}
        />
      </mesh>

      {/* Control knobs */}
      <mesh position={[0.62, 0.78, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.06, 16]} />
        <meshStandardMaterial color="#1c1b1a" roughness={0.5} />
      </mesh>
      <mesh position={[0.62, 0.56, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.06, 16]} />
        <meshStandardMaterial color="#1c1b1a" roughness={0.5} />
      </mesh>

      {/* Speaker grill */}
      <mesh position={[0.62, 0.28, 0.57]}>
        <boxGeometry args={[0.28, 0.22, 0.03]} />
        <meshStandardMaterial color="#1c1b1a" roughness={0.9} />
      </mesh>

      {/* Rabbit-ear antennas */}
      <mesh position={[-0.12, 1.42, -0.2]} rotation={[0, 0, 0.4]}>
        <cylinderGeometry args={[0.012, 0.012, 0.75, 8]} />
        <meshStandardMaterial color="#9aa0a6" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0.12, 1.42, -0.2]} rotation={[0, 0, -0.4]}>
        <cylinderGeometry args={[0.012, 0.012, 0.75, 8]} />
        <meshStandardMaterial color="#9aa0a6" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Pale green CRT spill onto the desk */}
      <pointLight
        position={[0, 0.65, 0.9]}
        color="#6fe0c4"
        intensity={hovered ? 4 : 2.5}
        distance={3.5}
        decay={2}
      />
    </group>
  )
}

function DeskLamp({ position }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.06, 20]} />
        <meshStandardMaterial color="#2f2a26" roughness={0.6} />
      </mesh>

      <mesh position={[0, 0.535, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.95, 12]} />
        <meshStandardMaterial color="#2f2a26" roughness={0.6} />
      </mesh>

      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.17, 0.32, 0.34, 24, 1, true]} />
        <meshStandardMaterial
          color="#ffd9a8"
          emissive="#ff9f45"
          emissiveIntensity={0.6}
          side={DoubleSide}
          roughness={0.8}
        />
      </mesh>

      {/* The room's single, dim warm point light */}
      <pointLight
        position={[0, 1.1, 0]}
        color="#ffab5e"
        intensity={14}
        distance={14}
        decay={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-normalBias={0.03}
      />
    </group>
  )
}

function Poster() {
  return (
    <group position={[-1.2, 3.4, -4.93]}>
      <mesh>
        <boxGeometry args={[1.5, 2.0, 0.05]} />
        <meshStandardMaterial color="#2a211b" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.035]}>
        <planeGeometry args={[1.34, 1.84]} />
        <meshStandardMaterial color="#c96f4a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.35, 0.04]}>
        <planeGeometry args={[0.86, 0.5]} />
        <meshStandardMaterial color="#e9d5a8" roughness={0.9} />
      </mesh>
    </group>
  )
}

function Rug() {
  return (
    <group position={[0.6, 0, 2.2]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <circleGeometry args={[2, 48]} />
        <meshStandardMaterial color={COLORS.rug} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[1.55, 48]} />
        <meshStandardMaterial color={COLORS.rugInner} roughness={1} />
      </mesh>
    </group>
  )
}

export default function Scene({ children }) {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [7.5, 5.2, 9.5], fov: 45 }}
      >
        <color attach="background" args={['#0f0b09']} />
        <fog attach="fog" args={['#0f0b09', 14, 32]} />

        {/* Soft, warm room light */}
        <ambientLight color="#ffcf9e" intensity={0.55} />

        <Room />
        <Bed />
        <Desk />
        <Poster />
        <Rug />
        <DeskLamp position={[3.5, 1.375, -4.35]} />
        <CRT_TV position={[1.9, 1.375, -4.15]} />

        {children}

        <OrbitControls
          makeDefault
          target={[0, 1.2, 0]}
          enablePan={false}
          minDistance={6}
          maxDistance={18}
          maxPolarAngle={Math.PI / 2 - 0.08}
        />
      </Canvas>
    </div>
  )
}
