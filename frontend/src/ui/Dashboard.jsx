import { useEffect, useRef, useState } from 'react'
import './Dashboard.css'

const MOODS = ['Nostalgic', 'Joyful', 'Melancholic']
const MAX_IMAGE = 10 * 1024 * 1024

// Replace this adapter with the backend request. Reject on failure; honor signal.
// Object URLs are local previews only: upload the actual File in production.
export function generateMockMemory({ description, signal }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({
      version: 1, source: 'mock', title: 'A place you carry with you',
      description, environment: { lighting: 'golden-hour', mood: 'Nostalgic' },
      objects: [], narration: { text: description, audioUrl: null },
      ambient: { audioUrl: null },
    }), 2600)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Generation cancelled', 'AbortError'))
    }, { once: true })
  })
}

function Portal({ small = false }) {
  return <div className={`mv-portal ${small ? 'mv-portal-small' : ''}`} aria-hidden="true">
    <div className="mv-orbit" /><div className="mv-portal-door"><div className="mv-horizon" /><div className="mv-sun" /></div>
    <div className="mv-portal-floor" />
  </div>
}

/** SceneRenderer receives { scene, imageUrl, mood }. Mount the team's R3F Canvas here.
 * generateMemory receives { file, description, signal } and returns scene JSON.
 * Neither renderer nor audio is connected by default.
 */
export default function Dashboard({ SceneRenderer, generateMemory = generateMockMemory }) {
  const [screen, setScreen] = useState('landing')
  const [file, setFile] = useState(null)
  const [imageUrl, setImageUrl] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState({})
  const [scene, setScene] = useState(null)
  const [failure, setFailure] = useState('')
  const [mood, setMood] = useState('Nostalgic')
  const [dragging, setDragging] = useState(false)
  const controller = useRef(null)
  const fileInput = useRef(null)
  const heading = useRef(null)
  const isMock = generateMemory === generateMockMemory

  useEffect(() => {
    if (!file) { setImageUrl(''); return }
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { heading.current?.focus() }, [screen])

  function selectImage(next) {
    if (!next) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(next.type) || next.size > MAX_IMAGE) {
      setErrors(previous => ({ ...previous, image: 'Choose a JPG, PNG, or WebP image up to 10 MB.' }))
      return
    }
    setFile(next)
    setErrors(previous => ({ ...previous, image: '' }))
  }

  async function generate(event) {
    event?.preventDefault()
    const nextErrors = {}
    if (!file) nextErrors.image = 'Add a photograph to begin.'
    if (description.trim().length < 20) nextErrors.description = 'Tell us a little more—at least 20 characters.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => document.getElementById(!file ? 'mv-photo' : 'mv-description')?.focus())
      return
    }
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setFailure('')
    setScreen('generation')
    try {
      const result = await generateMemory({ file, description: description.trim(), signal: request.signal })
      if (request.signal.aborted) return
      if (!result || typeof result !== 'object') throw new Error('Invalid scene')
      setScene(result)
      setScreen('world')
    } catch (error) {
      if (request.signal.aborted) return
      setFailure(error.name === 'TypeError' ? 'We could not reach the generation service. Please try again.' : 'Your memory could not be generated. Your photograph and words are still here.')
    }
  }

  function backToUpload() {
    controller.current?.abort()
    setScreen('upload')
  }

  return <main className={`memoverse mv-screen-${screen} mv-mood-${mood.toLowerCase()}`}>
    <div className="mv-grain" aria-hidden="true" />
    <div className="mv-particles" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ '--x': `${(i * 47) % 100}%`, '--delay': `${i * -0.73}s`, '--duration': `${8 + i % 6}s` }} />)}</div>
    <header className="mv-header">
      <button className="mv-brand" onClick={() => { controller.current?.abort(); setScreen('landing') }} aria-label="MemoVerse home"><span className="mv-brand-mark">◈</span> MemoVerse<span className="mv-brand-dot">.</span></button>
      <span className="mv-header-note">A little closer to then</span>
      <span className="mv-edition">MEMORY EXPLORER <span>01</span></span>
    </header>

    {screen === 'landing' && <section className="mv-landing mv-enter">
      <div className="mv-landing-copy"><p className="mv-eyebrow"><span /> YOUR PAST, BEAUTIFULLY PRESENT</p>
        <h1 ref={heading} tabIndex={-1}>Don’t just remember it.<br /><em>Step inside it.</em></h1>
        <p className="mv-lede">Some moments never really leave us.<br />Turn a photograph into a world you can return to.</p>
        <button className="mv-primary" onClick={() => setScreen('upload')}>Enter Your Memories <span aria-hidden="true">↗</span></button>
        <p className="mv-fine">One photograph. A thousand feelings.</p>
      </div>
      <div className="mv-landing-art"><Portal /><span className="mv-art-caption">THE WAY BACK IS THROUGH</span></div>
      <footer className="mv-landing-footer"><span>IMAGINED WITH AI. <strong>FELT BY YOU.</strong></span><span>01 — THE BEGINNING</span></footer>
    </section>}

    {screen === 'upload' && <section className="mv-upload mv-enter">
      <button className="mv-back" onClick={() => setScreen('landing')}>← Back to the portal</button>
      <div className="mv-section-heading"><p className="mv-eyebrow">01 / A MOMENT TO RETURN TO</p><h1 ref={heading} tabIndex={-1}>Every world begins<br />with <em>a memory.</em></h1><p>A place. A person. The way the light felt that afternoon.</p></div>
      <form className="mv-upload-grid" onSubmit={generate} noValidate>
        <div className="mv-glass mv-photo-panel"><div className="mv-panel-label"><span>01</span><h2>Your photograph</h2></div>
          <input ref={fileInput} id="mv-photo" className="mv-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a memory photograph" aria-invalid={!!errors.image} aria-describedby="mv-photo-help mv-image-error" onChange={event => { selectImage(event.target.files?.[0]); event.target.value = '' }} />
          {imageUrl ? <div className="mv-image-preview"><img src={imageUrl} alt="Your selected memory" /><div className="mv-image-actions"><button type="button" onClick={() => fileInput.current?.click()}>Replace</button><button type="button" onClick={() => setFile(null)}>Remove</button></div></div> : <button type="button" className={`mv-dropzone ${dragging ? 'mv-dragging' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); selectImage(event.dataTransfer.files?.[0]) }}><span className="mv-upload-symbol" aria-hidden="true">＋</span><strong>Bring a moment into focus</strong><span>Drop your photograph here, or browse</span></button>}
          <p id="mv-photo-help" className="mv-fine">JPG, PNG or WebP · Up to 10 MB · Choose a photo you can use</p>
          <p id="mv-image-error" className="mv-error" role="alert">{errors.image}</p>
        </div>
        <div className="mv-glass mv-description-panel"><div className="mv-panel-label"><span>02</span><h2>The story behind it</h2></div><label htmlFor="mv-description">What do you remember?</label><textarea id="mv-description" value={description} maxLength={2000} onChange={event => setDescription(event.target.value)} aria-invalid={!!errors.description} aria-describedby="mv-description-help mv-description-error" placeholder="We were at my grandmother’s house. The windows were open, the room smelled of summer rain, and somewhere a radio was playing…" /><div className="mv-textarea-meta"><span id="mv-description-help">Start with the details you can still feel.</span><span>{description.length}/2000</span></div><p id="mv-description-error" className="mv-error" role="alert">{errors.description}</p><button className="mv-primary" type="submit">Generate My Memory <span aria-hidden="true">✧</span></button><p className="mv-fine">{isMock ? 'Preview mode · Mock scene generation. No upload to a server.' : 'Your photograph and story will be sent for generation.'}</p></div>
      </form>
    </section>}

    {screen === 'generation' && <section className="mv-generation mv-enter" aria-busy={!failure}>
      <Portal small /><p className="mv-eyebrow">{isMock ? 'MOCK GENERATION / EXPERIENCE PREVIEW' : 'CREATING YOUR MEMORY'}</p>
      <h1 ref={heading} tabIndex={-1}>{failure ? 'A moment to pause.' : 'Reconstructing your memory…'}</h1>
      <div role={failure ? 'alert' : 'status'}>{failure ? <p className="mv-generation-message">{failure}</p> : <p className="mv-generation-message">Gathering the light, the atmosphere, the little things.<br />{isMock ? 'Preparing a local sample scene. AI is not connected yet.' : 'Waiting for your scene to be ready.'}</p>}</div>
      {!failure && <div className="mv-loading-dots" aria-hidden="true"><i /><i /><i /></div>}
      {failure && <button className="mv-primary" onClick={() => generate()}>Try again <span aria-hidden="true">↻</span></button>}
      <button className="mv-back" onClick={backToUpload}>{failure ? '← Edit your memory' : 'Cancel and return'}</button>
    </section>}

    {screen === 'world' && <section className="mv-world mv-enter" aria-label="Memory world">
      <div className="mv-scene-slot">{SceneRenderer ? <SceneRenderer scene={scene} imageUrl={imageUrl} mood={mood} /> : <div className="mv-scene-placeholder"><div className="mv-world-haze" />{imageUrl && <img className="mv-world-photo" src={imageUrl} alt="Your memory photograph, displayed as a preview" />}<div className="mv-scene-notice"><span className="mv-eyebrow">YOUR WORLD, WAITING TO COME ALIVE</span><h1 ref={heading} tabIndex={-1}>Stay a little <em>longer.</em></h1><p>Photograph preview · 3D renderer not connected</p><p className="mv-fine">This space is reserved for the interactive memory world.</p></div></div>}</div>
      <div className="mv-world-top"><button className="mv-glass mv-back" onClick={backToUpload}>← Your memory</button><span className="mv-status">{scene?.source === 'mock' ? 'MOCK SCENE' : 'MEMORY WORLD'}</span></div>
      <aside className="mv-memory-info mv-glass"><p className="mv-eyebrow">A MOMENT, HELD IN LIGHT</p><h2>{scene?.title || 'Your memory'}</h2><p>{description}</p></aside>
      <div className="mv-world-controls mv-glass"><div className="mv-sound-controls"><div><span>Narration</span><button disabled aria-label="Narration unavailable">▷ <span>Not connected</span></button></div><div><span>Ambient sound</span><button disabled aria-label="Ambient sound unavailable">♫ <span>Not connected</span></button></div></div><fieldset className="mv-moods"><legend>SenseShift <span>Set the feeling</span></legend><div>{MOODS.map(value => <label key={value} className={mood === value ? 'mv-selected' : ''}><input type="radio" name="mv-mood" value={value} checked={mood === value} onChange={() => setMood(value)} /><span>{value}</span></label>)}</div></fieldset><p className="mv-fine mv-controls-note">{SceneRenderer ? 'Mood selection is passed to the scene renderer.' : 'Mood changes the preview lighting. Interactive 3D and audio await integration.'}</p></div>
    </section>}
  </main>
}
