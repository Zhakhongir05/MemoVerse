import {savedWorldId,rememberWorld,clearWorldLocation} from './savedWorldLocation.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatMemoryDate, journeySteps, listEntries, localDate, markEntryDeleted, MOODS, saveEntry, validateEntry } from './journalStore'
import { importGuestEntries, syncJournal } from './journalCloud'
import './Dashboard.css'
import './Journal.css'
import MemoryTimeline from './MemoryTimeline'
import ImmersiveMemory from './ImmersiveMemory'
import SpeechInput from './SpeechInput.jsx'
import JournalHome from './JournalHome.jsx'
import RelivePreparation from './RelivePreparation'
import PhotoPlanInfo from './PhotoPlanInfo'
import WorldAllowance from '../integration/WorldAllowance.jsx'
import {preparePodcast} from '../integration/preparePodcast.js'
import {existingWorld} from '../integration/existingWorld.js'

function useMediaUrl(file) {
  const [value, setValue] = useState({ file: null, url: '' })
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setValue({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])
  return value.file === file ? value.url : ''
}

function Photo({ file, alt, ...props }) {
  const url = useMediaUrl(file)
  return url ? <img src={url} alt={alt} {...props} /> : null
}

const emptyDraft = () => ({ title: '', date: localDate(), story: '', mood: 'Nostalgic', photos: [], audio: null, scene: null, world: null })

/** WorldViewer is the team's existing World Labs component, when available.
 * JourneyController can synchronize AI narration/camera poses with activeStep.
 * The built-in guided reading never pretends to drive the 3D camera or AI audio.
 */
export default function Journal({ user, onSignIn, onSignOut, checkingAuth, SceneRenderer, WorldViewer, JourneyController, LegacyStudio, generateEnvironment, onPurchase }) {
  const owner = user?.id || 'local-device'
  const hasAccount = !!user
  const [view, setView] = useState('journal')
  const [generationRequest,setGenerationRequest]=useState(null)
  const [entries, setEntries] = useState([])
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [journeyMode, setJourneyMode] = useState('free')
  const [activeStep, setActiveStep] = useState(0)
  const [activePhoto, setActivePhoto] = useState(0)
  const [inputError, setInputError] = useState('')
  const [accountBusy, setAccountBusy] = useState(false)
  const [editorSavedToken, setEditorSavedToken] = useState(0)
  const [symbolic, setSymbolic] = useState(false)
  const [demo, setDemo] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const syncLock = useRef(false)
  const loadedOwner = useRef(null)
  const editing = useRef(false)
  const heading = useRef(null)
  const photoInput = useRef(null)
  const alive = useRef(false)
  const saveLock = useRef(false)
  const warmedPodcasts=useRef(new Set())
  const resumeWorld = useRef(savedWorldId())

  useEffect(()=>{
    if(!hasAccount || syncing || loading)return
    for(const entry of entries){
      const key=owner+':'+entry.id
      if(entry.syncState!=='synced'||!entry.photos.length||warmedPodcasts.current.has(key))continue
      warmedPodcasts.current.add(key)
      // Backfill existing reservations/worlds, never narrate every saved draft.
      void preparePodcast(entry.id,undefined,{existingOnly:!entry.world}).catch(()=>{})
    }
  },[entries,owner,hasAccount,syncing,loading])
  useEffect(()=>{
    if(!resumeWorld.current||!hasAccount||loading||syncing||loadedOwner.current!==owner)return
    const entry=entries.find(item=>item.id===resumeWorld.current)
    resumeWorld.current=null
    if(!entry){clearWorldLocation();return}
    setSelected(entry);setDemo(false);setSymbolic(false);setGenerationRequest(null)
    setView(entry.world?.source==='worldlabs'?'relive':'prepare')
  },[entries,hasAccount,loading,syncing,owner])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { editing.current = dirty }, [dirty])
  useEffect(() => {
    let active = true
    if (loadedOwner.current !== owner) setLoading(true)
    setError(''); setSyncError('')
    syncLock.current = true
    if (hasAccount) setSyncing(true)
    async function load() {
      try {
        const local = await listEntries(owner)
        if (active) { loadedOwner.current = owner; setEntries(local); setLoading(false) }
        if (hasAccount) {
          try {
            const result = await syncJournal(owner)
            if (active) {
              setEntries(result.entries)
              setSelected(current => current ? result.entries.find(entry => entry.id === current.id) || current : null)
              setSyncError(result.failures.join(' · '))
            }
          } catch (err) { if (active) setSyncError(err.message || 'Cloud sync failed. Your local entries are safe; retry when connected.') }
        }
      } catch (err) { if (active) setError(err.message || 'Your journal could not be opened. Please retry.') }
      finally { if (active) { setLoading(false); setSyncing(false); syncLock.current = false } }
    }
    load()
    return () => { active = false }
  }, [owner, refresh, hasAccount])
  useEffect(() => {
    if (!hasAccount) return
    const autoSync = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || editing.current || saveLock.current || syncLock.current) return
      // Lock immediately to coalesce focus/visibility/online events in one tick.
      syncLock.current = true
      setRefresh(value => value + 1)
    }
    const timer = window.setInterval(autoSync, 30000)
    window.addEventListener('online', autoSync)
    window.addEventListener('focus', autoSync)
    document.addEventListener('visibilitychange', autoSync)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', autoSync)
      window.removeEventListener('focus', autoSync)
      document.removeEventListener('visibilitychange', autoSync)
    }
  }, [hasAccount])
  useEffect(() => { heading.current?.focus() }, [view, selected?.id])
  useEffect(() => {
    if (!dirty && !saving) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, saving])

  const steps = useMemo(() => selected ? journeySteps(selected) : [], [selected])

  function canLeave() {
    return !saving && (!dirty || window.confirm('Leave without saving your changes?'))
  }
  function navigate(next) {
    if (!canLeave()) return
    clearWorldLocation()
    setDirty(false); setError(''); setInputError(''); setView(next)
  }
  function createMemory() {
    if (!canLeave()) return
    clearWorldLocation()
    setDraft(emptyDraft()); setDirty(false); setFieldErrors({}); setError(''); setInputError(''); setNotice(''); setView('create')
  }
  function openMemory(entry) {
    if (!canLeave()) return
    clearWorldLocation()
    setSelected(entry); setActivePhoto(0); setDirty(false); setView('detail'); setError('')
  }
  function change(key, value) {
    setDraft(previous => ({ ...previous, [key]: value })); setDirty(true)
    setFieldErrors(previous => ({ ...previous, [key]: '' }))
  }
  function choosePhotos(files, replaceIndex = null) {
    const incoming = Array.from(files || [])
    if (!incoming.length) return
    if (incoming.length !== 1) { setInputError('Choose one photo at a time for your memory.'); return }
    if (replaceIndex === null && draft.photos.length) { setInputError('Replace the current source photo before adding another.'); return }
    const photos = replaceIndex === null ? [...draft.photos, ...incoming] : draft.photos.map((file, index) => index === replaceIndex ? incoming[0] : file)
    const validation = validateEntry({ ...draft, photos })
    if (validation.photos) { setInputError(validation.photos); return }
    setInputError(''); change('photos', photos)
  }
  async function submit(event) {
    event.preventDefault()
    const createWorld = event.nativeEvent.submitter?.value === 'create-world'
    if (saveLock.current || syncLock.current) return
    const errors = validateEntry(draft)
    setFieldErrors(errors); setError('')
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => document.getElementById(`mj-${Object.keys(errors)[0]}`)?.focus())
      return
    }
    saveLock.current = true; setSaving(true)
    try {
      let saved = await saveEntry(owner, { ...draft, syncState: user ? 'pending' : 'local' })
      if (user) {
        setSyncing(true); setSyncError('')
        try {
          const result = await syncJournal(owner)
          saved = result.entries.find(entry => entry.id === saved.id) || saved
          if (alive.current) setSyncError(result.failures.join(' · '))
        } catch (syncFailure) {
          if (alive.current) setSyncError(syncFailure.message || 'Cloud sync failed. Your memory is saved on this device.')
        } finally { if (alive.current) setSyncing(false) }
      }
      if (!alive.current) return
      setEntries(rows => [saved, ...rows.filter(entry => entry.id !== saved.id)].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)))
      setSelected(saved); setActivePhoto(0); setDirty(false); if(createWorld && saved.syncState==='synced'){setDemo(false);rememberWorld(saved.id);setGenerationRequest(crypto.randomUUID());setView('prepare')} else if (view === 'relive') setEditorSavedToken(value => value + 1); else setView('detail'); setNotice(saved.syncState === 'synced' ? 'Your memory has been saved.' : user ? 'Saved on this device. Cloud sync is pending; use Retry sync.' : 'Saved on this device. Sign in to sync to Supabase.')
    } catch (err) {
      if (alive.current) setError(err.name === 'QuotaExceededError' ? 'Your browser storage is full. Use smaller photos, then save again. Your draft is still here.' : err.message || 'Could not save. Your draft is still here; please try again.')
    } finally { saveLock.current = false; if (alive.current) setSaving(false) }
  }
  async function deleteMemory() {
    if (!selected || saving || syncing || saveLock.current || syncLock.current) return
    if (!window.confirm('Delete “' + selected.title + '” from your journal? This will also remove it from your other devices after syncing.')) return
    saveLock.current = true; setSaving(true); setError('')
    try {
      await markEntryDeleted(owner, selected)
      setEntries(rows => rows.filter(entry => entry.id !== selected.id))
      setSelected(null); setDirty(false); setView('journal')
      setNotice(user ? 'Memory removed. Syncing the deletion…' : 'Memory removed from your journal.')
      if (user) {
        setSyncing(true)
        try {
          const result = await syncJournal(owner)
          if (alive.current) { setEntries(result.entries); setSyncError(result.failures.join(' · ')); setNotice(result.failures.length ? 'Memory removed here. Deletion will retry syncing.' : 'Memory deleted from your journal.') }
        } catch (err) { if (alive.current) { setSyncError(err.message || 'Deletion sync failed. It will retry automatically.'); setNotice('Memory removed here. Deletion will retry syncing.') } }
      }
    } catch (err) { if (alive.current) setError(err.message || 'Could not delete this memory. Please retry.') }
    finally { saveLock.current = false; if (alive.current) { setSaving(false); setSyncing(false) } }
  }
  function renderMemoryForm() {
    return (<form onSubmit={submit} noValidate><fieldset disabled={saving || syncing} className="mj-editor-fields"><legend className="mj-sr-only">Memory journal entry</legend>
        <div className="mj-editor-main mj-glass"><label htmlFor="mj-title">Memory title <span>Required</span></label><input id="mj-title" value={draft.title} maxLength={100} onChange={event => change('title', event.target.value)} placeholder="The afternoon that felt like forever" aria-invalid={!!fieldErrors.title} aria-describedby="mj-title-error" /><p id="mj-title-error" className="mj-field-error" role="alert">{fieldErrors.title}</p>
          <div className="mj-editor-date"><label htmlFor="mj-date">When was it?</label><input id="mj-date" type="date" value={draft.date} onChange={event => change('date', event.target.value)} aria-invalid={!!fieldErrors.date} aria-describedby="mj-date-error" /><p id="mj-date-error" className="mj-field-error" role="alert">{fieldErrors.date}</p></div>
          <label htmlFor="mj-story">The story behind it</label><textarea id="mj-story" rows={9} maxLength={12000} value={draft.story} onChange={event => change('story', event.target.value)} placeholder="I still remember the light through the window…" aria-invalid={!!fieldErrors.story} aria-describedby="mj-story-error mj-story-help" /><SpeechInput value={draft.story} onChange={text => change('story',text)} disabled={saving || syncing} /><div id="mj-story-help" className="mj-form-hint">Start with what you can still feel. <span>{draft.story.length}/12000</span></div><p id="mj-story-error" className="mj-field-error" role="alert">{fieldErrors.story}</p>
          <fieldset className="mj-moods" id="mj-mood"><legend>How does it feel?</legend>{MOODS.map(mood => <label key={mood} className={draft.mood === mood ? 'mj-chosen' : ''}><input type="radio" name="journal-mood" checked={draft.mood === mood} onChange={() => change('mood', mood)} /><span>{mood}</span></label>)}</fieldset>
        </div>
        <div className="mj-editor-side"><div className="mj-glass mj-photo-panel"><h2>Bring it into focus</h2><p>Choose one JPG, PNG, or WebP photo · Up to 10 MB.</p><PhotoPlanInfo user={user} /><button className="mj-add-photos" type="button" onClick={() => photoInput.current?.click()}>{draft.photos.length ? 'Replace source photo' : '＋ Add source photo'}</button><input id="mj-photos" ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { choosePhotos(event.target.files, draft.photos.length ? 0 : null); event.target.value = '' }} aria-label="Choose one source photograph" aria-describedby="mj-photo-error" />
          <div className="mj-photo-edit-grid">{draft.photos.map((file, index) => <div key={`${index}-${file.name}`}><Photo file={file} alt={`Memory photograph ${index + 1}`} /><div><label className="mj-file-replace">Replace<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Replace photograph ${index + 1}`} onChange={event => { choosePhotos(event.target.files, index); event.target.value = '' }} /></label><button type="button" aria-label={`Remove photograph ${index + 1}`} onClick={() => { setInputError(''); change('photos', draft.photos.filter((_, photoIndex) => index !== photoIndex)) }}>Remove</button></div></div>)}</div>
          <p id="mj-photo-error" className="mj-field-error" role="alert">{inputError || fieldErrors.photos}</p></div>
          <div className="mj-save-area">{!draft.id && user && draft.photos.length>0 && <><button className="mj-primary" type="submit" value="create-world">{saving ? 'Preparing…' : 'Create world + podcast'}</button><p>Uses 1 of your 3 world allowances. AI narration included.</p></>}<button className="mj-secondary" type="submit">{saving ? 'Saving your memory…' : 'Save journal entry ↗'}</button><p>Keep this moment. Come back whenever you like.</p></div>
        </div>
      </fieldset></form>)
  }
  function beginReliveEdit(add) {
    setDraft(add || demo ? { ...emptyDraft(), scene: selected.scene, world: selected.world } : { ...selected })
    setDirty(false); setFieldErrors({}); setInputError(''); setError('')
  }
  function cancelReliveEdit() {
    if (!canLeave()) return false
    setDirty(false); return true
  }
  function relive(mode, useSymbolic = false) { if(useSymbolic)clearWorldLocation();else rememberWorld(selected?.id);setSymbolic(useSymbolic); setJourneyMode(mode); setActiveStep(0); setView('relive'); setNotice('') }

  if (view === 'studio' && LegacyStudio) return <><div className="mj-legacy-bar"><button onClick={() => setView(selected ? 'detail' : 'journal')}>← Back to journal memory</button><span>Original studio · Its older cloud saves remain separate from journal entries.</span></div><LegacyStudio user={user} onSignIn={onSignIn} onSignOut={onSignOut} checkingAuth={checkingAuth} initialScreen="upload" SceneRenderer={SceneRenderer} /></>

  return <main className={`mj-app ${view === 'relive' ? 'mj-immersive' : ''} ${view === 'journal' ? 'mj-journal-home' : ''}`}>
    <header className="mj-header"><button className="mj-logo" onClick={() => navigate('journal')} aria-label="MemoVerse journal home"><span>◈</span> MemoVerse<span>.</span></button>
      <nav aria-label="Journal navigation"><button aria-current={view === 'journal' ? 'page' : undefined} onClick={() => navigate('journal')}>My Journal</button><button aria-current={view === 'timeline' ? 'page' : undefined} onClick={() => navigate('timeline')}>Timeline</button><button aria-current={view === 'creations' ? 'page' : undefined} onClick={() => navigate('creations')}>Saved Worlds</button></nav>
      <div className="mj-account">{user ? <><span>{user.email}</span><button disabled={accountBusy || saving || syncing} onClick={async () => {
        if (!canLeave()) return
        setAccountBusy(true)
        try { await onSignOut() } catch { setError('Could not sign out. Please try again.'); setAccountBusy(false) }
      }}>Sign out</button></> : <button disabled={checkingAuth || saving} onClick={() => { if (canLeave()) onSignIn?.() }}>Sign in</button>}</div>
    </header>
    {error && <div className="mj-error-banner" role="alert">{error}{['journal', 'timeline', 'creations'].includes(view) ? <button onClick={() => setRefresh(value => value + 1)}>Retry loading</button> : null}</div>}
    {notice && <p className="mj-notice" role="status">{notice}</p>}
    {user && (syncing || syncError || entries.some(entry => entry.syncState !== 'synced')) && <div className="mj-sync-banner" role="status">{syncing ? 'Syncing your private journal…' : syncError ? 'Cloud sync needs attention.' : entries.some(entry => entry.syncState !== 'synced') ? 'Some entries are waiting to sync.' : 'Your journal is synced to your account.'}{syncError && <><p role="alert">{syncError}</p><button disabled={syncing || saving} onClick={() => setRefresh(value => value + 1)}>Retry sync</button></>}</div>}

    {['journal','timeline','creations'].includes(view) && <WorldAllowance user={user} />}
    {view === 'timeline' && <MemoryTimeline owner={owner} entries={entries} loading={loading} onOpen={openMemory} onNew={createMemory} Photo={Photo} SceneRenderer={SceneRenderer} />}

    {view === 'creations' && <section className="mj-collection">
      <div className="mj-page-heading"><div><p className="mj-eyebrow">YOUR MEMORIES, MADE INTO WORLDS</p><h1 ref={heading} tabIndex={-1}>Saved <em>Worlds.</em></h1><p>A place for the worlds you’ve created. Return whenever you like.</p></div><button className="mj-primary" onClick={() => navigate('journal')}>Choose a memory ↗</button></div>
      {loading ? <p className="mj-loading" role="status">Opening your creations…</p> : entries.some(entry => entry.world && typeof entry.world === 'object' && Object.keys(entry.world).length && !['mock','sample'].includes(entry.world.source)) ? <div className="mj-card-grid">{entries.filter(entry => entry.world && typeof entry.world === 'object' && Object.keys(entry.world).length && !['mock','sample'].includes(entry.world.source)).map(entry => <MemoryCard key={entry.id} entry={entry} onOpen={memory => { if (!canLeave()) return; setSelected(memory); setActivePhoto(0); setDemo(false); setDirty(false); setView('prepare') }} />)}</div> : <div className="mj-empty"><div className="mj-empty-portal" aria-hidden="true">✧</div><h2>Your first world is waiting.</h2><p>Open a journal entry and select Relive My Memory.<br />Generated worlds will be saved here automatically.</p><button className="mj-primary" onClick={() => navigate('journal')}>Go to My Journal ↗</button></div>}
    </section>}

    {view === 'journal' && <JournalHome headingRef={heading} entries={entries} loading={loading} Photo={Photo} onOpen={openMemory} onNew={createMemory}
      onExplore={(memory) => {
        if (!canLeave()) return
        if (!user) { onSignIn?.(); return }
        setSelected(memory); setDemo(false); rememberWorld(memory.id)
        setGenerationRequest(crypto.randomUUID()); setView('prepare')
      }}
      onDemo={() => { setSelected({ ...emptyDraft(), id: 'symbolic-demo', title: 'A room to remember', story: 'Warm light falls across a familiar room. Take a moment to look around.', date: localDate() }); setDemo(true); relive('free', true) }}
      guestImport={user && <button className="mj-back" disabled={syncing || saving} onClick={async () => {
        if (!canLeave() || saveLock.current || syncLock.current) return
        saveLock.current = true; setSaving(true)
        try { const count = await importGuestEntries(owner); setNotice(count ? count + ' guest memories imported. Syncing to your account…' : 'No new guest memories to import.'); setRefresh(value => value + 1) }
        catch (err) { setError(err.message || 'Guest import failed. Please retry.') }
        finally { saveLock.current = false; setSaving(false) }
      }}>Import this browser’s guest memories into my account ↗</button>} />}

    {view === 'create' && <section className="mj-editor"><button className="mj-back" disabled={saving} onClick={() => navigate(selected && draft.id ? 'detail' : 'journal')}>← Back to {draft.id ? 'memory' : 'journal'}</button><div className="mj-page-heading"><div><p className="mj-eyebrow">MAKE ROOM FOR A MOMENT</p><h1 ref={heading} tabIndex={-1}>{draft.id ? 'Keep the' : 'A new'} <em>{draft.id ? 'details.' : 'memory.'}</em></h1><p>Save the story now. Step inside it whenever you’re ready.</p></div></div>
      {renderMemoryForm()}
    </section>}

    {view === 'detail' && selected && <section className="mj-detail"><button className="mj-back-to-journal" onClick={() => navigate('journal')}>← Back to My Journal</button><div className="mj-detail-layout"><article><p className="mj-eyebrow">{formatMemoryDate(selected.date)} <span className={`mj-mood mj-${selected.mood.toLowerCase()}`}>{selected.mood}</span></p><h1 ref={heading} tabIndex={-1}>{selected.title}</h1><p className="mj-detail-story">{selected.story || 'Some moments live in photographs. This one is yours to remember.'}</p><button className="mj-back" onClick={() => { setDraft({ ...selected }); setDirty(false); setFieldErrors({}); setInputError(''); setView('create') }}>Edit this memory ↗</button><button className="mj-delete-memory" disabled={saving || syncing} onClick={deleteMemory}>{saving ? 'Deleting…' : 'Delete memory'}</button></article>
        <div className="mj-detail-media">{selected.photos.length ? <><Photo file={selected.photos[activePhoto]} alt={`${selected.title}, photograph ${activePhoto + 1}`} className="mj-detail-cover" /><div className="mj-thumbnails">{selected.photos.map((photo, index) => <button key={index} aria-label={`View photograph ${index + 1}`} aria-pressed={activePhoto === index} onClick={() => setActivePhoto(index)}><Photo file={photo} alt="" /></button>)}</div></> : <div className="mj-detail-no-photo" aria-hidden="true">◈<span>A moment held in words</span></div>}
          <div className="mj-relive-card mj-glass"><p className="mj-eyebrow">DON’T JUST REMEMBER IT</p><h2>Return to the feeling.</h2><p>{selected.world ? 'Reopen your saved world without using another generation.' : 'Your photograph becomes a 3D world; your story becomes its podcast. Uses 1 world allowance.'}</p><button className="mj-primary" onClick={() => {
            setDemo(false)
            // Always resolve the authoritative journal binding and fresh private assets first.
            if(!user){onSignIn?.();return}
            rememberWorld(selected.id);setGenerationRequest(crypto.randomUUID());setView('prepare')
          }}>{selected.world?.source==='worldlabs' ? 'Enter Memory World ✧' : 'Create world + podcast'}</button></div>
        </div></div></section>}

    {view === 'prepare' && selected && <RelivePreparation generationRequest={generationRequest} key={selected.id} onSample={() => { setSelected(current => ({...current,world:{...existingWorld,source:'sample'}})); setDemo(true); relive('free') }} user={user} Photo={Photo} memory={selected} generateEnvironment={generateEnvironment} hasWorldViewer={!!WorldViewer} onBack={() => {clearWorldLocation();setView('detail')}} onEdit={() => { setDraft({ ...selected }); setDirty(false); setView('create') }} onExplore={relive} onGenerated={async result => {
      let saved = await saveEntry(owner, { ...selected, world: { ...result.world, ...(result.tour ? { guidedTour: result.tour } : {}), ...(typeof result.story === 'string' ? { preparedStory: result.story } : {}) }, story: selected.story, scene: result.scene || selected.scene, syncState: user ? 'pending' : 'local' })
      if (user) { try { const synced = await syncJournal(owner); saved = synced.entries.find(entry => entry.id === saved.id) || saved; setSyncError(synced.failures.join(' · ')) } catch (err) { setSyncError(err.message) } }
      if (alive.current) { setSelected(saved); setEntries(rows => [saved, ...rows.filter(entry => entry.id !== saved.id)]) }
    }} />}
    {view === 'relive' && selected && <ImmersiveMemory symbolic={symbolic} demo={demo} memory={selected} SceneRenderer={SceneRenderer} WorldViewer={WorldViewer} JourneyController={JourneyController} steps={steps} activeStep={activeStep} onStepChange={setActiveStep} initialMode={journeyMode} editor={renderMemoryForm()} onBeginEdit={beginReliveEdit} onCancelEdit={cancelReliveEdit} onExit={() => { if (cancelReliveEdit()) {clearWorldLocation();setView(demo ? 'journal' : 'detail')} }}  Photo={Photo} savedToken={editorSavedToken} error={error} syncError={syncError} saving={saving} />}

  </main>
}

function MemoryCard({ entry, onOpen, compact = false }) {
  return <button className={`mj-memory-card ${compact ? 'mj-compact' : ''}`} onClick={() => onOpen(entry)} aria-label={`Open ${entry.title}, ${formatMemoryDate(entry.date)}`}>
    <div className={`mj-card-photo mj-${entry.mood.toLowerCase()}`}>{entry.photos[0] ? <Photo file={entry.photos[0]} alt="" loading="lazy" /> : <span className="mj-card-symbol" aria-hidden="true">{'✧'}</span>}<span className="mj-card-photo-count">{entry.photos.length ? `${entry.photos.length} photo${entry.photos.length > 1 ? 's' : ''}` : 'A story to keep'}</span></div>
    <div className="mj-card-copy"><div><time dateTime={entry.date}>{formatMemoryDate(entry.date, { month: 'short', day: 'numeric', year: 'numeric' })}</time><span className={`mj-mood mj-${entry.mood.toLowerCase()}`}>{entry.mood}</span></div><h2>{entry.title}</h2><p>{entry.story || 'A moment waiting to be revisited.'}</p><span className="mj-card-link">Revisit this moment ↗ <small>{entry.syncState === 'synced' ? ' · Synced' : entry.syncState === 'pending' ? ' · Sync pending' : ' · Local'}</small></span></div>
  </button>
}
