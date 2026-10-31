import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import './Dashboard.css'
import MemoryLibrary from './MemoryLibrary'
import useMemorySave from './useMemorySave'

const MOODS = ['Nostalgic', 'Joyful', 'Melancholic']
const MAX_IMAGE = 10 * 1024 * 1024
const MAX_AUDIO = 25 * 1024 * 1024
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Fallback mock generator with real 3D room objects if backend is offline
// At the top of frontend/src/ui/Dashboard.jsx
export function generateMockMemory({ description, signal }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({
      version: 1,
      source: 'mock',
      title: 'A place you carry with you',
      description,
      environment: 'photo-world',
      mood: 'nostalgic',
      objects: [], // Empty so Scene.jsx builds hotspots from your photo + written story!
      narration: { text: description, audioUrl: null },
      ambient: { audioUrl: null },
    }), 1200)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Generation cancelled', 'AbortError'))
    }, { once: true })
  })
}

// Live backend adapter calling FastAPI backend/main.py -> agent.py
export async function generateBackendMemory({ file, description, signal }) {
  const formData = new FormData()
  formData.append('photo', file)
  formData.append('story', description)

  try {
    const response = await fetch(`${API_BASE}/api/generate`, {
      method: 'POST',
      body: formData,
      signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    // Normalize GenerateResponse { scene: {...}, source, fallback } from agent.py
    const rawScene = data.scene || data
    return {
      ...rawScene,
      source: data.source || 'ai',
      fallback: data.fallback ?? false,
      description,
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err
    // Fallback to mock scene with 3D objects if backend server isn't running locally
    return generateMockMemory({ description, signal })
  }
}

function Portal({ small = false }) {
  return <div className={`mv-portal ${small ? 'mv-portal-small' : ''}`} aria-hidden="true">
    <div className="mv-orbit" /><div className="mv-portal-door"><div className="mv-horizon" /><div className="mv-sun" /></div>
    <div className="mv-portal-floor" />
  </div>
}

export default function Dashboard({ SceneRenderer, generateMemory = generateBackendMemory, user, onSignOut }) {
  const [screen, setScreen] = useState('landing')
  const [sceneExpanded, setSceneExpanded] = useState(false)
  const [inputsOpen, setInputsOpen] = useState(false)
  const studioScreen = useRef('upload')
  const [file, setFile] = useState(null)
  const [imageUrl, setImageUrl] = useState('')
  const [audioFile, setAudioFile] = useState(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [audioPlaybackError, setAudioPlaybackError] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState({})
  const [scene, setScene] = useState(null)
  const [failure, setFailure] = useState('')
  const [mood, setMood] = useState('Nostalgic')
  const [dragging, setDragging] = useState(false)
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountError, setAccountError] = useState('')

  // Guided Audio Tour & Ambient Sound state
  const [tourPlaying, setTourPlaying] = useState(false)
  const [activeStopTitle, setActiveStopTitle] = useState('')
  const [ambientPlaying, setAmbientPlaying] = useState(false)
  const ambientAudioRef = useRef(null)
  const synthCtxRef = useRef(null)

  const controller = useRef(null)
  const fileInput = useRef(null)
  const audioInput = useRef(null)
  const heading = useRef(null)
  const isMock = scene?.source === 'mock'
  const pending = screen === 'generation' && !failure
  const draft = useMemo(() => ({ file, audioFile, description, mood, scene }), [file, audioFile, description, mood, scene])
  const memorySave = useMemorySave(user, draft)
  const saving = memorySave.status === 'saving'

  useEffect(() => {
    if (!file) { setImageUrl(''); return }
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!audioFile) { setAudioUrl(''); return }
    const url = URL.createObjectURL(audioFile)
    setAudioUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [audioFile])

  useEffect(() => () => {
    controller.current?.abort()
    window.speechSynthesis?.cancel()
    synthCtxRef.current?.close()
  }, [])

  useEffect(() => { heading.current?.focus() }, [screen])
  useEffect(() => {
    if (['upload', 'generation', 'world'].includes(screen)) studioScreen.current = screen
    if (screen !== 'world') {
      setTourPlaying(false)
      window.speechSynthesis?.cancel()
    }
  }, [screen])

  // Procedural Web Audio room ambience (or user's uploaded audioFile if present)
  useEffect(() => {
    if (!ambientPlaying || screen !== 'world') {
      ambientAudioRef.current?.pause()
      if (synthCtxRef.current) {
        synthCtxRef.current.close()
        synthCtxRef.current = null
      }
      return
    }

    if (audioUrl) {
      const audio = new Audio(audioUrl)
      audio.loop = true
      audio.volume = 0.35
      ambientAudioRef.current = audio
      audio.play().catch(() => setAmbientPlaying(false))
      return () => audio.pause()
    }

    // Synthesize warm mood-reactive room drone if no audio file was uploaded
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    synthCtxRef.current = ctx

    const freqs = mood === 'Joyful' ? [261.6, 329.6, 392.0] : mood === 'Melancholic' ? [220.0, 261.6, 329.6] : [196.0, 246.9, 293.7]
    const master = ctx.createGain()
    master.gain.value = 0.04
    master.connect(ctx.destination)

    freqs.forEach((f) => {
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = f
      osc.connect(master)
      osc.start()
    })

    return () => {
      ctx.close()
      synthCtxRef.current = null
    }
  }, [ambientPlaying, screen, audioUrl, mood])

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

  function selectAudio(next) {
    if (!next) return
    const allowed = /\.(mp3|wav|m4a|ogg|webm)$/i
    if (!allowed.test(next.name) || (next.type && !next.type.startsWith('audio/') && next.type !== 'video/webm' && next.type !== 'video/mp4') || !next.size || next.size > MAX_AUDIO) {
      setErrors(previous => ({ ...previous, audio: 'Choose a non-empty MP3, WAV, M4A, OGG, or WebM audio file up to 25 MB.' }))
      return
    }
    setAudioFile(next)
    setAudioPlaybackError('')
    setErrors(previous => ({ ...previous, audio: '' }))
  }

  async function generate(event) {
    event?.preventDefault()
    if (libraryBusy) return
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
      const result = await generateMemory({ file, audioFile, description: description.trim(), signal: request.signal })
      if (request.signal.aborted) return
      if (!result || typeof result !== 'object') throw new Error('Invalid scene')
      setScene(result.scene ? { ...result.scene, source: result.source, description: description.trim() } : result)
      setScreen('world')
    } catch (error) {
      if (request.signal.aborted) return
      setFailure(error.name === 'TypeError' ? 'We could not reach the generation service. Please try again.' : 'Your memory could not be generated. Your photograph and words are still here.')
    }
  }

  function backToUpload() {
    controller.current?.abort()
    setTourPlaying(false)
    window.speechSynthesis?.cancel()
    setScreen('upload')
  }

  function restoreMemory(memory) {
    if (saving || (memorySave.dirty && !window.confirm('Discard unsaved changes and open this memory?'))) return
    memorySave.openDraft(memory)
    controller.current?.abort()
    setFile(memory.file)
    setAudioFile(memory.audioFile)
    setDescription(memory.description)
    setMood(MOODS.includes(memory.mood) ? memory.mood : 'Nostalgic')
    setScene(memory.scene)
    setErrors({}); setAudioPlaybackError(''); setFailure('')
    setInputsOpen(false)
    setScreen(memory.scene ? 'world' : 'upload')
  }

  function newMemory() {
    if (saving || (memorySave.dirty && !window.confirm('Discard unsaved changes and start a new memory?'))) return
    controller.current?.abort()
    memorySave.newDraft()
    setFile(null); setAudioFile(null); setDescription(''); setMood('Nostalgic'); setScene(null)
    setErrors({}); setAudioPlaybackError(''); setFailure(''); setScreen('upload')
  }

  const handleTourChange = useCallback(({ isPlaying, activeStop }) => {
    setTourPlaying(isPlaying)
    setActiveStopTitle(activeStop ? `${activeStop.title}: ${activeStop.narration}` : '')
  }, [])

  return <main className={`memoverse mv-screen-${screen} mv-mood-${mood.toLowerCase()} ${sceneExpanded ? 'mv-scene-expanded' : ''} ${inputsOpen ? 'mv-inputs-open' : ''}`}>
    <div className="mv-grain" aria-hidden="true" />
    <div className="mv-particles" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ '--x': `${(i * 47) % 100}%`, '--delay': `${i * 0.73}s`, '--duration': `${8 + i % 6}s` }} />)}</div>
    <header className="mv-header">
      <button className="mv-brand" onClick={() => { controller.current?.abort(); setScreen('landing') }} aria-label="MemoVerse home"><span className="mv-brand-mark">◈</span> MemoVerse<span className="mv-brand-dot">.</span></button>
      <nav className="mv-view-nav" aria-label="Memory navigation">
        <button aria-current={['upload', 'generation', 'world'].includes(screen) ? 'page' : undefined} disabled={libraryBusy || pending} onClick={() => setScreen(studioScreen.current)}>Studio</button>
        {user && <button aria-current={screen === 'library' ? 'page' : undefined} disabled={pending || libraryBusy} onClick={() => { if (screen !== 'landing' && screen !== 'library') studioScreen.current = screen; setScreen('library') }}>Saved memories</button>}
      </nav>
      {user ? <div className="mv-account"><span title={user.email}>{user.email}</span><button disabled={accountBusy || libraryBusy || saving} onClick={async () => {
        if (memorySave.dirty && !window.confirm('You have unsaved changes. Sign out and discard them?')) return
        setAccountBusy(true); setAccountError('')
        try { await onSignOut() }
        catch { setAccountError('Sign out failed. Please try again.'); setAccountBusy(false) }
      }}>{accountBusy ? 'Signing out…' : 'Sign out'}</button></div> : <span className="mv-edition">LOCAL DEMO <span>01</span></span>}
    </header>
    {accountError && <p className="mv-account-error" role="alert">{accountError}</p>}

    {screen === 'library' && user && <section className="mv-library-page mv-enter" aria-labelledby="mv-library-page-title">
      <div className="mv-library-page-heading"><p className="mv-eyebrow">YOUR PRIVATE COLLECTION</p><h1 id="mv-library-page-title" ref={heading} tabIndex={-1}>Moments to <em>return to.</em></h1><p>Open a memory to continue in the studio.</p></div>
      <button className="mv-back" onClick={() => setScreen(studioScreen.current)}>← Back to studio</button>
      <MemoryLibrary user={user} saved={memorySave.saved} saving={saving} onOpen={restoreMemory} onNew={newMemory} onBusyChange={setLibraryBusy} />
    </section>}

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

    {['upload', 'generation', 'world'].includes(screen) && <section className="mv-upload mv-workspace mv-enter">
      <div className="mv-studio-toolbar">
        <div className="mv-section-heading"><p className="mv-eyebrow">YOUR MEMORY STUDIO</p><h1 ref={screen === 'upload' ? heading : undefined} tabIndex={-1}>A moment. <em>A world.</em></h1></div>
        <div className="mv-studio-actions"><button className="mv-mobile-input-toggle" aria-expanded={inputsOpen} aria-controls="mv-studio-inputs" onClick={() => setInputsOpen(value => !value)}>{inputsOpen ? 'Close inputs' : 'Edit inputs'}</button><button className="mv-expand-scene" aria-pressed={sceneExpanded} onClick={() => { setSceneExpanded(value => !value); setInputsOpen(false) }}>{sceneExpanded ? 'Show inputs ↙' : 'Expand scene ↗'}</button></div>
      </div>
      <div className="mv-workspace-grid"><div id="mv-studio-inputs" className="mv-input-column" role="region" aria-label="Memory inputs" tabIndex={0}><form className="mv-upload-grid" onSubmit={generate} noValidate><fieldset className="mv-input-fields" disabled={pending || libraryBusy || accountBusy}><legend className="mv-sr-only">Photograph, audio, and memory description</legend>
        <div className="mv-glass mv-photo-panel"><div className="mv-panel-label"><span>01</span><h2>Your photograph</h2></div>
          <input ref={fileInput} id="mv-photo" className="mv-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a memory photograph" aria-invalid={!!errors.image} aria-describedby="mv-photo-help mv-image-error" onChange={event => { selectImage(event.target.files?.[0]); event.target.value = '' }} />
          {imageUrl ? <div className="mv-image-preview"><img src={imageUrl} alt="Your selected memory" /><div className="mv-image-actions"><button type="button" onClick={() => fileInput.current?.click()}>Replace</button><button type="button" onClick={() => setFile(null)}>Remove</button></div></div> : <button type="button" className={`mv-dropzone ${dragging ? 'mv-dragging' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); selectImage(event.dataTransfer.files?.[0]) }}><span className="mv-upload-symbol" aria-hidden="true">＋</span><strong>Bring a moment into focus</strong><span>Drop your photograph here, or browse</span></button>}
          <p id="mv-photo-help" className="mv-fine">JPG, PNG or WebP · Up to 10 MB · Choose a photo you can use</p>
          <p id="mv-image-error" className="mv-error" role="alert">{errors.image}</p>
        </div>
        <div className="mv-glass mv-description-panel"><div className="mv-panel-label"><span>02</span><h2>The story behind it</h2></div><label htmlFor="mv-description">What do you remember?</label><textarea id="mv-description" value={description} maxLength={2000} onChange={event => setDescription(event.target.value)} aria-invalid={!!errors.description} aria-describedby="mv-description-help mv-description-error" placeholder="We were at my grandmother’s house. The windows were open, the room smelled of summer rain, and somewhere a radio was playing…" /><div className="mv-textarea-meta"><span id="mv-description-help">Start with the details you can still feel.</span><span>{description.length}/2000</span></div><p id="mv-description-error" className="mv-error" role="alert">{errors.description}</p></div>
        <div className="mv-glass mv-audio-panel">
          <div className="mv-panel-label"><span>03</span><h2>Audio <span className="mv-optional">Optional</span></h2></div>
          <label htmlFor="mv-audio">Memory audio <span className="mv-fine">(optional)</span></label>
          <input ref={audioInput} id="mv-audio" className="mv-audio-input" type="file" accept=".mp3,.wav,.m4a,.ogg,.webm,audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/webm" aria-invalid={!!errors.audio} aria-describedby="mv-audio-help mv-audio-error" onChange={event => { selectAudio(event.target.files?.[0]); event.target.value = '' }} />
          <p id="mv-audio-help" className="mv-fine">Add a voice note or ambient sound from your memory. MP3, WAV, M4A, OGG or WebM · Up to 25 MB.</p>
          {audioFile && <div className="mv-audio-preview">
            <p className="mv-audio-filename">{audioFile.name}</p>
            {audioUrl && <audio key={audioUrl} src={audioUrl} controls preload="metadata" aria-label="Preview your memory audio" onError={() => setAudioPlaybackError('This browser could not play the file. Try an MP3 or WAV recording.')} />}
            <div className="mv-audio-actions"><button type="button" onClick={() => audioInput.current?.click()}>Replace audio</button><button type="button" onClick={() => { setAudioFile(null); setAudioPlaybackError(''); setErrors(previous => ({ ...previous, audio: '' })) }}>Remove audio</button></div>
          </div>}
          <p id="mv-audio-error" className="mv-error" role="alert">{errors.audio || audioPlaybackError}</p>
        </div>
        <div className="mv-submit-panel"><div className="mv-submit-actions">{user && <button type="button" className="mv-save-button" disabled={saving || libraryBusy || accountBusy || !memorySave.dirty} onClick={memorySave.save}>{saving ? 'Saving…' : memorySave.dirty ? 'Save changes' : memorySave.saved ? 'Saved ✓' : 'Save changes'}</button>}<button className="mv-primary" type="submit">{pending ? 'Generating…' : scene ? 'Regenerate My Memory' : 'Generate My Memory'} <span aria-hidden="true">✧</span></button></div><p className="mv-fine">{user ? 'Use Save changes to store your inputs privately.' : 'Your photograph and story will build your 3D guided room.'}</p></div>
      </fieldset></form>
      {user && <div className="mv-autosave mv-glass">
        <p role="status">{memorySave.status === 'saving' ? 'Saving to your account…' : memorySave.status === 'saved' ? '✓ All changes saved privately' : memorySave.status === 'error' ? 'Changes have not been saved.' : memorySave.dirty ? 'Unsaved changes · Select Save changes.' : 'Select Save changes when your memory is ready.'}</p>
        {memorySave.status === 'error' && <><p role="alert" className="mv-error">{memorySave.error}</p><button type="button" onClick={memorySave.save}>Retry saving</button></>}
        <p className="mv-fine">Photo and audio upload to private storage. Your story, mood, and scene data save to your database.</p>
      </div>}
      </div>
      <div className="mv-preview-panel mv-glass" aria-label="Memory world preview">
        <div className="mv-preview-header"><div><p className="mv-eyebrow">A SPACE TO STEP INTO</p><h2>Your memory world</h2></div><span className="mv-status">{pending ? 'PREPARING' : scene?.source === 'ai' ? 'AI SCENE READY' : scene ? 'SCENE READY' : SceneRenderer ? 'INTERACTIVE 3D ROOM' : 'AWAITING YOUR MEMORY'}</span></div>
        {screen === 'upload' && (SceneRenderer ? <div className="mv-studio-demo"><div className="mv-demo-canvas" role="region" aria-label="Interactive 3D room"><SceneRenderer scene={scene} imageUrl={imageUrl} mood={mood} description={description} tourPlaying={tourPlaying} onTourStateChange={handleTourChange} /></div><div className="mv-demo-caption"><h2>A room to return to.</h2><p>Click any object in the 3D room to hear its guided memory, or generate your custom room.</p></div></div> : <div className="mv-preview-empty"><Portal small /><h2>{scene ? 'Your next chapter starts here.' : 'Your world begins with a memory.'}</h2><p>Add a photograph and describe the moment on the left.</p></div>)}

    {screen === 'generation' && <section className="mv-generation mv-enter" aria-busy={!failure}>
      <Portal small /><p className="mv-eyebrow">{isMock ? 'MOCK GENERATION / EXPERIENCE PREVIEW' : 'CREATING YOUR MEMORY'}</p>
      <h1 ref={heading} tabIndex={-1}>{failure ? 'A moment to pause.' : 'Reconstructing your memory…'}</h1>
      <div role={failure ? 'alert' : 'status'}>{failure ? <p className="mv-generation-message">{failure}</p> : <p className="mv-generation-message">Gathering the light, the atmosphere, the little things.<br />Mapping your story into a guided 3D space.</p>}</div>
      {!failure && <div className="mv-loading-dots" aria-hidden="true"><i /><i /><i /></div>}
      {failure && <button className="mv-primary" onClick={() => generate()}>Try again <span aria-hidden="true">↻</span></button>}
      <button className="mv-back" onClick={backToUpload}>{failure ? '← Edit your memory' : 'Cancel and return'}</button>
    </section>}

    {screen === 'world' && <section className="mv-world mv-enter" aria-label="Memory world">
      <div className="mv-scene-slot">{SceneRenderer ? <SceneRenderer scene={scene} imageUrl={imageUrl} mood={mood} description={description} tourPlaying={tourPlaying} onTourStateChange={handleTourChange} /> : <div className="mv-scene-placeholder"><div className="mv-world-haze" />{imageUrl && <img className="mv-world-photo" src={imageUrl} alt="Your memory photograph, displayed as a preview" />}<div className="mv-scene-notice"><span className="mv-eyebrow">YOUR WORLD, WAITING TO COME ALIVE</span><h1 ref={heading} tabIndex={-1}>Stay a little <em>longer.</em></h1><p>Photograph preview · 3D renderer not connected</p></div></div>}</div>
      <div className="mv-world-top"><button className="mv-glass mv-back" onClick={backToUpload}>← Your memory</button><span className="mv-status">{scene?.source === 'ai' ? 'AI MEMORY WORLD' : 'MEMORY WORLD'}</span></div>
      <aside className="mv-memory-info mv-glass"><p className="mv-eyebrow">A MOMENT, HELD IN LIGHT</p><h2 ref={heading} tabIndex={-1}>{scene?.title || 'Your memory'}</h2><p>{activeStopTitle || description}</p></aside>
      <div className="mv-world-controls mv-glass">
        <div className="mv-sound-controls">
          <div>
            <span>Guided Narration</span>
            <button
              type="button"
              aria-pressed={tourPlaying}
              onClick={() => setTourPlaying(prev => !prev)}
            >
              {tourPlaying ? '⏸' : '▷'} <span>{tourPlaying ? 'Pause tour' : 'Start room tour'}</span>
            </button>
          </div>
          <div>
            <span>Ambient sound</span>
            <button
              type="button"
              aria-pressed={ambientPlaying}
              onClick={() => setAmbientPlaying(prev => !prev)}
            >
              ♫ <span>{ambientPlaying ? 'Playing' : 'Play ambience'}</span>
            </button>
          </div>
        </div>
        <fieldset className="mv-moods"><legend>SenseShift <span>Set the feeling</span></legend><div>{MOODS.map(value => <label key={value} className={mood === value ? 'mv-selected' : ''}><input type="radio" name="mv-mood" value={value} checked={mood === value} onChange={() => setMood(value)} /><span>{value}</span></label>)}</div></fieldset>
        <p className="mv-fine mv-controls-note">Click any 3D object to fly to it and hear its story, or press Start room tour for a guided walkthrough.</p>
      </div>
    </section>}
      </div></div>
    </section>}
  </main>
}