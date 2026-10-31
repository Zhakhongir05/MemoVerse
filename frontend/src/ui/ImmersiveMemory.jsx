import { useEffect, useRef, useState } from 'react'
import { formatMemoryDate } from './journalStore'
import './ImmersiveMemory.css'
import MemoryPodcast from './MemoryPodcast.jsx'
import MemoryIcon from './MemoryIcon.jsx'
import { useMemoryPhoto } from './useMemoryPhoto.js'

export default function ImmersiveMemory({ memory, SceneRenderer, WorldViewer, JourneyController, steps, activeStep, onStepChange, initialMode, editor, onBeginEdit, onCancelEdit, onExit, onOpenStudio, symbolic = false, demo = false, savedToken, error, saving, user, favorite = false, onFavorite, favoriteBusy = false }) {
  const { url: imageUrl, error: photoError } = useMemoryPhoto(memory)
  const [mode, setMode] = useState('explore')
  const [panel, setPanel] = useState(null)
  const [listening, setListening] = useState(initialMode === 'guided')
  const [mood, setMood] = useState(memory.mood)
  const [cameraReset, setCameraReset] = useState(0)
  const [podcastCue, setPodcastCue] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const frame = useRef(null)
  const panelHeading = useRef(null)
  const opener = useRef(null)
  const previousSavedToken = useRef(savedToken)
  const hasWorld = !!(!symbolic && memory.world && WorldViewer)

  useEffect(() => {
    if (panel) panelHeading.current?.focus()
    else opener.current?.focus()
  }, [panel])
  useEffect(() => {
    if (savedToken !== previousSavedToken.current) {
      previousSavedToken.current = savedToken
      setPanel(null); setMode('explore')
    }
  }, [savedToken])
  useEffect(() => { setMood(memory.mood) }, [memory.mood])

  function closePanel() {
    if (panel === 'edit' && !onCancelEdit()) return false
    setPanel(null); setMode('explore')
    return true
  }
  useEffect(() => {
    const escape = event => { if (event.key === 'Escape') { if (panel) { event.preventDefault(); closePanel() } else if (listening) { setListening(false); setPodcastCue(null) } } }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  })

  function openPanel(next, event) {
    if (saving) return
    if (panel === next) { closePanel(); return }
    if (panel === 'edit' && !onCancelEdit()) return
    opener.current = event?.currentTarget || null
    if (next === 'edit') { onBeginEdit(false); setMode('edit') }
    else setMode('explore')
    setPanel(next)
  }
  const renderProps = {
    scene: memory.scene, mood, memory, mode, imageUrl, enhancementOwner: memory.owner,
    // Relive keeps the World Labs room, as before the integration branch.
    worldMode: symbolic ? 'sample' : 'saved', embedded: true,
    activeStep: panel === 'journey' ? activeStep : null,
    showAnchors: false, showMarkers: false,
    cameraResetKey: cameraReset, podcastCue: listening ? podcastCue : null,
  }

  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === frame.current)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  async function toggleFullscreen() {
    setFullscreenError('')
    try {
      if (document.fullscreenElement === frame.current) await document.exitFullscreen()
      else if (frame.current?.requestFullscreen) await frame.current.requestFullscreen()
      else setFullscreenError('Fullscreen is not available in this browser.')
    } catch { setFullscreenError('Fullscreen could not open. Try opening the site in a browser tab.') }
  }
  return <section ref={frame} className={`im-experience ${panel ? 'im-panel-open' : ''}`} aria-label="Immersive memory exploration">
    <div className="im-body"><div className="im-scene" aria-label="Interactive memory world">
      <div className="im-renderer" key={`${memory.id}:${cameraReset}`}>{hasWorld ? <WorldViewer {...renderProps} world={memory.world} /> : SceneRenderer ? <SceneRenderer {...renderProps} /> : <div className="im-unavailable"><h2>This world is still waiting.</h2><p>Your story and photographs are ready to revisit.</p></div>}</div>
      <div className="im-topbar"><button className="im-back" disabled={saving} onClick={onExit} aria-label="Back to memory">← Back</button><div className="im-memory-name"><span>{formatMemoryDate(memory.date)}</span><h1>{memory.title}</h1></div>{symbolic || demo ? <span className="im-mode-label">Sample</span> : null}</div>
      {photoError && <p className="im-fullscreen-error" role="alert">{photoError}</p>}
      {fullscreenError && <p className="im-fullscreen-error" role="alert">{fullscreenError}</p>}
      {!demo && <div className="im-audio-status" hidden={!listening}><MemoryPodcast key={memory.id} compact autoPlay={listening} onPlaybackChange={setPodcastCue} memory={memory} user={user} /></div>}
      <div className="im-toolbar" role="toolbar" aria-label="Memory world controls">
        {!demo && <Tool label="Listen" icon="headphones" active={listening} onClick={() => setListening(value => !value)} />}
        <Tool label={favorite ? 'Favorited' : 'Favorite'} icon="heart" active={favorite} onClick={onFavorite} disabled={favoriteBusy || demo} />
        <Tool label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} icon="expand" active={fullscreen} onClick={toggleFullscreen} />
        <Tool label="More" icon="more" active={!!panel} onClick={event => openPanel('options', event)} disabled={saving} />
      </div>
    </div>
    <aside className={`im-panel ${panel ? 'im-panel-visible' : ''}`} aria-label="Memory controls panel" aria-hidden={!panel} inert={!panel}>
      {panel && <div className="im-panel-content"><header><div><h2 ref={panelHeading} tabIndex={-1}>{({ mood: 'SenseShift', journey: 'A guided journey', edit: 'Your memory', info: 'About this memory', options: 'Memory options' })[panel]}</h2></div><button className="im-close" aria-label="Close memory panel" disabled={saving} onClick={closePanel}>×</button></header>
        {panel === 'options' && <div className="im-option-list"><button className="mj-secondary" onClick={event => openPanel('edit', event)}>Edit memory</button><button className="mj-secondary" onClick={event => openPanel('mood', event)}>Atmosphere</button><button className="mj-secondary" onClick={() => { setCameraReset(value => value + 1); closePanel() }}>Reset view</button><button className="mj-secondary" onClick={event => openPanel('info', event)}>Read story</button></div>}
        {panel === 'mood' && <><p className="im-panel-lede">Set the atmosphere for this visit.</p><fieldset className="im-mood-options"><legend className="mj-sr-only">Scene atmosphere</legend>{['Nostalgic', 'Joyful', 'Melancholic'].map(value => <label key={value} className={mood === value ? 'im-chosen' : ''}><input type="radio" name="immersive-mood" checked={mood === value} onChange={() => setMood(value)} /><span>{value}</span></label>)}</fieldset></>}
        {panel === 'edit' && <>{error && <p className="mj-field-error" role="alert">Your changes could not be saved. Please try again.</p>}{editor}</>}
        {panel === 'info' && <><p className="im-panel-lede">{memory.title}</p><p className="im-story">{memory.story}</p><p className="im-panel-note">{formatMemoryDate(memory.date)} · {memory.mood}</p>{onOpenStudio && <button className="mj-secondary" disabled={saving} onClick={onOpenStudio}>Open Memory Studio</button>}</>}
      </div>}
    </aside></div>
    {panel === 'journey' && JourneyController && <JourneyController memory={memory} steps={steps} activeStep={activeStep} onStepChange={onStepChange} />}
  </section>
}

function Tool({ label, icon, active, onClick, disabled }) {
  return <button className="im-tool" title={label} aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}><MemoryIcon name={icon} /><small>{label}</small></button>
}
