import { Component, lazy, Suspense } from 'react'

// The UI branch can deploy before the teammate's scene branch is merged.
// Vite resolves only files actually present in the checkout at build time.
const sceneModules = import.meta.glob('../3d_world/Scene.{jsx,js,tsx}')
const loadScene = Object.values(sceneModules)[0]
const Scene = loadScene ? lazy(loadScene) : null

class SceneBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <div className="mv-scene-fallback" role="alert">
        <h2>The 3D preview could not load.</h2>
        <p>Please try opening this memory again.</p>
        <button className="mv-primary" onClick={() => this.setState({ failed: false })}>Retry 3D preview</button>
      </div>
    }
    return this.props.children
  }
}

// Keeps the renderer lazy-loaded until the studio opens; the landing stays lightweight.
export default function ScenePreview(props) {
  if (!Scene) return <div className="mv-scene-fallback" role="status">
    <h2>Your 3D world is waiting.</h2>
    <p>This world is still taking shape. Your story and photographs are ready to revisit.</p>
  </div>
  return <SceneBoundary>
    <Suspense fallback={<div className="mv-scene-fallback" role="status">Opening your memory world…</div>}>
      <Scene {...props} />
    </Suspense>
  </SceneBoundary>
}
