import WorldLabsViewer from '../integration/WorldLabsViewer.jsx'
import './scene.css'

/**
 * Adapter between the Dashboard's optional SceneRenderer slot and the hybrid
 * World Labs scene. ScenePreview discovers this file with import.meta.glob and
 * renders it with { scene, imageUrl, mood }. The World Labs world itself is
 * pinned until the generation API is wired, but the uploaded photograph is
 * forwarded so the backend can derive overlays for this memory.
 */
export default function Scene({ mood, imageUrl, scene }) {
  return <div className="mv-hybrid-scene">
    <WorldLabsViewer mood={mood} imageUrl={imageUrl} scene={scene} />
  </div>
}
