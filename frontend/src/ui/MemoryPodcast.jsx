import { useEffect, useRef, useState } from 'react'
import { pendingPodcast, watchPodcast, preparePodcast, watchPodcastPreparation } from '../integration/preparePodcast.js'
import { memorycastRequest } from '../integration/memorycastApi.js'
export default function MemoryPodcast({ memory, user, onPlaybackChange, autoPlay = false, compact = false, allowCreate = false, syncBusy = false }) {
  const [result,setResult]=useState(null),[error,setError]=useState(''),[chapter,setChapter]=useState(0),[reload,setReload]=useState(0)
  const audio=useRef(null)
  const played=useRef(false)
  const [playBlocked,setPlayBlocked]=useState(false)
  const latest=useRef(null)
  useEffect(()=>{latest.current=result},[result])
  const userId=user?.id
  const [creating,setCreating]=useState(false),[resume,setResume]=useState(false)
  async function create() {
    if(creating || syncBusy || memory.syncState!=='synced')return
    setCreating(true);setError('')
    try { setResult(await preparePodcast(memory.id,undefined,{retryFailed:true}));setResume(true) }
    catch(error){setError(error.message)}
    finally{setCreating(false)}
  }
  useEffect(()=>{
    if(resume && result?.tour?.status==='pending')return watchPodcastPreparation(userId,memory.id)
  },[resume,result?.tour?.status,userId,memory.id])
  useEffect(()=>{
    const request=new AbortController();setResult(null);setError('');setChapter(0);played.current=false
    if(userId && /^[a-f0-9-]{36}$/i.test(memory.id)) memorycastRequest('/memories/'+memory.id,{signal:request.signal}).then(setResult).catch(error=>{if(!request.signal.aborted)setError(error.message)})
    pendingPodcast(memory.id)?.then(value=>{
      if(!request.signal.aborted){setResult(value);setError('')}
    }).catch(error=>{if(!request.signal.aborted)setError(error.message)})
    const unsubscribe=watchPodcast(memory.id,(value,failure)=>{
      if(request.signal.aborted)return
      if(failure)setError(failure.message)
      else{setResult(value);setError('')}
    })
    // Loading a player only reads saved state; it never starts a paid job.
    const timer=setInterval(()=>{
      if(!pendingPodcast(memory.id) && latest.current?.tour?.status!=='pending')return
      memorycastRequest('/memories/'+memory.id,{signal:request.signal}).then(value=>{
        if(!request.signal.aborted){setResult(value);setError('')}
      }).catch(()=>{})
    },5000)
    return()=>{request.abort();clearInterval(timer);unsubscribe()}
  },[memory.id,userId,reload])
  useEffect(()=>()=>onPlaybackChange?.(null),[onPlaybackChange])
  const tour=result?.tour, ready=!error && tour?.status==='ready' && tour.audio?.length===3,part=tour?.script?.chapters?.[chapter]
  useEffect(()=>{
    if(!autoPlay){audio.current?.pause();played.current=false;return}
    if(!ready || played.current || !audio.current)return
    played.current=true
    audio.current.play().catch(()=>setPlayBlocked(true))
  },[autoPlay,ready,chapter])
  return <section className={`mj-podcast ${compact ? 'mj-podcast-compact' : 'mj-glass'}`} aria-label="Saved memory podcast"><h2 className="mj-sr-only">Your memory, narrated</h2>
    {error&&<><p role="alert">{error}</p><button type="button" onClick={()=>setReload(n=>n+1)}>Retry loading podcast</button></>}
    {!error && result && !result.generation_enabled && !ready && <p role="status">{result.generation_reason==='memorycast_database_disabled' ? 'Podcast preparation is temporarily unavailable. You can still explore your world.' : result.generation_reason==='memorycast_providers_unconfigured' ? 'Podcast preparation is temporarily unavailable. You can still explore your world.' : 'Podcast preparation is temporarily unavailable. You can still explore your world.'}</p>}
    {!error&&!ready&&tour?.status==='pending'&&<p role="status">Preparing your podcast… You can explore while it finishes.</p>}
    {!error&&['failed','uncertain'].includes(tour?.status)&&<p role="status">Your included podcast needs recovery. Your journal is safe; no extra world generation is needed.</p>}
    {allowCreate && userId && result && !ready && (!tour || tour.status==='failed') && <button className="mj-secondary" disabled={creating || syncBusy || memory.syncState!=='synced' || !result.generation_enabled} onClick={create}>{creating ? 'Preparing podcast…' : syncBusy || memory.syncState!=='synced' ? 'Syncing memory…' : tour ? 'Retry podcast' : 'Create podcast'}</button>}
    {!allowCreate&&!error&&result&&!tour&&<p role="status">Create your podcast from the saved memory page.</p>}
    {ready&&part&&<>
      {!compact && <><p className="mj-podcast-count">{chapter+1}/3</p><h3>{part.title}</h3><details className="mj-podcast-transcript"><summary>Transcript</summary><p>{part.narration}</p></details></>}
      <audio ref={audio} aria-label="Memory podcast audio" onPlay={()=>{setPlayBlocked(false);onPlaybackChange?.(part)}} onPause={()=>onPlaybackChange?.(null)} onEnded={()=>{onPlaybackChange?.(null);if(chapter<2){played.current=false;setChapter(n=>n+1)}}} onError={()=>setError('Narration could not play. Retry loading to refresh the private audio link.')} key={chapter+':'+tour.id} controls={!compact} hidden={compact} preload="none" src={tour.audio?.[chapter]?.url}/>
      {playBlocked&&<p role="status">{compact ? "Tap headphones again to retry playback." : "Press play to listen."}</p>}
      {!compact && <><button type="button" disabled={chapter===0} onClick={()=>{onPlaybackChange?.(null);played.current=false;setChapter(n=>n-1)}} aria-label="Previous chapter" title="Previous chapter">←</button>
      <button type="button" disabled={chapter===2} onClick={()=>{onPlaybackChange?.(null);played.current=false;setChapter(n=>n+1)}} aria-label="Next chapter" title="Next chapter">→</button></>}
    </>}

  </section>
}
