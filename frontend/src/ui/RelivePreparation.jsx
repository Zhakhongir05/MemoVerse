import { useEffect, useState } from 'react'
import { reliveState, validateReliveResult } from './reliveFlow'

// The server adapter owns World Labs generation and OpenAI/DeepSeek orchestration.
// No provider secrets or fabricated generated-world results belong in this UI.
export default function RelivePreparation({ memory, generateEnvironment, hasWorldViewer, onGenerated, onExplore, onBack, onEdit }) {
  const [state, setState] = useState(() => reliveState(memory, !!generateEnvironment, hasWorldViewer))
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const initial = reliveState(memory, !!generateEnvironment, hasWorldViewer)
    if (initial !== 'pending') { setState(initial); return }
    const controller = new AbortController()
    setState('pending'); setError('')
    async function prepare() {
      try {
        const result = await generateEnvironment({ memory, photos: memory.photos, story: memory.story, signal: controller.signal })
        if (controller.signal.aborted) return
        validateReliveResult(result)
        await onGenerated(result)
        if (!controller.signal.aborted) setState('ready')
      } catch (err) {
        if (!controller.signal.aborted) { setError(err.message || 'Your memory world could not be prepared.'); setState('error') }
      }
    }
    prepare()
    return () => controller.abort()
  }, [memory.id, generateEnvironment, hasWorldViewer, retry])

  const ready = state === 'ready' || state === 'fallback'
  return <section className="mj-preparation" aria-labelledby="mj-preparation-title" aria-busy={state === 'pending'}>
    <button className="mj-back" onClick={onBack}>← Back to memory</button><div className="mj-preparation-card mj-glass">
      <div className={`mj-relive-portal ${state === 'pending' ? 'mj-relive-pending' : ''}`} aria-hidden="true">✧</div>
      <p className="mj-eyebrow">{state === 'fallback' ? 'SYMBOLIC FALLBACK' : 'RELIVE MY MEMORY'}</p>
      <h1 id="mj-preparation-title">{ready ? <>How would you like to <em>return?</em></> : state === 'pending' ? <>Bringing your memory <em>to life…</em></> : <>Your memory is <em>waiting.</em></>}</h1>
      <div role="status"><p>{state === 'pending' ? 'Preparing your environment, memory stories, and guided journey.' : state === 'needs-photo' ? 'Add a photograph to create a world from this memory.' : state === 'unavailable' ? 'Realistic world generation is not connected yet. Your photographs and story are safely kept.' : state === 'error' ? 'We could not prepare your realistic world this time.' : state === 'fallback' ? 'You’re entering an artistic, symbolic scene. It is not a realistic reconstruction of your photograph.' : 'Your memory world is ready. Find your own way, or follow your story.'}</p></div>
      {error && <p className="mj-field-error" role="alert">{error}</p>}
      {ready ? <div className="mj-relive-choices"><button className="mj-primary" onClick={() => onExplore('free', state === 'fallback')}>Explore Freely ↗</button><button className="mj-secondary" onClick={() => onExplore('guided', state === 'fallback')}>Take a Guided Journey ✧</button></div> : <div className="mj-relive-choices">{state === 'needs-photo' && <button className="mj-primary" onClick={onEdit}>Add a photograph</button>}{state === 'error' && <button className="mj-primary" onClick={() => setRetry(value => value + 1)}>Retry generation</button>}{state !== 'pending' && <button className="mj-secondary" onClick={() => setState('fallback')}>Use symbolic fallback</button>}</div>}
    </div>
  </section>
}
