import { useEffect, useRef, useState } from 'react'
import { formatMemoryDate } from './journalStore'
import './ImmersiveMemory.css'
import { preparePodcast } from '../integration/preparePodcast.js'
import MemoryPodcast from './MemoryPodcast.jsx'
import { useMemoryPhoto } from './useMemoryPhoto.js'

export default function ImmersiveMemory({ memory, SceneRenderer, WorldViewer, JourneyController, steps, activeStep, onStepChange, initialMode, editor, onBeginEdit, onCancelEdit, onExit, onOpenStudio, symbolic = false, demo = false, savedToken, error, saving }) {
  const { url: imageUrl, error: photoError } = useMemoryPhoto(memory)
  const [mode, setMode] = useState('explore')
  const [panel, setPanel] = useState(initialMode === 'guided' ? 'journey' : null)
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
    if (hasWorld) void preparePodcast(memory.id).catch(() => {})
  }, [hasWorld, memory.id])

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
    const escape = event => { if (event.key === 'Escape' && panel) { event.preventDefault(); closePanel() } }
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
    minimal: mode !== 'edit', scene: memory.scene, mood, memory, mode, imageUrl, enhancementOwner: memory.owner,
    // Relive keeps the World Labs room, as before the integration branch.
    worldMode: symbolic ? 'sample' : 'saved',
    activeStep: null, // The podcast cue drives the camera; do not display a second legacy tour.
    showAnchors: false, showMarkers: false,
    cameraResetKey: cameraReset, podcastCue,
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
      <div className="im-topbar"><button className="im-back" disabled={saving} onClick={onExit}>← Back to memory</button><div className="im-memory-name"><span>{formatMemoryDate(memory.date)}</span><h1>{memory.title}</h1></div><span className="im-mode-label">{symbolic ? demo ? 'SAMPLE WORLD' : 'SAMPLE WORLD · NOT YOUR RECONSTRUCTION' : mode === 'edit' ? 'EDIT MODE' : 'EXPLORE'}</span></div>
      {photoError && <p className="im-fullscreen-error" role="alert">{photoError}</p>}
      {fullscreenError && <p className="im-fullscreen-error" role="alert">{fullscreenError}</p>}
      <div className="im-toolbar" role="toolbar" aria-label="Memory world controls">
        <Tool label="SenseShift" icon="◐" active={panel === 'mood'} onClick={event => openPanel('mood', event)} disabled={saving} />
        <Tool label="Listen to memory" icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 13h4v8H6a2 2 0 0 1-2-2zm16 0h-4v8h2a2 2 0 0 0 2-2z" /></svg>} active={panel === 'journey'} onClick={event => openPanel('journey', event)} disabled={saving} />
        <Tool label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} icon="⛶" active={fullscreen} onClick={toggleFullscreen} />
        <Tool label="Reset camera" icon="↺" onClick={() => setCameraReset(value => value + 1)} />
        <span className="im-toolbar-divider" />
        <Tool label={mode === 'edit' ? 'Explore mode' : 'Edit memory'} icon={mode === 'edit' ? '◎' : '✎'} active={mode === 'edit'} onClick={event => mode === 'edit' ? closePanel() : openPanel('edit', event)} disabled={saving} />

        <Tool label="Memory info" icon="ⓘ" active={panel === 'info'} onClick={event => openPanel('info', event)} disabled={saving} />
      </div>
    </div>
    <aside className={`im-panel ${panel ? 'im-panel-visible' : ''}`} aria-label="Memory controls panel" aria-hidden={!panel} inert={!panel}>
      {panel && <div className="im-panel-content"><header><div><p className="mj-eyebrow">{panel === 'edit' ? 'MAKE THE MOMENT YOURS' : 'A LITTLE CLOSER TO THEN'}</p><h2 ref={panelHeading} tabIndex={-1}>{({ mood: 'SenseShift', journey: 'Your podcast', edit: 'Your memory', info: 'About this memory' })[panel]}</h2></div><button className="im-close" aria-label="Close memory panel" disabled={saving} onClick={closePanel}>×</button></header>
        {panel === 'mood' && <><p className="im-panel-lede">Set the atmosphere for this visit.</p><fieldset className="im-mood-options"><legend className="mj-sr-only">Scene atmosphere</legend>{['Nostalgic', 'Joyful', 'Melancholic'].map(value => <label key={value} className={mood === value ? 'im-chosen' : ''}><input type="radio" name="immersive-mood" checked={mood === value} onChange={() => setMood(value)} /><span>{value}</span></label>)}</fieldset></>}
        {panel === 'journey' && <MemoryPodcast autoPlay onPlaybackChange={setPodcastCue} memory={memory} user={memory.owner && memory.owner!=='local-device' ? {id:memory.owner} : null} />}
        {panel === 'edit' && <>{error && <p className="mj-field-error" role="alert">Your changes could not be saved. Please try again.</p>}{editor}</>}
        {panel === 'info' && <><p className="im-panel-lede">{memory.title}</p><p className="im-story">{memory.story}</p><p className="im-panel-note">{formatMemoryDate(memory.date)} · {memory.mood}</p>{onOpenStudio && <button className="mj-secondary" disabled={saving} onClick={onOpenStudio}>Open Memory Studio</button>}</>}
      </div>}
    </aside></div>
    {panel === 'journey' && JourneyController && <JourneyController memory={memory} steps={steps} activeStep={activeStep} onStepChange={onStepChange} />}
  </section>
}

function Tool({ label, icon, active, onClick, disabled }) {
  return <button className="im-tool" title={label} aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}><span aria-hidden="true">{icon}</span></button>
}
