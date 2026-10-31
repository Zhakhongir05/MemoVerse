import { Component, lazy, Suspense } from 'react'

const Scene = lazy(() => import('../integration/ConnectedWorld.jsx'))

class SceneBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <div className="mv-scene-fallback" role="alert">
        <h2>The 3D preview could not load.</h2>
        <p>Check that hardware acceleration and WebGL are available in your browser.</p>
        <button className="mv-primary" onClick={() => this.setState({ failed: false })}>Retry 3D preview</button>
      </div>
    }
    return this.props.children
  }
}

// Keeps the renderer lazy-loaded until the studio opens; the landing stays lightweight.
export default function ScenePreview(props) {
  return <SceneBoundary>
    <Suspense fallback={<div className="mv-scene-fallback" role="status">Loading your scene viewer…</div>}>
      <Scene {...props} />
    </Suspense>
  </SceneBoundary>
}
