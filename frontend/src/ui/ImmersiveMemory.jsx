import { useEffect, useRef, useState } from 'react'
import { formatMemoryDate } from './journalStore'
import './ImmersiveMemory.css'

export default function ImmersiveMemory({ memory, SceneRenderer, WorldViewer, JourneyController, steps, activeStep, onStepChange, initialMode, editor, onBeginEdit, onCancelEdit, onExit, Photo, symbolic = false, demo = false, savedToken, error, syncError, saving }) {
  const [mode, setMode] = useState('explore')
  const [panel, setPanel] = useState(initialMode === 'guided' ? 'journey' : null)
  const [mood, setMood] = useState(memory.mood)
  const [cameraReset, setCameraReset] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const frame = useRef(null)
  const panelHeading = useRef(null)
  const opener = useRef(null)
  const previousSavedToken = useRef(savedToken)
  const step = steps[activeStep]
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
  function addMemory(event) {
    if (saving || (panel === 'edit' && !onCancelEdit())) return
    opener.current = event.currentTarget
    onBeginEdit(true); setMode('edit'); setPanel('edit')
  }
  const renderProps = {
    scene: memory.scene, mood, memory, mode,
    activeStep: panel === 'journey' ? activeStep : null,
    showAnchors: false, showMarkers: false,
    cameraResetKey: cameraReset,
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
      <div className="im-topbar"><button className="im-back" disabled={saving} onClick={onExit}>← Back to memory</button><div className="im-memory-name"><span>{formatMemoryDate(memory.date)}</span><h1>{memory.title}</h1></div><span className="im-mode-label">{symbolic ? demo ? 'SYMBOLIC DEMO' : 'SYMBOLIC FALLBACK' : mode === 'edit' ? 'EDIT MODE' : 'EXPLORE'}</span></div>
      {fullscreenError && <p className="im-fullscreen-error" role="alert">{fullscreenError}</p>}
      <div className="im-toolbar" role="toolbar" aria-label="Memory world controls">
        <Tool label="SenseShift" icon="◐" active={panel === 'mood'} onClick={event => openPanel('mood', event)} disabled={saving} />
        <Tool label="Guided tour" icon="✧" active={panel === 'journey'} onClick={event => openPanel('journey', event)} disabled={saving} />
        <Tool label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} icon="⛶" active={fullscreen} onClick={toggleFullscreen} />
        <Tool label="Reset camera" icon="↺" onClick={() => setCameraReset(value => value + 1)} />
        <span className="im-toolbar-divider" />
        <Tool label={mode === 'edit' ? 'Explore mode' : 'Edit memory'} icon={mode === 'edit' ? '◎' : '✎'} active={mode === 'edit'} onClick={event => mode === 'edit' ? closePanel() : openPanel('edit', event)} disabled={saving} />
        <Tool label="Add Memory" icon="＋" onClick={addMemory} disabled={saving} />
        <Tool label="Memory info" icon="ⓘ" active={panel === 'info'} onClick={event => openPanel('info', event)} disabled={saving} />
      </div>
    </div>
    <aside className={`im-panel ${panel ? 'im-panel-visible' : ''}`} aria-label="Memory controls panel" aria-hidden={!panel} inert={!panel}>
      {panel && <div className="im-panel-content"><header><div><p className="mj-eyebrow">{panel === 'edit' ? 'MAKE THE MOMENT YOURS' : 'A LITTLE CLOSER TO THEN'}</p><h2 ref={panelHeading} tabIndex={-1}>{({ mood: 'SenseShift', journey: 'A guided journey', edit: 'Your memory', info: 'About this memory' })[panel]}</h2></div><button className="im-close" aria-label="Close memory panel" disabled={saving} onClick={closePanel}>×</button></header>
        {panel === 'mood' && <><p className="im-panel-lede">Set the atmosphere for this visit.</p><fieldset className="im-mood-options"><legend className="mj-sr-only">Scene atmosphere</legend>{['Nostalgic', 'Joyful', 'Melancholic'].map(value => <label key={value} className={mood === value ? 'im-chosen' : ''}><input type="radio" name="immersive-mood" checked={mood === value} onChange={() => setMood(value)} /><span>{value}</span></label>)}</fieldset></>}
        {panel === 'journey' && step && <><p className="im-step-count">MOMENT {activeStep + 1} OF {steps.length}</p><h3>{step.title}</h3>{step.photoIndex !== null && <Photo file={memory.photos[step.photoIndex]} alt={`Memory photograph ${step.photoIndex + 1}`} className="im-journey-photo" />}<p className="im-story">{step.text}</p><div className="im-journey-actions"><button className="mj-secondary" disabled={activeStep === 0} onClick={() => onStepChange(activeStep - 1)}>← Previous</button><button className="mj-primary" onClick={() => activeStep + 1 === steps.length ? closePanel() : onStepChange(activeStep + 1)}>{activeStep + 1 === steps.length ? 'Explore freely' : 'Next moment →'}</button></div></>}
        {panel === 'edit' && <>{error && <p className="mj-field-error" role="alert">Your changes could not be saved. Please try again.</p>}{editor}</>}
        {panel === 'info' && <><p className="im-panel-lede">{memory.title}</p><p className="im-story">{memory.story}</p><p className="im-panel-note">{formatMemoryDate(memory.date)} · {memory.mood}</p><details className="im-debug"><summary>Technical details</summary><p>Viewer: {hasWorld ? 'World Labs integration' : 'Predefined R3F demo'}</p><p>{JourneyController ? 'Journey controller supplied.' : 'Guided reading only. AI narration and synchronized camera anchors await integration.'}</p><p>Marker overlays are disabled for exploration.</p>{syncError && <p>Sync: {syncError}</p>}{error && <p>Save: {error}</p>}</details></>}
      </div>}
    </aside></div>
    {panel === 'journey' && JourneyController && <JourneyController memory={memory} steps={steps} activeStep={activeStep} onStepChange={onStepChange} />}
  </section>
}

function Tool({ label, icon, active, onClick, disabled }) {
  return <button className="im-tool" title={label} aria-label={label} aria-pressed={active} onClick={onClick} disabled={disabled}><span aria-hidden="true">{icon}</span><small>{label}</small></button>
}
