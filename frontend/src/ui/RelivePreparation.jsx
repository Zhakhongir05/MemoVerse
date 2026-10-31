import { useEffect, useRef, useState } from 'react'
import { journalWorldRequest, waitForJournalWorld } from '../integration/journalWorldApi.js'

export default function RelivePreparation({ memory, hasWorldViewer, onGenerated, onExplore, onBack, onEdit, user, generationRequest }) {
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [starting, setStarting] = useState(false)
  const attempted=useRef(null)
  useEffect(() => {
    const controller = new AbortController()
    if (!user) return () => controller.abort()
    setError(''); setJob(null)
    waitForJournalWorld(memory.id, { signal: controller.signal, onStatus: setJob }).catch(error => {
      if (!controller.signal.aborted) setError(error.message)
    })
    return () => controller.abort()
  }, [memory.id, user?.id, refresh])
  async function start() {
    if (starting) return
    setStarting(true); setError('')
    try {
      const next = await journalWorldRequest(memory.id, { method: 'POST', body: { photoIndex: 0, approved: true } })
      setJob(next); setRefresh(n => n + 1)
    } catch (error) { setError(error.message) }
    finally { setStarting(false) }
  }
  useEffect(()=>{
    if(!generationRequest||attempted.current===generationRequest||job?.status!=='none'||!user)return
    attempted.current=generationRequest;void start()
  },[generationRequest,job?.status,user?.id])
  async function enter(mode) {
    try {
      await onGenerated({ world: { ...job.world, source: 'worldlabs', memoryId: memory.id }, tour: job.guided_tour })
      onExplore(mode)
    } catch (error) { setError(error.message || 'Could not open this saved world.') }
  }
  const completed = job?.status === 'succeeded'
  const pending = ['pending', 'submitting'].includes(job?.status)
  return <section className="mj-preparation" aria-busy={pending || starting}>
    <button className="mj-back" onClick={onBack}>← Back to memory</button>
    <div className="mj-preparation-card mj-glass"><p className="mj-eyebrow">YOUR SAVED MEMORY WORLD</p>
      <h1>{completed ? 'Enter Memory World' : pending ? 'Creating your memory world…' : 'Relive in 3D'}</h1>
      <p role="status">{job?.message || (completed ? 'Your saved world is ready. Reopening uses no generation allowance.' : job?.status === 'none' ? 'No world has been generated for this entry yet.' : !user ? 'Sign in with Google to use saved memory worlds.' : 'Checking for an existing world…')}</p>
      <p>Saving your journal is free. A new world uses one of three judging-period allowances. Returning to an existing world never generates another.</p>
      {error && <p role="alert">{error}</p>}
      {!memory.photos.length && <button onClick={onEdit}>Add a photograph</button>}
      {job?.status === 'none' && !!memory.photos.length && user && <><p>Generate from the first saved photograph and send it with your story to World Labs only when you choose below. Editing the journal later will not replace its world.</p><button className="mj-primary" disabled={starting || !hasWorldViewer} onClick={start}>{starting ? 'Reserving your world…' : 'Relive in 3D · Use 1 allowance'}</button></>}
      {completed && hasWorldViewer && <div className="mj-relive-choices"><button className="mj-primary" onClick={() => enter('free')}>Explore Freely ↗</button><button className="mj-secondary" onClick={() => enter('guided')}>Take a Guided Journey ✧</button></div>}
      {['failed', 'expired', 'unknown'].includes(job?.status) && <p role="alert">This reservation needs billing/recovery review. Checking again does not start or charge another job.</p>}
      <button className="mj-secondary" disabled={starting} onClick={() => setRefresh(n => n + 1)}>Check saved world again</button>
      <button className="mj-secondary" onClick={() => onExplore('free', true)}>Use explicitly labeled sample world</button>
    </div>
  </section>
}
