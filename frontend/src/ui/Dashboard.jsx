import { useEffect, useMemo, useRef, useState } from 'react'
import './Dashboard.css'
import MemoryLibrary from './MemoryLibrary'
import useMemorySave from './useMemorySave'
import WorldGeneration from '../integration/WorldGeneration.jsx'
import { generateStudioMemory } from '../integration/studioApi.js'
import { sceneStatus } from '../integration/sceneResponse.js'

const MOODS = ['Nostalgic', 'Joyful', 'Melancholic']
const MAX_IMAGE = 4 * 1024 * 1024

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
 * generateMemory receives { file, audioFile, description, signal } and returns scene JSON.
 * The optional renderer may display a predefined demo.
 */
export default function Dashboard({ SceneRenderer, generateMemory = generateStudioMemory, user, onSignOut, onSignIn, onExplore, checkingAuth, initialScreen = 'landing' }) {
  const [screen, setScreen] = useState(initialScreen)
  const [sceneExpanded, setSceneExpanded] = useState(false)
  const [inputsOpen, setInputsOpen] = useState(false)
  const studioScreen = useRef('upload')
  const [file, setFile] = useState(null)
  const [imageUrl, setImageUrl] = useState('')
  const [audioFile, setAudioFile] = useState(null)
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState({})
  const [scene, setScene] = useState(null)
  const [provenance, setProvenance] = useState(null)
  const [worldMode, setWorldMode] = useState('symbolic')
  const [generatedWorld, setGeneratedWorld] = useState(null)
  const [failure, setFailure] = useState('')
  const [mood, setMood] = useState('Nostalgic')
  const [dragging, setDragging] = useState(false)
  const [libraryBusy, setLibraryBusy] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountError, setAccountError] = useState('')
  const controller = useRef(null)
  const fileInput = useRef(null)
  const heading = useRef(null)
  const isMock = generateMemory === generateMockMemory
  const pending = screen === 'generation' && !failure
  const worldLabel = worldMode === 'generated' ? 'NEW GENERATED WORLD' : worldMode === 'sample' ? 'SAVED WORLD LABS SAMPLE' : scene ? provenance?.source === 'mock' ? 'SYMBOLIC DEMO' : provenance?.source === 'ai' ? 'AI SYMBOLIC SCENE' : 'SYMBOLIC SCENE' : 'SYMBOLIC PREVIEW'
  const draft = useMemo(() => ({ file, audioFile, description, mood, scene }), [file, audioFile, description, mood, scene])
  const memorySave = useMemorySave(user, draft)
  const saving = memorySave.status === 'saving'

  useEffect(() => {
    if (!file) { setImageUrl(''); return }
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { heading.current?.focus() }, [screen])
  useEffect(() => {
    if (['upload', 'generation', 'world'].includes(screen)) studioScreen.current = screen
  }, [screen])

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
      setScene(result.scene || result)
      setProvenance(result.source ? {source:result.source,fallback:result.fallback,reason:result.reason} : null)
      setWorldMode('symbolic')
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

  function restoreMemory(memory) {
    if (saving || (memorySave.dirty && !window.confirm('Discard unsaved changes and open this memory?'))) return
    memorySave.openDraft(memory)
    controller.current?.abort()
    setFile(memory.file)
    setAudioFile(memory.audioFile)
    setDescription(memory.description)
    setMood(MOODS.includes(memory.mood) ? memory.mood : 'Nostalgic')
    setScene(memory.scene)
    setProvenance(null)
    setErrors({}); setFailure('')
    setInputsOpen(false)
    setScreen(memory.scene ? 'world' : 'upload')
  }

  function newMemory() {
    if (saving || (memorySave.dirty && !window.confirm('Discard unsaved changes and start a new memory?'))) return
    controller.current?.abort()
    memorySave.newDraft()
    setFile(null); setAudioFile(null); setDescription(''); setMood('Nostalgic'); setScene(null); setProvenance(null)
    setErrors({}); setFailure(''); setScreen('upload')
  }

  return <main className={`memoverse mv-screen-${screen} mv-mood-${mood.toLowerCase()} ${sceneExpanded ? 'mv-scene-expanded' : ''} ${inputsOpen ? 'mv-inputs-open' : ''}`}>
    <div className="mv-grain" aria-hidden="true" />
    <div className="mv-particles" aria-hidden="true">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ '--x': `${(i * 47) % 100}%`, '--delay': `${i * -0.73}s`, '--duration': `${8 + i % 6}s` }} />)}</div>
    <header className="mv-header">
      <button className="mv-brand" onClick={() => { controller.current?.abort(); setScreen('landing') }} aria-label="MemoVerse home"><span className="mv-brand-mark">◈</span> MemoVerse<span className="mv-brand-dot">.</span></button>
      {screen !== 'landing' && <nav className="mv-view-nav" aria-label="Memory navigation">
        <button aria-current={['upload', 'generation', 'world'].includes(screen) ? 'page' : undefined} disabled={libraryBusy || pending || checkingAuth} onClick={() => user ? setScreen(studioScreen.current) : onSignIn?.()}>Studio</button>
        {user && <button aria-current={screen === 'library' ? 'page' : undefined} disabled={pending || libraryBusy} onClick={() => { if (screen !== 'landing' && screen !== 'library') studioScreen.current = screen; setScreen('library') }}>Saved memories</button>}
      </nav>}
      {user ? <div className="mv-account"><span title={user.email}>{user.email}</span><button disabled={accountBusy || libraryBusy || saving} onClick={async () => {
        if (memorySave.dirty && !window.confirm('You have unsaved changes. Sign out and discard them?')) return
        setAccountBusy(true); setAccountError('')
        try { await onSignOut() }
        catch { setAccountError('Sign out failed. Please try again.'); setAccountBusy(false) }
      }}>{accountBusy ? 'Signing out…' : 'Sign out'}</button></div> : screen !== 'landing' && <div className="mv-account"><button onClick={onSignIn} disabled={checkingAuth}>{checkingAuth ? 'Checking session…' : 'Sign in'}</button></div>}
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
        <button className="mv-primary" disabled={checkingAuth} onClick={() => onExplore ? onExplore() : user ? setScreen('upload') : onSignIn?.()}>Explore Memories <span aria-hidden="true">↗</span></button>
        <p className="mv-fine">One photograph. A thousand feelings.{!user && ' Sign in to explore and save your memories.'}</p>
      </div>
      <div className="mv-landing-art"><Portal /><span className="mv-art-caption">THE WAY BACK IS THROUGH</span></div>
      <footer className="mv-landing-footer"><span>IMAGINED WITH AI. <strong>FELT BY YOU.</strong></span><span>01 — THE BEGINNING</span></footer>
    </section>}

    {['upload', 'generation', 'world'].includes(screen) && <section className="mv-upload mv-workspace mv-enter">
      <div className="mv-studio-toolbar">
        <div className="mv-section-heading"><p className="mv-eyebrow">YOUR MEMORY STUDIO</p><h1 ref={screen === 'upload' ? heading : undefined} tabIndex={-1}>A moment. <em>A world.</em></h1></div>
        <div className="mv-studio-actions"><button className="mv-mobile-input-toggle" aria-expanded={inputsOpen} aria-controls="mv-studio-inputs" onClick={() => setInputsOpen(value => !value)}>{inputsOpen ? 'Close inputs' : 'Edit inputs'}</button><button className="mv-expand-scene" aria-pressed={sceneExpanded} onClick={() => { setSceneExpanded(value => !value); setInputsOpen(false) }}>{sceneExpanded ? 'Show inputs ↙' : 'Expand scene ↗'}</button></div>
      </div>
      <div className="mv-workspace-grid"><div id="mv-studio-inputs" className="mv-input-column" role="region" aria-label="Memory inputs" tabIndex={0}><form className="mv-upload-grid" onSubmit={generate} noValidate><fieldset className="mv-input-fields" disabled={pending || libraryBusy || accountBusy}><legend className="mv-sr-only">Photograph and memory description</legend>
        <div className="mv-glass mv-photo-panel"><div className="mv-panel-label"><span>01</span><h2>Your photograph</h2></div>
          <input ref={fileInput} id="mv-photo" className="mv-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a memory photograph" aria-invalid={!!errors.image} aria-describedby="mv-photo-help mv-image-error" onChange={event => { selectImage(event.target.files?.[0]); event.target.value = '' }} />
          {imageUrl ? <div className="mv-image-preview"><img src={imageUrl} alt="Your selected memory" /><div className="mv-image-actions"><button type="button" onClick={() => fileInput.current?.click()}>Replace</button><button type="button" onClick={() => setFile(null)}>Remove</button></div></div> : <button type="button" className={`mv-dropzone ${dragging ? 'mv-dragging' : ''}`} onClick={() => fileInput.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); selectImage(event.dataTransfer.files?.[0]) }}><span className="mv-upload-symbol" aria-hidden="true">＋</span><strong>Bring a moment into focus</strong><span>Drop your photograph here, or browse</span></button>}
          <p id="mv-photo-help" className="mv-fine">JPG, PNG or WebP · Up to 4 MB · Choose a photo you can use</p>
          <p id="mv-image-error" className="mv-error" role="alert">{errors.image}</p>
        </div>
        <div className="mv-glass mv-description-panel"><div className="mv-panel-label"><span>02</span><h2>The story behind it</h2></div><label htmlFor="mv-description">What do you remember?</label><textarea id="mv-description" value={description} maxLength={2000} onChange={event => setDescription(event.target.value)} aria-invalid={!!errors.description} aria-describedby="mv-description-help mv-description-error" placeholder="We were at my grandmother’s house. The windows were open, the room smelled of summer rain, and somewhere a radio was playing…" /><div className="mv-textarea-meta"><span id="mv-description-help">Start with the details you can still feel.</span><span>{description.length}/2000</span></div><p id="mv-description-error" className="mv-error" role="alert">{errors.description}</p></div>
        <div className="mv-submit-panel"><div className="mv-submit-actions">{user && <button type="button" className="mv-save-button" disabled={saving || libraryBusy || accountBusy || !memorySave.dirty} onClick={memorySave.save}>{saving ? 'Saving…' : memorySave.dirty ? 'Save changes' : memorySave.saved ? 'Saved ✓' : 'Save changes'}</button>}<button className="mv-primary" type="submit">{pending ? 'Generating…' : scene ? 'Regenerate My Memory' : 'Generate My Memory'} <span aria-hidden="true">✧</span></button></div><p className="mv-fine">{user ? 'Use Save changes to store your inputs privately. Scene generation uses the configured AI backend.' : isMock ? 'Local demo · Inputs are not saved to a server.' : 'Your inputs will be sent for generation.'}</p></div>
      </fieldset></form>
      {user && <div className="mv-autosave mv-glass">
        <p role="status">{memorySave.status === 'saving' ? 'Saving to your account…' : memorySave.status === 'saved' ? '✓ All changes saved privately' : memorySave.status === 'error' ? 'Changes have not been saved.' : memorySave.dirty ? 'Unsaved changes · Select Save changes.' : 'Select Save changes when your memory is ready.'}</p>
        {memorySave.status === 'error' && <><p role="alert" className="mv-error">{memorySave.error}</p><button type="button" onClick={memorySave.save}>Retry saving</button></>}
        <p className="mv-fine">Photographs upload to private storage. Your story, mood, and scene data save to your database.</p>
      </div>}
      <WorldGeneration user={user} file={file} description={description} onReady={world => { setGeneratedWorld(world); setWorldMode('generated'); setScreen('world') }} onExploreSample={() => { setWorldMode('sample'); setScreen('world') }} />
      </div>
      <div className="mv-preview-panel mv-glass" aria-label="Memory world preview">
        <div className="mv-preview-header"><div><p className="mv-eyebrow">A SPACE TO STEP INTO</p><h2>Your memory world</h2></div><span className="mv-status">{pending ? 'PREPARING' : worldLabel}</span></div>
        {provenance && worldMode==='symbolic' && <p role="status" className="mv-fine">{sceneStatus(provenance)}</p>}
        <div className="mv-mode-picker" aria-label="World mode"><button type="button" aria-pressed={worldMode==='symbolic'} onClick={()=>setWorldMode('symbolic')}>Your symbolic scene</button><button type="button" aria-pressed={worldMode==='sample'} onClick={()=>setWorldMode('sample')}>Saved World Labs sample</button>{generatedWorld&&<button type="button" aria-pressed={worldMode==='generated'} onClick={()=>setWorldMode('generated')}>New generated world</button>}</div>
        {worldMode==='generated' && generatedWorld?.thumbnailUrl && <img className="mv-generated-preview" src={generatedWorld.thumbnailUrl} alt="Preview of your newly generated World Labs world" />}
        {screen === 'upload' && (SceneRenderer ? <div className="mv-studio-demo"><div className="mv-demo-canvas" role="region" aria-label="Interactive predefined 3D room"><SceneRenderer scene={scene} imageUrl={imageUrl} mood={mood} enhancementOwner={user?.id || 'local-device'} worldMode={worldMode} generatedWorld={generatedWorld} onMoodChange={value=>setMood(value[0].toUpperCase()+value.slice(1))} /></div><div className="mv-demo-caption"><h2>A room to return to.</h2><p>Symbolic preview · Drag to orbit. Scroll or pinch to zoom.</p><p className="mv-fine">Symbolic scenes assemble supported objects from your photograph’s analysis. Realistic World Labs generation uses the separate free-world action.</p></div></div> : <div className="mv-preview-empty"><Portal small /><h2>{scene ? 'Your next chapter starts here.' : 'Your world begins with a memory.'}</h2><p>Add a photograph and describe the moment on the left.</p><p className="mv-fine">3D renderer not connected · Scene integration area</p></div>)}

    {screen === 'generation' && <section className="mv-generation mv-enter" aria-busy={!failure}>
      <Portal small /><p className="mv-eyebrow">{isMock ? 'MOCK GENERATION / EXPERIENCE PREVIEW' : 'CREATING YOUR MEMORY'}</p>
      <h1 ref={heading} tabIndex={-1}>{failure ? 'A moment to pause.' : 'Reconstructing your memory…'}</h1>
      <div role={failure ? 'alert' : 'status'}>{failure ? <p className="mv-generation-message">{failure}</p> : <p className="mv-generation-message">Gathering the light, the atmosphere, the little things.<br />{isMock ? 'Preparing a local sample scene. AI is not connected yet.' : 'Waiting for your scene to be ready.'}</p>}</div>
      {!failure && <div className="mv-loading-dots" aria-hidden="true"><i /><i /><i /></div>}
      {failure && <button className="mv-primary" onClick={() => generate()}>Try again <span aria-hidden="true">↻</span></button>}
      <button className="mv-back" onClick={backToUpload}>{failure ? '← Edit your memory' : 'Cancel and return'}</button>
    </section>}

    {screen === 'world' && <section className="mv-world mv-enter" aria-label="Memory world">
      <div className="mv-scene-slot">{SceneRenderer ? <SceneRenderer scene={scene} imageUrl={imageUrl} mood={mood} enhancementOwner={user?.id || 'local-device'} worldMode={worldMode} generatedWorld={generatedWorld} onMoodChange={value=>setMood(value[0].toUpperCase()+value.slice(1))} /> : <div className="mv-scene-placeholder"><div className="mv-world-haze" />{imageUrl && <img className="mv-world-photo" src={imageUrl} alt="Your memory photograph, displayed as a preview" />}<div className="mv-scene-notice"><span className="mv-eyebrow">YOUR WORLD, WAITING TO COME ALIVE</span><h1 ref={heading} tabIndex={-1}>Stay a little <em>longer.</em></h1><p>Photograph preview · 3D renderer not connected</p><p className="mv-fine">This space is reserved for the interactive memory world.</p></div></div>}</div>
      <div className="mv-world-top"><button className="mv-glass mv-back" onClick={backToUpload}>← Your memory</button><span className="mv-status">{worldLabel}</span></div>
      <aside className="mv-memory-info mv-glass"><p className="mv-eyebrow">A MOMENT, HELD IN LIGHT</p><h2 ref={heading} tabIndex={-1}>{worldMode === 'sample' ? 'Saved bedroom sample' : worldMode === 'generated' ? 'Your generated world' : scene?.title || 'Your memory'}</h2><p>{description}</p>{SceneRenderer && <p className="mv-fine">{worldMode === 'generated' ? 'A new World Labs world from your photograph.' : worldMode === 'sample' ? 'Saved sample generated from a different photograph.' : 'AI symbolic scene; not a realistic reconstruction.'}</p>}</aside>
      <div className="mv-world-controls mv-glass"><fieldset className="mv-moods"><legend>SenseShift <span>Set the feeling</span></legend><div>{MOODS.map(value => <label key={value} className={mood === value ? 'mv-selected' : ''}><input type="radio" name="mv-mood" value={value} checked={mood === value} onChange={() => setMood(value)} /><span>{value}</span></label>)}</div></fieldset><p className="mv-fine mv-controls-note">{SceneRenderer ? 'SenseShift adjusts the demo room’s ambient light. Audio is not connected. Drag to orbit; scroll or pinch to zoom.' : 'Mood changes the preview lighting. Interactive 3D and audio await integration.'}</p></div>
    </section>}
      </div></div>
    </section>}
  </main>
}
