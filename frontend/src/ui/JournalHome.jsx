import { useEffect, useRef, useState } from 'react'
import { formatMemoryDate } from './journalStore.js'
import './JournalHome.css'

import JournalIcon from './MemoryIcon.jsx'
import MemoryPodcast from './MemoryPodcast.jsx'

export default function JournalHome({ entries, loading, Photo, WorldViewer, headingRef, onOpen, onNew, onExplore, onDemo, plan, guestImport, user, favorites = {}, onFavorite, favoriteBusy = false, favoritesOnly = false, onBrowse }) {
  const [currentId, setCurrentId] = useState(null)
  const [panel, setPanel] = useState(null)
  const panelTitle = useRef(null)
  const panelOpener = useRef(null)
  function closePanel() { setPanel(null); panelOpener.current?.focus() }
  function togglePanel(next, event) {
    panelOpener.current = event.currentTarget
    if (panel === next) closePanel()
    else setPanel(next)
  }
  useEffect(() => {
    if (!panel) return
    panelTitle.current?.focus()
    const escape = event => { if (event.key === 'Escape') { setPanel(null); panelOpener.current?.focus() } }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [panel])
  const memory = entries.find(entry => entry.id === currentId) || entries[0]
  const hasWorld = !!memory?.world && !['mock', 'sample'].includes(memory.world.source)
  const thumbnail = memory?.world?.thumbnailUrl
  function choose(entry) { setCurrentId(entry.id); setPanel(null) }
  return <section className="jh-home" aria-label={favoritesOnly ? "Favorites" : "My Journal"}>
    <div className="jh-frame">
      <div className={`jh-stage ${memory?.photos?.length || thumbnail ? '' : 'jh-stage-empty'}`}>
        {loading ? <p className="jh-loading" role="status">Opening your journal…</p> : hasWorld && WorldViewer ? <div className="jh-world" aria-label="Saved 3D memory preview"><WorldViewer key={memory.id} memory={memory} world={memory.world} mood={memory.mood} embedded previewOnly /></div> : memory?.photos?.length ? <Photo file={memory.photos[0]} alt={memory.title} className="jh-cover" /> : thumbnail ? <img src={thumbnail} alt={memory.title} className="jh-cover" /> : <div className="jh-dream"><div className="jh-portal" aria-hidden="true">✧</div><p>{memory ? 'Some places live in words.' : favoritesOnly ? 'Tap a heart to keep a memory close.' : 'A little place for everything you remember.'}</p><h2>{memory ? memory.title : favoritesOnly ? 'Your favorites will be here.' : 'Your story begins here.'}</h2><button className="mj-primary" onClick={memory ? () => onOpen(memory) : favoritesOnly ? onBrowse : onNew}>{memory ? 'Read this memory' : favoritesOnly ? 'Browse memories' : 'Create your first memory'}</button></div>}
        {memory && <>
          <button className="jh-round jh-bookmark" aria-label="Open current journal entry" title="Open journal entry" onClick={() => onOpen(memory)}><JournalIcon name="book" /></button>
          <div className="jh-stage-bottom"><span className="jh-media-label">{hasWorld ? 'Saved 3D world available' : memory.photos.length ? 'YOUR PHOTOGRAPH' : 'YOUR WORDS'}<i />{memory.mood}</span>{(hasWorld || memory.photos.length > 0) && <button className="jh-explore" onClick={() => onExplore(memory)}>{hasWorld ? 'Open 3D world' : 'Create 3D world'} <JournalIcon name="expand" /></button>}</div>
        </>}
      </div>
      <div className="jh-caption">
        <div className="jh-current" aria-live="polite"><p>CURRENT MEMORY {memory && <time dateTime={memory.date}>/ {formatMemoryDate(memory.date, { month: 'short', day: 'numeric', year: 'numeric' })}</time>}</p><h1 ref={headingRef} tabIndex={-1}>{memory ? memory.title : 'A moment waiting to be kept'}</h1></div>
        <div className="jh-tools" role="group" aria-label="Current memory controls">
          <button className="jh-round" disabled={!memory} aria-label="Listen to memory" title="Listen" aria-controls="jh-active-panel" aria-expanded={panel === 'narration'} onClick={event => togglePanel('narration', event)}><JournalIcon name="headphones" /></button>
          <button className="jh-round jh-heart" disabled={!memory || favoriteBusy} aria-label={favorites[memory?.id] ? 'Remove from favorites' : 'Add to favorites'} title="Favorite" aria-pressed={!!favorites[memory?.id]} onClick={() => onFavorite?.(memory)}><JournalIcon name="heart" /></button>
          <button className="jh-round" aria-label="Journal options" title="Journal options" aria-controls="jh-active-panel" aria-expanded={panel === 'options'} onClick={event => togglePanel('options', event)}><JournalIcon name="settings" /></button>
        </div>
      </div>
      <div className="jh-footer"><p>{memory?.story ? memory.story : 'Keep the ordinary days. Return to the unforgettable ones.'}</p><button onClick={onNew}>＋ New Memory</button></div>
    </div>
    {panel && <aside id="jh-active-panel" className="jh-panel" aria-label={panel === 'narration' ? 'Guided journey controls' : panel === 'story' ? 'Current memory story' : 'Journal options'}><div className="jh-panel-top"><h2 ref={panelTitle} tabIndex={-1}>{panel === 'narration' ? 'Listen to the moment' : panel === 'story' ? memory?.title : 'Make room for another memory'}</h2><button className="jh-close" aria-label="Close journal panel" onClick={closePanel}>×</button></div>{panel === 'story' && memory ? <><p className="jh-full-story">{memory.story || 'A moment held in photographs.'}</p><button className="mj-secondary" onClick={() => onOpen(memory)}>Open full journal entry</button></> : panel === 'narration' && memory ? <><MemoryPodcast key={memory.id} memory={memory} user={user} autoPlay /></> : <><p>Your photographs, stories, and worlds, all kept together.</p><div className="jh-option-actions"><button className="mj-primary" onClick={onNew}>＋ New Memory</button><button className="mj-secondary" onClick={onDemo}>Try a Demo ↗</button>{memory && <button className="mj-secondary" onClick={() => onOpen(memory)}>Open current memory</button>}</div>{plan}{guestImport}</>}</aside>}
    {!!entries.length && <section className="jh-collection" aria-label="Saved journal memories"><div className="jh-collection-heading"><div><p className="mj-eyebrow">A LITTLE CLOSER TO THEN</p><h2>Your memories <span>{entries.length}</span></h2></div><button className="mj-back" onClick={onNew}>＋ Add a memory</button></div><div className="jh-memory-rail">{entries.map(entry => <button className="jh-memory" key={entry.id} aria-pressed={memory?.id === entry.id} onClick={() => choose(entry)}><div className="jh-thumb">{entry.photos.length ? <Photo file={entry.photos[0]} alt="" loading="lazy" /> : <span aria-hidden="true">✧</span>}<span className="jh-memory-mood">{entry.mood}</span></div><time dateTime={entry.date}>{formatMemoryDate(entry.date, { month: 'short', day: 'numeric', year: 'numeric' })}</time><h3>{entry.title}</h3></button>)}</div></section>}
  </section>
}
