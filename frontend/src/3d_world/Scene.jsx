import WorldLabsViewer from '../integration/WorldLabsViewer.jsx'
import './scene.css'

/**
 * Adapter between the Dashboard's optional SceneRenderer slot and the hybrid
 * World Labs scene. ScenePreview discovers this file with import.meta.glob and
 * renders it with { scene, imageUrl, mood }; only `mood` is forwarded because
 * the saved World Labs world is fixed (no regeneration here).
 */
export default function Scene({ mood }) {
  return <div className="mv-hybrid-scene">
    <WorldLabsViewer mood={mood} />
  </div>
}
