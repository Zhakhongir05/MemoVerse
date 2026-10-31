import React from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

// This acts as a stand-in for your nostalgic objects until the AI pipeline is ready
const PlaceholderMemory = () => {
  return (
    <mesh onClick={(e) => console.log('3D Object Clicked! Trigger AI agent.')}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="hotpink" />
    </mesh>
  )
}

export default function Scene() {
  return (
    // The Canvas must have a defined height/width to render properly
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [0, 2, 5], fov: 50 }}>
        {/* Environment Lighting */}
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        
        {/* Camera Controls */}
        <OrbitControls makeDefault />
        
        {/* The 3D Assets */}
        <PlaceholderMemory />
      </Canvas>
    </div>
  )
}