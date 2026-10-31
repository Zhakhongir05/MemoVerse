import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMemoryDate, localDate } from './journalStore'
import './MemoryTimeline.css'
import { boardThread, readBoardPositions, zoomCamera } from './timelineBoard'

export default function MemoryTimeline({ entries, loading, onOpen, onNew, Photo, SceneRenderer, owner = 'local-device' }) {
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('all')
  const [grid, setGrid] = useState(false)
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 })
  const storageKey = 'memoverse:timeline-layout:' + owner
  const [positions, setPositions] = useState(() => readBoardPositions(storageKey))
  const [dragging, setDragging] = useState(false)
  const [photoIndexes, setPhotoIndexes] = useState({})
  const gesture = useRef(null)
  useEffect(() => { const timer = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify(positions)) } catch { /* Layout remains usable without storage. */ } }, 150); return () => clearTimeout(timer) }, [positions, storageKey])
  const track = useRef(null)
  const heading = useRef(null)
  useEffect(() => { heading.current?.focus() }, [])
  const years = useMemo(() => [...new Set(entries.map(entry => entry.date.slice(0, 4)))].sort(), [entries])
  const filtered = useMemo(() => entries.filter(entry => {
    const matchesYear = year === 'all' || entry.date.startsWith(year)
    const text = `${entry.title} ${entry.story} ${entry.mood} ${entry.date} ${formatMemoryDate(entry.date)}`.toLowerCase()
    return matchesYear && text.includes(query.trim().toLowerCase())
  }).sort((a, b) => a.date.localeCompare(b.date)), [entries, year, query])
  const width = Math.max(900, filtered.length * 300 + 80)
  const today = localDate().slice(5)
  function resetView() { setCamera({ x: 0, y: 0, scale: 1 }) }
  function selectYear(value) { setYear(value); resetView() }
  function zoomBy(delta) {
    const rect = track.current?.getBoundingClientRect()
    if (rect) setCamera(previous => zoomCamera(previous, previous.scale + delta, { x: rect.width / 2, y: rect.height / 2 }))
  }
  function startDrag(event, id, index) {
    if (grid || event.button !== 0) return
    if (!id && event.target.closest('.mt-node')) return
    event.preventDefault(); event.stopPropagation()
    const nodePosition = positions[id] || { x: index * 300 + 40, y: [30, 150, 100, 170][index % 4] }
    gesture.current = { pointerId: event.pointerId, id, startX: event.clientX, startY: event.clientY, camera, nodePosition }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
  }
  function moveDrag(event) {
    const drag = gesture.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX, dy = event.clientY - drag.startY
    if (drag.id) setPositions(previous => ({ ...previous, [drag.id]: { x: drag.nodePosition.x + dx / drag.camera.scale, y: drag.nodePosition.y + dy / drag.camera.scale } }))
    else setCamera({ ...drag.camera, x: drag.camera.x + dx, y: drag.camera.y + dy })
  }
  function endDrag(event) {
    if (gesture.current?.pointerId !== event.pointerId) return
    gesture.current = null; setDragging(false)
  }
  useEffect(() => {
    const node = track.current
    if (!node || grid) return
    const wheel = event => {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        const rect = node.getBoundingClientRect()
        setCamera(previous => zoomCamera(previous, previous.scale * Math.exp(-event.deltaY * 0.008), { x: event.clientX - rect.left, y: event.clientY - rect.top }))
      } else setCamera(previous => ({ ...previous, x: previous.x - event.deltaX, y: previous.y - event.deltaY }))
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  }, [grid, filtered.length, loading])
  function scroll(direction) { setCamera(previous => ({ ...previous, x: previous.x - direction * 300 })) }
  return <section className="mt-space" aria-labelledby="mt-title">
    <div className="mt-room" aria-hidden="true" inert>{SceneRenderer && <SceneRenderer mood="Nostalgic" />}</div>
    <div className="mt-atmosphere" aria-hidden="true" />
    <div className="mt-panel">
      <header className="mt-panel-header"><div><p className="mj-eyebrow">A LIFE, CONNECTED BY MOMENTS</p><h1 id="mt-title" ref={heading} tabIndex={-1}>My <em>Timeline.</em></h1></div><div className="mt-tools"><label className="mt-search"><span aria-hidden="true">⌕</span><span className="mj-sr-only">Search your timeline</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); resetView() }} placeholder="Find a moment…" /></label><button className="mt-new" onClick={onNew}>＋ <span>New Memory</span></button></div></header>
      <div className="mt-board-tools"><div role="group" aria-label="Timeline zoom"><button aria-label="Zoom out" disabled={grid || camera.scale <= 0.4} onClick={() => zoomBy(-0.15)}>−</button><output aria-label="Timeline zoom level">{Math.round(camera.scale * 100)}%</output><button aria-label="Zoom in" disabled={grid || camera.scale >= 2} onClick={() => zoomBy(0.15)}>＋</button><button disabled={grid} onClick={resetView}>Reset view</button><button disabled={grid} onClick={() => { setPositions({}); resetView() }}>Reset card positions</button></div></div>
      <p className="mt-result-count" role="status">{loading ? 'Opening your timeline…' : `${filtered.length} ${filtered.length === 1 ? 'moment' : 'moments'}${year !== 'all' ? ` in ${year}` : ' through the years'}`}</p>
      {!loading && !filtered.length ? <div className="mt-empty"><span aria-hidden="true">✧</span><h2>{entries.length ? 'A little further down memory lane?' : 'Your story starts with one moment.'}</h2><p>{entries.length ? 'Try a different year or search for another detail.' : 'Add a photograph or story to begin your timeline.'}</p>{entries.length ? <button className="mj-secondary" onClick={() => { setQuery(''); setYear('all') }}>Show all memories</button> : <button className="mj-primary" onClick={onNew}>Create a memory ↗</button>}</div> : <div ref={track} className={`mt-scroll mt-board ${grid ? 'mt-grid-mode' : ''} ${dragging ? 'mt-dragging' : ''}`} onPointerDown={event => startDrag(event, null, 0)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} tabIndex={0} role="region" aria-label="Memory blackboard. Drag empty space to pan. Use zoom controls or Control and mouse wheel to zoom." onKeyDown={event => {
        if (event.target !== event.currentTarget || grid) return
        if (event.key.startsWith('Arrow')) { event.preventDefault(); setCamera(previous => ({ ...previous, x: previous.x + (event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0), y: previous.y + (event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0) })) }
        if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(0.15) }
        if (event.key === '-') { event.preventDefault(); zoomBy(-0.15) }
        if (event.key === '0') { event.preventDefault(); resetView() }
      }}><div className="mt-track" style={{ width: grid ? undefined : `${width}px`, transform: grid ? undefined : `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        {!grid && <svg className="mt-thread" viewBox={`0 0 ${width} 440`} preserveAspectRatio="none" aria-hidden="true"><path d={boardThread(filtered, positions)} /></svg>}
        {filtered.map((entry, index) => <div key={entry.id} className="mt-node" style={{ '--card-left': `${positions[entry.id]?.x ?? index * 300 + 40}px`, '--card-top': `${positions[entry.id]?.y ?? [30, 150, 100, 170][index % 4]}px` }}>
          <div className="mt-node-date"><time dateTime={entry.date}>{formatMemoryDate(entry.date, { month: 'short', day: 'numeric', year: 'numeric' })}</time>{!grid && <button className="mt-move-handle" aria-label={'Move ' + entry.title + '. Use arrow keys to reposition.'} title="Drag to move this memory" onPointerDown={event => startDrag(event, entry.id, index)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onKeyDown={event => {
            if (!event.key.startsWith('Arrow')) return
            event.preventDefault(); event.stopPropagation()
            const amount = event.shiftKey ? 40 : 10
            setPositions(previous => { const point = previous[entry.id] || { x: index * 300 + 40, y: [30, 150, 100, 170][index % 4] }; return { ...previous, [entry.id]: { x: point.x + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0), y: point.y + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0) } } })
          }}>⠿</button>}</div>
          <button className="mt-card" onClick={() => onOpen(entry)} aria-label={`Open ${entry.title}, ${formatMemoryDate(entry.date)}`}><div className={`mt-photo mj-${entry.mood.toLowerCase()}`}>{entry.photos[0] ? <Photo file={entry.photos[(photoIndexes[entry.id] || 0) % entry.photos.length]} alt="" loading="lazy" /> : <span aria-hidden="true">{'✧'}</span>}{entry.date.slice(5) === today && <span className="mt-on-this-day">On this day</span>}</div><div className="mt-card-caption"><h2>{entry.title}</h2><span>{entry.mood} <span aria-hidden="true">↗</span></span></div></button>{entry.photos.length > 1 && <div className="mt-photo-switcher" aria-label={'Photographs in ' + entry.title}><button aria-label={'Previous photograph in ' + entry.title} onClick={() => setPhotoIndexes(previous => ({ ...previous, [entry.id]: ((previous[entry.id] || 0) - 1 + entry.photos.length) % entry.photos.length }))}>‹</button><span>{((photoIndexes[entry.id] || 0) % entry.photos.length) + 1} / {entry.photos.length} photos</span><button aria-label={'Next photograph in ' + entry.title} onClick={() => setPhotoIndexes(previous => ({ ...previous, [entry.id]: ((previous[entry.id] || 0) + 1) % entry.photos.length }))}>›</button></div>}<span className="mt-anchor" aria-hidden="true" />
        </div>)}
      </div></div>}
      <footer className="mt-footer"><div className="mt-years" role="group" aria-label="Filter timeline by year"><button aria-pressed={year === 'all'} onClick={() => selectYear('all')}>All years</button>{years.map(value => <button key={value} aria-pressed={year === value} onClick={() => selectYear(value)}>{value}</button>)}</div><div className="mt-navigation"><button disabled={grid || filtered.length < 2} aria-label="Scroll to earlier memories" onClick={() => scroll(-1)}>←</button><span aria-label={`${filtered.length} memories`}>{filtered.length}</span><button disabled={grid || filtered.length < 2} aria-label="Scroll to later memories" onClick={() => scroll(1)}>→</button><button className="mt-layout-toggle" aria-pressed={grid} aria-label={grid ? 'Show curved timeline' : 'Show memory grid'} onClick={() => setGrid(value => !value)}>{grid ? '⌁' : '▦'}</button></div></footer>
      <p className="mt-hint">{grid ? 'Choose a moment to revisit its story.' : 'Drag the board to pan · Drag ⠿ to move a memory · Ctrl + scroll to zoom'}</p>
    </div>
  </section>
}
