import { lazy, Suspense, useEffect, useState } from 'react'
import { resolveArchivedWorld, saveWorldCustomizations } from './worldPersistence.js'
import { saveEntry } from './journalStore.js'
import './ViewerChrome.css'

const Viewer = lazy(() => import('../integration/WorldLabsViewer.jsx'))
export default function ArchivedWorldViewer({ memory, world, ...props }) {
  const [resolved, setResolved] = useState(null)
  const [error, setError] = useState('')
  const [changes, setChanges] = useState(null)
  const [savedWorld, setSavedWorld] = useState(world)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setSavedWorld(current => world.revision > current.revision ? world : current)
  }, [world])
  useEffect(() => {
    let active = true
    async function refresh() {
      try { const value = await resolveArchivedWorld(savedWorld); if (active) { setResolved(value); setError('') } }
      catch (err) { if (active) setError(err.message) }
    }
    refresh()
    const timer = setInterval(refresh, 45 * 60 * 1000)
    return () => { active = false; clearInterval(timer) }
  }, [savedWorld])
  async function save() {
    setSaving(true); setError('')
    try {
      const updated = await saveWorldCustomizations({ ...memory, world: savedWorld }, changes)
      setSavedWorld(updated); setChanges(null)
      await saveEntry(memory.owner, { ...memory, world: updated, cloudUpdatedAt: null })
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }
  return <div className="mv-clean-viewer">
    {error && <p role="alert">{error}</p>}
    {!resolved ? <p role="status">Opening your saved world…</p> : <Suspense fallback={<p role="status">Opening viewer…</p>}><Viewer {...props} world={resolved} enhancementResponse={savedWorld.enhancementResponse} onEnhancementsChange={props.previewOnly ? undefined : setChanges} /></Suspense>}
    {!props.previewOnly && changes && <button className="mj-primary" style={{ position: 'absolute', top: 90, right: 24, zIndex: 5 }} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save object placements'}</button>}
    {!props.previewOnly && props.activeStep != null && resolved?.audioUrls?.length > 0 && <audio key={props.activeStep} controls aria-label="Saved guided narration" style={{ position: 'absolute', bottom: 100, left: 24, zIndex: 5 }} src={resolved.audioUrls[savedWorld.guidedTour?.chapters?.[props.activeStep]?.audioAssetIndex ?? 0]} />}
  </div>
}
