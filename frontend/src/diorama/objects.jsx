import { DoubleSide } from 'three'

const COLORS = {
  bedFrame: '#4f3527',
  mattress: '#d8c6a5',
  blanket: '#4b6f6b',
  pillow: '#e7dcc4',
  desk: '#4a3023',
  rug: '#5d4038',
  rugInner: '#7a5a47',
}

// Every prop is built with its origin at the base center (y = 0), matching the
// normalized position convention in SCENE_SCHEMA.md.

export function Bed() {
  return (
    <group>
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

export function Desk() {
  const legPositions = [
    [-1.85, 0.65, 0.7],
    [1.85, 0.65, 0.7],
    [-1.85, 0.65, -0.7],
    [1.85, 0.65, -0.7],
  ]

  return (
    <group>
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

export function CRT_TV({ hovered = false }) {
  return (
    <group>
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

      {/* Pale green CRT spill */}
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

export function DeskLamp() {
  return (
    <group>
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

// Wall prop. Origin is the base center (bottom of the poster).
export function Poster() {
  return (
    <group>
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[1.5, 2.0, 0.05]} />
        <meshStandardMaterial color="#2a211b" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.0, 0.035]}>
        <planeGeometry args={[1.34, 1.84]} />
        <meshStandardMaterial color="#c96f4a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.35, 0.04]}>
        <planeGeometry args={[0.86, 0.5]} />
        <meshStandardMaterial color="#e9d5a8" roughness={0.9} />
      </mesh>
    </group>
  )
}

// Flat floor prop. In a straight-on 2.5D scene this is edge-on and effectively
// invisible; it exists for legacy payloads / a tilted camera.
export function Rug() {
  return (
    <group>
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

// Rendered for unknown backend types so nothing silently disappears.
export function Fallback({ hovered = false }) {
  return (
    <group>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={hovered ? '#8a7161' : '#5c4a3d'}
          roughness={0.9}
        />
      </mesh>
    </group>
  )
}
