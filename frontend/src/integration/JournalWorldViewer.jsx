import { lazy, Suspense, useEffect, useState } from 'react'
import '../3d_world/scene.css'
import './journalWorld.css'
import { isMemoryWorld } from './savedWorld.js'
import { waitForJournalWorld } from './journalWorldApi.js'
import { saveEntry } from '../ui/journalStore.js'
import { supabase } from '../ui/supabaseClient.js'
const Viewer = lazy(() => import('./WorldLabsViewer.jsx'))

export default function JournalWorldViewer(props) {
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    setJob(null); setError('')
    const read = () => waitForJournalWorld(props.memory.id, { signal: controller.signal, onStatus: value => { if (!controller.signal.aborted) setJob(value) } }).then(value => {
      if (value.status === 'succeeded' && !isMemoryWorld(value.world)) throw new Error('Saved 3D assets are unavailable. Your memory has not been regenerated.')
      if (!controller.signal.aborted) { setJob(value); setError('') }
    }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    read()
    // Refresh short-lived asset references during extended visits; never POST.
    const timer = setInterval(read, 45 * 60 * 1000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [props.memory.id])
  // Placements live on the memory's own world record. The binding-table save
  // route needs public.journal_worlds, which this project does not have, so the
  // signed-in account writes the same field the journal sync already owns.
  async function save({ enhancements, anchors }) {
    if(saving) return
    setSaving(true); setSaved('Saving placements…')
    try {
      const memory = props.memory
      const previous = memory.world || {}
      const world = {
        ...previous,
        enhancements: enhancements || null,
        anchors: anchors || [],
        experience_revision: Number(previous.experience_revision || 0) + 1,
      }
      const { data, error } = await supabase.from('journal_entries')
        .update({ world }).eq('id', memory.id).eq('user_id', memory.owner).select('id')
      if (error) throw new Error('Placements could not be saved. Sign in again and retry.')
      if (!data?.length) throw new Error('Placements could not be saved to your account. Sign in again and retry.')
      await saveEntry(memory.owner, { ...memory, world }).catch(() => {})
      setSaved('Placements saved to your account.')
    } catch (error) { setSaved(error.message) }
    finally { setSaving(false) }
  }
  if (error) return <p role="alert">{error} Reopen this memory to retry access. No new world has been generated.</p>
  if (job && !['pending', 'submitting', 'succeeded'].includes(job.status)) return <p role="alert">This memory’s 3D world is not ready. Open the memory to check its saved status.</p>
  if (job?.status !== 'succeeded') return <p role="status">Opening saved world…</p>
  if (!isMemoryWorld(job.world)) return <p role="alert">Saved 3D assets are unavailable. Your memory has not been regenerated.</p>
  const chapter = props.previewOnly || props.activeStep === null ? null : job.guided_tour?.chapters?.[props.activeStep]
  // The memory's own world record carries placements saved from this account.
  const savedWorld = props.memory.world || {}
  return <div className="mv-hybrid-scene journal-world-viewer"><p className="journal-world-feedback" role="status">{saved}</p>{chapter && <section className="journal-world-tour" aria-label="Saved guided narration"><p>Saved {job.guided_tour.source === 'ai' ? 'AI-generated' : 'sample'} narration</p><p>{chapter.narration}</p>{job.tourAudio?.[chapter.id] && <audio key={chapter.id} controls preload="none" src={job.tourAudio[chapter.id]} />}</section>}<Suspense fallback={<p>Loading world viewer…</p>}><Viewer key={props.memory.id} {...props} world={job.world} enhancementResponse={job.enhancements || savedWorld.enhancements || null} savedAnchors={job.anchors || savedWorld.anchors || []} onSaveExperience={props.previewOnly ? undefined : save} /></Suspense></div>
}
