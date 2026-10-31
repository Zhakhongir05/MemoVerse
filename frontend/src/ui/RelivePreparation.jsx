import { useEffect, useRef, useState } from 'react'
import { preparePodcast } from '../integration/preparePodcast.js'
import { journalWorldRequest, waitForJournalWorld } from '../integration/journalWorldApi.js'

export default function RelivePreparation({ memory, hasWorldViewer, onGenerated, onExplore, onBack, onEdit, user, Photo, generationRequest }) {
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [starting, setStarting] = useState(false)
  // Remember which photograph built this world so furniture and reopening use the same source.
  const [photoIndex, setPhotoIndex] = useState(() => {
    const saved = memory.world?.photoIndex
    return Number.isInteger(saved) && saved >= 0 && saved < memory.photos.length ? saved : 0
  })
  const attempted=useRef(null)
  const entered=useRef(false)
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
      const next = await journalWorldRequest(memory.id, { method: 'POST', body: { photoIndex, approved: true } })
      void preparePodcast(memory.id).catch(() => { /* The player offers a read-only retry. World creation stays independent. */ })
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
      await onGenerated({ world: { ...job.world, source: 'worldlabs', memoryId: memory.id, photoIndex }, tour: job.guided_tour })
      void preparePodcast(memory.id).catch(() => {})
      onExplore(mode)
    } catch (error) { entered.current=false; setError(error.message || 'Could not open this saved world.') }
  }
  const completed = job?.status === 'succeeded'
  useEffect(() => {
    if (!completed || !hasWorldViewer || entered.current) return
    entered.current = true
    void enter('free').catch(() => { entered.current = false })
  }, [completed, hasWorldViewer])
  const pending = ['pending', 'submitting'].includes(job?.status)
  return <section className="mj-preparation" aria-busy={pending || starting}>
    <button className="mj-back" onClick={onBack}>← Back to memory</button>
    <div className="mj-preparation-card mj-glass"><p className="mj-eyebrow">YOUR SAVED MEMORY WORLD</p>
      <h1>{completed ? 'Enter Memory World' : pending ? 'Creating your memory world…' : 'Relive in 3D'}</h1>
      <p role="status">{completed ? 'Opening your world…' : pending ? 'Your world and personal podcast are being prepared. You can leave and return.' : job?.status === 'none' ? 'One photo. One world. Your own narrated memory.' : 'Opening your memory…'}</p>
      {error && <p role="alert">{error}</p>}
      {!memory.photos.length && <button onClick={onEdit}>Add a photograph</button>}
      {job?.status === 'none' && !!memory.photos.length && user && <>{memory.photos.length > 1 && <fieldset className="mj-source-photos"><legend>Source photograph</legend>{memory.photos.map((photo, index) => <label key={index}><input type="radio" name="generation-source" checked={photoIndex === index} onChange={() => setPhotoIndex(index)} disabled={starting} />{Photo && <Photo file={photo} alt={`Source photograph ${index + 1}`} />}</label>)}</fieldset>}<p>Uses 1 world allowance. Your photo and story also become an AI-narrated podcast.</p><button className="mj-primary" disabled={starting || !hasWorldViewer} onClick={start}>{starting ? 'Reserving your world…' : 'Create world + podcast'}</button></>}
      {['failed', 'expired', 'unknown'].includes(job?.status) && <p role="alert">This reservation needs billing/recovery review. Checking again does not start or charge another job.</p>}
      {error && <button className="mj-secondary" disabled={starting} onClick={() => { entered.current=false; setRefresh(n => n + 1) }}>Retry loading</button>}

    </div>
  </section>
}
