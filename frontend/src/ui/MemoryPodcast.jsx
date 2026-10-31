import { useEffect, useRef, useState } from 'react'
import { memorycastRequest } from '../integration/memorycastApi.js'
export default function MemoryPodcast({ memory, user, onPlaybackChange }) {
  const [result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[chapter,setChapter]=useState(0),[reload,setReload]=useState(0)
  const controller=useRef(null)
  const userId=user?.id
  useEffect(()=>{
    const request=new AbortController();controller.current=request;setResult(null);setError('');setChapter(0)
    if(userId && /^[a-f0-9-]{36}$/i.test(memory.id)) memorycastRequest('/memories/'+memory.id,{signal:request.signal}).then(setResult).catch(error=>{if(!request.signal.aborted)setError(error.message)})
    return()=>request.abort()
  },[memory.id,memory.updatedAt,userId,reload])
  useEffect(()=>()=>onPlaybackChange?.(null),[onPlaybackChange])
  async function create(regenerate=false){
    if(busy)return
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
    finally{setBusy(false)}
  }
  const tour=result?.tour, ready=tour?.status==='ready',part=tour?.script?.chapters?.[chapter]
  return <section className="mj-glass mj-podcast" aria-label="AI memory podcast"><h2>Listen to your memory</h2><p>Your saved journal entry becomes a three-chapter AI-narrated podcast. No audio upload or voice recording is required.</p>
    {error&&<><p role="alert">{error}</p><button type="button" disabled={busy} onClick={()=>setReload(n=>n+1)}>Retry loading podcast</button></>}
    {!error && result && !result.generation_enabled && !ready && <p role="status">{result.generation_reason==='memorycast_database_disabled' ? 'Podcast creation is disabled in the database. The owner must enable MemoryCast.' : result.generation_reason==='memorycast_providers_unconfigured' ? 'Podcast providers are not configured on the server.' : 'Podcast creation is disabled on the server. The owner must configure MEMORYCAST_LIVE_ENABLED.'}</p>}
    {tour?.message&&<p role="status">{tour.message}</p>}
    {ready&&part?<><p>AI-generated narration · Chapter {chapter+1} of 3</p><h3>{part.title}</h3><p>{part.narration}</p><audio onPlay={()=>onPlaybackChange?.(part)} onPause={()=>onPlaybackChange?.(null)} onEnded={()=>{onPlaybackChange?.(null);if(chapter<2)setChapter(n=>n+1)}} onError={()=>setError('Narration could not play. Retry loading to refresh the private audio link.')} key={chapter+':'+tour.id} controls preload="none" src={tour.audio?.[chapter]?.url}/><button type="button" disabled={chapter===0} onClick={()=>{onPlaybackChange?.(null);setChapter(n=>n-1)}}>Previous chapter</button><button type="button" disabled={chapter===2} onClick={()=>{onPlaybackChange?.(null);setChapter(n=>n+1)}}>Next chapter</button>{result.stale&&<><p>This saved podcast uses an older entry or narration style. Replay is free of new generation calls.</p><button type="button" disabled={busy || !result.generation_enabled} onClick={()=>create(true)}>{busy?'Creating personalized narration…':'Generate updated personalized podcast'}</button><p>Generating an updated version uses AI providers and your narration allowance.</p></>}</>:
      <button type="button" disabled={busy || !user || !result?.generation_enabled || ['uncertain','failed'].includes(tour?.status)} onClick={()=>create()}>{busy?'Creating your podcast…':tour?.status==='pending'?'Continue podcast creation':'Create podcast from saved entry'}</button>}
    {!ready&&<p>The creation button sends the saved entry to AI providers for narration. Dictation only fills in your editable text.</p>}
  </section>
}
