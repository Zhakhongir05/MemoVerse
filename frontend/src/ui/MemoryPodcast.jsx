import { useEffect, useRef, useState } from 'react'
import { isLegacyPodcast } from '../integration/podcastVersion.js'
import { pendingPodcast } from '../integration/preparePodcast.js'
import { memorycastRequest } from '../integration/memorycastApi.js'
export default function MemoryPodcast({ memory, user, onPlaybackChange, autoPlay = false }) {
  const [result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[chapter,setChapter]=useState(0),[reload,setReload]=useState(0)
  const audio=useRef(null)
  const played=useRef(false)
  const [playBlocked,setPlayBlocked]=useState(false)
  const operation=useRef(false)
  const controller=useRef(null)
  const latest=useRef(null)
  useEffect(()=>{latest.current=result},[result])
  const userId=user?.id
  useEffect(()=>{
    const request=new AbortController();controller.current=request;setResult(null);setError('');setChapter(0);played.current=false
    if(userId && /^[a-f0-9-]{36}$/i.test(memory.id)) memorycastRequest('/memories/'+memory.id,{signal:request.signal}).then(setResult).catch(error=>{if(!request.signal.aborted)setError(error.message)})
    pendingPodcast(memory.id)?.then(value=>{
      if(!request.signal.aborted){setResult(value);setError('')}
    }).catch(error=>{if(!request.signal.aborted)setError(error.message)})
    // Loading a player only reads saved state; it never starts a paid job.
    const timer=setInterval(()=>{
      if(operation.current || latest.current?.tour?.status!=='pending')return
      memorycastRequest('/memories/'+memory.id,{signal:request.signal}).then(value=>{
        if(!request.signal.aborted){setResult(value);setError('')}
      }).catch(()=>{})
    },5000)
    return()=>{request.abort();clearInterval(timer)}
  },[memory.id,userId,reload])
  useEffect(()=>()=>onPlaybackChange?.(null),[onPlaybackChange])
  async function create(regenerate=false){
    if(operation.current)return
    operation.current=true
    onPlaybackChange?.(null);setChapter(0)
    setBusy(true);setError('')
    try{
      const signal=controller.current.signal
      let {tour}=await memorycastRequest('/memories/'+memory.id,{method:'POST',body:{approved:true,language:'en',regenerate},signal})
      setResult(current=>({...current,tour}))
      // Each server step is leased and persisted. Replaying uses GET only.
      for(let step=0;step<11 && tour.status==='pending';step++){
        const next=await memorycastRequest('/tours/'+tour.id+'/advance',{method:'POST',signal})
        tour=next.tour;setResult(current=>({...current,tour}))
        if(!next.advanced)break
      }
      setResult(await memorycastRequest('/memories/'+memory.id,{signal}))
    }catch(error){if(error.name!=='AbortError')setError(error.message)}
    finally{operation.current=false;setBusy(false)}
  }
  const tour=result?.tour, ready=!error && tour?.status==='ready' && tour.audio?.length===3,part=tour?.script?.chapters?.[chapter]
  useEffect(()=>{
    if(!autoPlay || !ready || played.current || !audio.current)return
    played.current=true
    audio.current.play().catch(()=>setPlayBlocked(true))
  },[autoPlay,ready,chapter])
  const legacy=isLegacyPodcast(tour?.script)
  const outdated=ready && (result.stale || legacy)
  return <section className="mj-glass mj-podcast" aria-label="AI memory podcast"><h2 className="mj-sr-only">Your memory, narrated</h2>
    {error&&<><p role="alert">{error}</p><button type="button" disabled={busy} onClick={()=>setReload(n=>n+1)}>Retry loading podcast</button></>}
    {!error && result && !result.generation_enabled && !ready && <p role="status">{result.generation_reason==='memorycast_database_disabled' ? 'Podcast preparation is temporarily unavailable. You can still explore your world.' : result.generation_reason==='memorycast_providers_unconfigured' ? 'Podcast preparation is temporarily unavailable. You can still explore your world.' : 'Podcast preparation is temporarily unavailable. You can still explore your world.'}</p>}
    {!error&&!ready&&tour?.status==='pending'&&<p role="status">Preparing your podcast… You can explore while it finishes.</p>}
    {!error&&tour?.status==='failed'&&<div role="status"><p>{result.stale ? 'An earlier podcast attempt stopped before it finished.' : 'This podcast attempt could not finish. Its saved work is retained.'}</p>{result.stale&&<><button type="button" disabled={busy||!result.generation_enabled} onClick={()=>create(true)}>{busy?'Preparing your podcast…':'Create podcast'}</button><p className="mj-form-hint">One new narration attempt using your current entry and photo. Your 3D world stays unchanged.</p></>}{!result.stale&&<p>Please contact support to resume this saved attempt safely.</p>}</div>}
    {!error&&tour?.status==='uncertain'&&<p role="status">The last narration request was interrupted. It needs review before retrying so you are not charged twice. Your journal is safe.</p>}
    {outdated&&!error&&<details className="mj-podcast-options"><summary>Update recording</summary>
      <p>{legacy?'This recording uses an older narration style. You can play it below or optionally create an updated podcast.':'Your entry or narration style has changed. You can create an updated personal podcast.'}</p>
      <button type="button" disabled={busy || !result.generation_enabled} onClick={()=>create(true)}>{busy?'Creating personalized narration…':'Generate updated personalized podcast'}</button>
      <p>Uses your saved photograph and journal entry. This generates new AI narration and uses your narration allowance.</p>
    </details>}
    {ready&&part&&<>
      <p>{legacy?'Previous recording':'AI-generated narration'} · Chapter {chapter+1} of 3</p><h3>{part.title}</h3><details className="mj-podcast-transcript"><summary>Transcript</summary><p>{part.narration}</p></details>
      <audio ref={audio} aria-label="Memory podcast audio" onPlay={()=>{setPlayBlocked(false);onPlaybackChange?.(part)}} onPause={()=>onPlaybackChange?.(null)} onEnded={()=>{onPlaybackChange?.(null);if(chapter<2){played.current=false;setChapter(n=>n+1)}}} onError={()=>setError('Narration could not play. Retry loading to refresh the private audio link.')} key={chapter+':'+tour.id} controls preload="none" src={tour.audio?.[chapter]?.url}/>
      {playBlocked&&<p role="status">Press play to listen.</p>}
      <button type="button" disabled={chapter===0} onClick={()=>{onPlaybackChange?.(null);played.current=false;setChapter(n=>n-1)}} aria-label="Previous chapter" title="Previous chapter">←</button>
      <button type="button" disabled={chapter===2} onClick={()=>{onPlaybackChange?.(null);played.current=false;setChapter(n=>n+1)}} aria-label="Next chapter" title="Next chapter">→</button>
    </>}
    {!error&&!ready&&!outdated&&!['ready','pending','failed','uncertain'].includes(tour?.status)&&<button type="button" disabled={busy || !user || !result?.generation_enabled || ['uncertain','failed'].includes(tour?.status)} onClick={()=>create()}>{busy?'Creating your podcast…':tour?.status==='pending'?'Continue podcast creation':'Prepare podcast'}</button>}

  </section>
}
