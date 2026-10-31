import { useEffect, useRef, useState } from 'react'
import { memorycastRequest } from '../integration/memorycastApi.js'

// Listening is strictly read-only: it never reserves or advances an AI job.
export default function MemoryPodcast({ memory, user, onPlaybackChange, autoPlay = false, compact = false }) {
  const [result, setResult] = useState(null), [error, setError] = useState(''), [chapter, setChapter] = useState(0), [reload, setReload] = useState(0)
  const [needsPlay, setNeedsPlay] = useState(false)
  const audio = useRef(null)
  const wantsPlayback = useRef(autoPlay)
  useEffect(() => {
    const controller = new AbortController()
    let timer
    setResult(null); setError(''); setChapter(0); wantsPlayback.current = autoPlay
    async function read() {
      try {
        const next = await memorycastRequest('/memories/' + memory.id, { signal: controller.signal })
        if (controller.signal.aborted) return
        setResult(next)
        if ((!next.tour && next.generation_enabled) || next.tour?.status === 'pending') timer = setTimeout(read, 3000)
      } catch (error) { if (!controller.signal.aborted) setError(error.message) }
    }
    if (user?.id) void read()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [memory.id, user?.id, reload, autoPlay])
  useEffect(() => () => onPlaybackChange?.(null), [onPlaybackChange])
  const tour = result?.tour
  const ready = tour?.status === 'ready' && tour.audio?.length === 3
  const part = tour?.script?.chapters?.[chapter]
  const source = tour?.audio?.[chapter]?.url
  useEffect(() => {
    if (ready && wantsPlayback.current && audio.current) audio.current.play().catch(() => setNeedsPlay(true))
  }, [ready, chapter, source])
  return <section className={`mj-podcast ${compact ? 'mj-podcast-compact' : 'mj-glass'}`} aria-label="Saved memory podcast">
    {!compact && <h2>Listen</h2>}
    {error ? <><p role="alert">{error}</p><button type="button" onClick={() => setReload(n => n + 1)}>Reload recording</button></> : ready && part ? <>
      <p className="mj-podcast-chapter">{part.title} · {chapter + 1}/3</p>
      <audio ref={audio} controls preload="metadata" src={source}
        onPlay={() => { wantsPlayback.current = true; setNeedsPlay(false); onPlaybackChange?.(part) }}
        onPause={() => onPlaybackChange?.(null)}
        onEnded={() => { onPlaybackChange?.(null); if (chapter < 2) { wantsPlayback.current = true; setChapter(n => n + 1) } else wantsPlayback.current = false }}
        onError={() => setError('Recording unavailable. Reload to refresh access.')} />
      {needsPlay && <button type="button" onClick={() => audio.current?.play().catch(() => setError('Audio could not start. Try reloading.'))}>Play recording</button>}
      {!compact && <div className="mj-podcast-skip"><button type="button" disabled={chapter === 0} onClick={() => setChapter(n => n - 1)}>Previous</button><button type="button" disabled={chapter === 2} onClick={() => setChapter(n => n + 1)}>Next</button></div>}
    </> : <p role="status">{!user ? 'Sign in to listen.' : !result || tour?.status === 'pending' ? 'Preparing your recording…' : ['failed', 'uncertain'].includes(tour?.status) ? 'Recording needs recovery. Your memory is safe.' : !result.generation_enabled ? 'Recording is unavailable right now.' : 'Your recording will be prepared with your 3D memory.'}</p>}
  </section>
}
