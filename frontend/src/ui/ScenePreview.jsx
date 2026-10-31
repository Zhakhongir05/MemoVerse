import React from 'react'
import Scene from '../3d_world/Scene'

export default function ScenePreview({ scene }) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '600px', position: 'relative' }}>
      <Scene scene={scene} />
    </div>
  )
}