import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { advanceMemorycast, audioLinkExpired, memorycastClient, playableChapters } from '../integration/memorycastClient.js'
import './MemoryCast.css'

export default function MemoryCast(props) {
  const { user, memory } = props
  if (!user || memory.owner !== user.id || memory.syncState !== 'synced') return <section className="mc-panel" aria-label="MemoryCast"><h3>MemoryCast</h3><p>Sign in and save this memory to your account before generating narration.</p></section>
  return <OwnedMemoryCast key={`${user.id}:${memory.id}:${memory.updatedAt}`} {...props} />
}

function OwnedMemoryCast({ user, memory, client = supabase, onCameraCue, wait }) {
  const api = useMemo(() => memorycastClient(user.id, client), [user.id, client])
  const [snapshot, setSnapshot] = useState(null)
  const [language, setLanguage] = useState('en')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isolated, setIsolated] = useState(false)
  const controller = useRef(null)
  const locked = useRef(false)
  const latest = useRef(null)
  useEffect(() => { latest.current = { snapshot, language } }, [snapshot, language])

  useEffect(() => {
    const abort = new AbortController()
    controller.current = abort
    let timer
    const update = value => { if (!abort.signal.aborted) setSnapshot({ ...value, fetchedAt: Date.now() }) }
    async function load() {
      try {
        const value = await api.load(memory.id, { signal: abort.signal })
        update(value); if (value.tour?.language) setLanguage(value.tour.language)
      } catch (err) { if (!abort.signal.aborted) setError(err.message) }
      finally { if (!abort.signal.aborted) setLoading(false) }
    }
    load()
    // Status-only polling is safe on reopening. Advancing requires a click.
    timer = setInterval(async () => {
      if (locked.current || abort.signal.aborted || latest.current?.snapshot?.tour?.status !== 'pending') return
      locked.current = true
      try { update(await api.load(memory.id, { language: latest.current.language, signal: abort.signal })) }
      catch (err) { if (!abort.signal.aborted) setError(err.message) }
      finally { locked.current = false }
    }, 5000)
    const subscription = client.auth.onAuthStateChange?.((_event, session) => {
      if (session?.user?.id !== user.id) { abort.abort(); setSnapshot(null); setIsolated(true); onCameraCue?.(null) }
    })
    return () => { abort.abort(); clearInterval(timer); subscription?.data?.subscription?.unsubscribe(); onCameraCue?.(null) }
  }, [api, memory.id, client, user.id, onCameraCue])

  async function read({ tourId, selectedLanguage } = {}) {
    const value = await api.load(memory.id, { tourId, language: selectedLanguage, signal: controller.current.signal })
    setSnapshot({ ...value, fetchedAt: Date.now() }); setError('')
    return value
  }
  async function run(action) {
    if (locked.current || isolated) return
    locked.current = true; setBusy(true); setError('')
    try {
      let value = snapshot
      if (action === 'generate') {
        const result = await api.generate(memory.id, { approved: true, regenerate: !!snapshot?.stale, language, signal: controller.current.signal })
        value = result.tour.status === 'ready' ? await api.load(memory.id, { signal: controller.current.signal }) : { ...snapshot, tour: result.tour }
        setSnapshot(value)
      }
      await advanceMemorycast(api, memory.id, value, {
        signal: controller.current.signal, wait,
        onUpdate: update => { if (!controller.current.signal.aborted) setSnapshot({ ...update, fetchedAt: Date.now() }) },
      })
    } catch (err) {
      if (!controller.current.signal.aborted) setError(`${err.message} No automatic paid retry will be made. Use Check status before continuing.`)
    } finally { locked.current = false; if (!controller.current.signal.aborted) setBusy(false) }
  }
  if (isolated) return <section className="mc-panel" aria-label="MemoryCast"><h3>MemoryCast</h3><p>Account changed. Reopen your own saved memory.</p></section>
  const tour = snapshot?.tour
  const terminalFailure = ['failed', 'uncertain'].includes(tour?.status)
  const pending = tour?.status === 'pending'
  return <section className="mc-panel" aria-label="MemoryCast">
    <header><div><p className="mj-eyebrow">A VOICE FOR THE MOMENT</p><h3>MemoryCast</h3></div><span>AI-generated voice</span></header>
    <p>Return through Arrival, Rediscovery, and Reflection.</p>
    {loading && <p role="status">Checking saved narration…</p>}
    {error && <p role="alert">{error}</p>}
    {snapshot?.stale && <p role="status">This memory or language has changed. You can replay the saved version, or explicitly generate a new one.</p>}
    {!snapshot?.generation_enabled && !loading && <p>New AI narration is currently disabled. Existing saved tours can still be replayed.</p>}
    {pending && <div role="status"><p>{tour.message || 'Preparing your narration.'} · Step {tour.next_step} of {tour.total_steps}</p><progress aria-label="Narration generation progress" value={tour.next_step} max={tour.total_steps} /></div>}
    {terminalFailure && <p role="alert">{tour.message || 'This narration needs owner review.'} Job {tour.id}. {tour.status === 'uncertain' ? 'The provider outcome is uncertain.' : 'Generation failed.'} No automatic replacement will be generated.</p>}
    <div className="mc-actions">
      <label>Narration language<select value={language} disabled={busy || loading || pending} onChange={async event => {
        const next = event.target.value; setLanguage(next)
        try { await read({ selectedLanguage: next }) } catch (err) { setError(err.message) }
      }}><option value="en">English</option><option value="ko">한국어</option></select></label>
      {(!tour || snapshot?.stale) && !pending && !terminalFailure && <button type="button" className="mj-primary" disabled={busy || loading || !snapshot?.generation_enabled || !!error} onClick={() => run('generate')}>{snapshot?.stale ? 'Regenerate AI narration' : 'Generate AI narration'}</button>}
      {pending && <button type="button" className="mj-primary" disabled={busy || !snapshot?.generation_enabled || !!error} onClick={() => run('continue')}>{busy ? 'Generating narration…' : 'Continue narration generation'}</button>}
      <button type="button" className="mj-secondary" disabled={busy || loading} onClick={async () => { try { await read({ selectedLanguage: language }) } catch (err) { setError(err.message) } }}>Check status</button>
    </div>
    {(!tour || snapshot?.stale) && !pending && <p className="mc-note">Generating uses paid AI services. Only select Generate or Regenerate if you approve this request. Replaying a saved tour does not generate again.</p>}
    {snapshot?.previous_ready_tour_id && tour?.status !== 'ready' && <button type="button" className="mj-secondary" disabled={busy} onClick={async () => { try { await read({ tourId: snapshot.previous_ready_tour_id }) } catch (err) { setError(err.message) } }}>Listen to previous saved tour</button>}
    {tour?.status === 'ready' && <MemoryCastPlayer key={tour.id} tour={tour} fetchedAt={snapshot.fetchedAt} refresh={() => read({ tourId: tour.id })} onCameraCue={onCameraCue} />}
  </section>
}

function MemoryCastPlayer({ tour, fetchedAt, refresh, onCameraCue }) {
  const audio = useRef(null)
  const operation = useRef({ epoch: 0 })
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(null)
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)
  let chapters = [], invalid = ''
  try { chapters = playableChapters(tour) } catch (err) { invalid = err.message }
  const chapter = chapters[index]
  function pause() { operation.current.epoch++; audio.current?.pause(); setPlaying(false); setWaiting(false); onCameraCue?.(null) }
  useEffect(() => {
    const element = audio.current
    const cancellation = operation.current
    return () => { cancellation.epoch++; element?.pause(); onCameraCue?.(null) }
  }, [onCameraCue])
  useEffect(() => {
    const stop = () => { if (document.hidden) pause() }
    document.addEventListener('visibilitychange', stop)
    return () => document.removeEventListener('visibilitychange', stop)
  })
  async function play(next = index) {
    pause(); setIndex(next); setError(''); setWaiting(true)
    const id = operation.current.epoch
    try {
      let selected = chapters[next]
      if (expired || audioLinkExpired(fetchedAt, selected.audio.expires_in)) {
        const value = await refresh(); selected = playableChapters(value.tour)[next]; setExpired(false)
      }
      if (id !== operation.current.epoch) return
      if (onCameraCue && await onCameraCue({ ...selected, onInterrupt: pause }) === false) return
      if (id !== operation.current.epoch) return
      const element = audio.current
      if (element.getAttribute('src') !== selected.audio.url || element.error) { element.src = selected.audio.url; element.load(); setTime(0); setDuration(null) }
      await element.play()
      if (id !== operation.current.epoch) { element.pause(); return }
      setPlaying(true)
    } catch { if (id === operation.current.epoch) setError('Playback could not start. Refresh audio links if needed, then press Play. Browser playback permission may also be required.') }
    finally { if (id === operation.current.epoch) setWaiting(false) }
  }
  if (invalid) return <p role="alert">{invalid}</p>
  return <div className="mc-player" aria-label="MemoryCast narration player">
    {error && <p role="alert">{error}</p>}
    <nav aria-label="Narration chapters">{chapters.map((item, at) => <button type="button" key={item.order} aria-pressed={at === index} onClick={() => { pause(); setIndex(at); setTime(0); setDuration(null); audio.current?.removeAttribute('src'); setError('') }}>{['Arrival', 'Rediscovery', 'Reflection'][at]}</button>)}</nav>
    <h4>{chapter.title}</h4><p className="mc-subtitles" aria-label="Narration subtitles">{chapter.subtitles || chapter.narration}</p>
    <audio ref={audio} preload="none" onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onLoadedMetadata={event => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration) }} onPause={() => setPlaying(false)} onEnded={() => { pause(); if (index < 2) play(index + 1) }} onError={() => { pause(); setExpired(true); setError('The audio could not load. Its private link may have expired. Refresh the audio links, then press Play.') }} />
    <progress aria-label="Chapter playback progress" value={time} max={duration || chapter.audio.duration_seconds} /><p>{Math.floor(time)} / {Math.ceil(duration || chapter.audio.duration_seconds)} seconds</p>
    <div className="mc-actions"><button type="button" className="mj-primary" onClick={() => playing || waiting ? pause() : play()}>{waiting ? 'Cancel chapter transition' : playing ? 'Pause narration' : 'Play narration'}</button><button type="button" className="mj-secondary" onClick={async () => { pause(); try { await refresh(); setExpired(false); setError('') } catch { setError('Audio links could not be refreshed. Check your connection and account, then try again.') } }}>Refresh audio links</button></div>
  </div>
}
