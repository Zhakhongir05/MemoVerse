import { useEffect, useState } from 'react'
import { getGenerationPlan, remainingCredits } from './generationCredits'
import { reliveState, validateReliveResult } from './reliveFlow'

// The server adapter owns World Labs generation and OpenAI/DeepSeek orchestration.
// No provider secrets or fabricated generated-world results belong in this UI.
export default function RelivePreparation({ memory, generateEnvironment, hasWorldViewer, onGenerated, onExplore, onBack, onEdit, user, Photo, onPlans }) {
  const [state, setState] = useState(() => reliveState(memory, !!generateEnvironment, hasWorldViewer))
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [photoIndex, setPhotoIndex] = useState(memory.photos.length === 1 ? 0 : null)
  const [confirmedPhoto, setConfirmedPhoto] = useState(memory.photos.length === 1)
  const [balance, setBalance] = useState(null)
  useEffect(() => {
    const initial = reliveState(memory, !!generateEnvironment, hasWorldViewer)
    if (initial !== 'pending') { setState(initial); return }
    if (!user) { setState('sign-in-required'); return }
    if (!confirmedPhoto) { setState('choose-photo'); return }
    const controller = new AbortController()
    setState('pending'); setError('')
    async function prepare() {
      try {
        const account = await getGenerationPlan(user)
        if (controller.signal.aborted) return
        setBalance(remainingCredits(account))
        if (remainingCredits(account) < 1) { setState('limit-reached'); return }
        const photo = memory.photos[photoIndex]
        const result = await generateEnvironment({ memory, photo, photos: [photo], story: memory.story, signal: controller.signal })
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
  }, [memory.id, generateEnvironment, hasWorldViewer, retry, confirmedPhoto])

  const ready = state === 'ready' || state === 'fallback'
  return <section className="mj-preparation" aria-labelledby="mj-preparation-title" aria-busy={state === 'pending'}>
    <button className="mj-back" onClick={onBack}>← Back to memory</button><div className="mj-preparation-card mj-glass">
      <div className={`mj-relive-portal ${state === 'pending' ? 'mj-relive-pending' : ''}`} aria-hidden="true">✧</div>
      <p className="mj-eyebrow">{state === 'fallback' ? 'SYMBOLIC FALLBACK' : 'RELIVE MY MEMORY'}</p>
      <h1 id="mj-preparation-title">{ready ? <>How would you like to <em>return?</em></> : state === 'pending' ? <>Bringing your memory <em>to life…</em></> : <>Your memory is <em>waiting.</em></>}</h1>
      <div role="status"><p>{state === 'pending' ? 'Preparing your environment, memory stories, and guided journey.' : state === 'needs-photo' ? 'Add a photograph to create a world from this memory.' : state === 'unavailable' ? 'Realistic world generation is not connected yet. Your photographs and story are safely kept.' : state === 'limit-reached' ? 'Your generations have been used. Add 15 more for ₩10,000.' : state === 'sign-in-required' ? 'Sign in with a verified Gmail account to generate a world.' : state === 'choose-photo' ? 'Choose one photograph for this generation. Your other journal photos will stay in your memory.' : state === 'error' ? 'We could not prepare your realistic world this time.' : state === 'fallback' ? 'You’re entering an artistic, symbolic scene. It is not a realistic reconstruction of your photograph.' : 'Your memory world is ready. Find your own way, or follow your story.'}</p></div>
      {balance !== null && <p className="mj-small">{balance} generations available · One image per generation</p>}
      {state === 'choose-photo' && <><fieldset className="mj-source-photos"><legend>Source photograph</legend>{memory.photos.map((photo, index) => <label key={index}><input type="radio" name="generation-source" checked={photoIndex === index} onChange={() => setPhotoIndex(index)} />{Photo && <Photo file={photo} alt={'Source photograph ' + (index + 1)} />}</label>)}</fieldset><button className="mj-primary" disabled={photoIndex === null} onClick={() => setConfirmedPhoto(true)}>Relive My Memory · 1 generation</button></>}
      {(state === 'limit-reached' || state === 'sign-in-required') && <button className="mj-primary" onClick={onPlans}>View plans</button>}
      {error && <p className="mj-field-error" role="alert">{error}</p>}
      {ready ? <div className="mj-relive-choices"><button className="mj-primary" onClick={() => onExplore('free', state === 'fallback')}>Explore Freely ↗</button><button className="mj-secondary" onClick={() => onExplore('guided', state === 'fallback')}>Take a Guided Journey ✧</button></div> : <div className="mj-relive-choices">{state === 'needs-photo' && <button className="mj-primary" onClick={onEdit}>Add a photograph</button>}{state === 'error' && <button className="mj-primary" onClick={() => setRetry(value => value + 1)}>Retry generation</button>}{state !== 'pending' && <button className="mj-secondary" onClick={() => setState('fallback')}>Use symbolic fallback</button>}</div>}
    </div>
  </section>
}
