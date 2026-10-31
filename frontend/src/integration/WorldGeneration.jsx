import {useEffect, useRef, useState} from 'react';
import {worldRequest, pollWorld} from './worldJobs.js';

export default function WorldGeneration({file, description, onReady}) {
 const [token,setToken]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const controller=useRef(null),version=useRef(0);
 useEffect(()=>{version.current++;controller.current?.abort();setBusy(false);setMessage('');setError('');return ()=>controller.current?.abort();},[file,description]);
 async function start(){
  if(busy||!file||!description.trim()||!token)return;
  const current=version.current;const request=new AbortController();controller.current=request;setBusy(true);setError('');
  try{
   const bytes=new Uint8Array(await file.arrayBuffer());
   const suffix=new TextEncoder().encode(description.trim());const input=new Uint8Array(bytes.length+suffix.length);input.set(bytes);input.set(suffix,bytes.length);
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',input)),n=>n.toString(16).padStart(2,'0')).join('');
   if(current!==version.current)return;
   const storageKey='memoverse-world-job:'+digest;
   let saved;try{saved=localStorage.getItem(storageKey);}catch{/* Server cache still deduplicates. */}
   let job;
   if(saved) job=await worldRequest(`/api/world-jobs/${saved}`,{token,signal:request.signal});
   else{
    if(!window.confirm('Generate a new realistic 3D world? This uploads your photograph and story to World Labs and uses paid generation credits.'))return;
    const body=new FormData();body.append('photo',file,'memory-photo');body.append('story',description.trim());body.append('approved','true');
    setMessage('Submitting your photograph to World Labs…');
    job=await worldRequest('/api/world-jobs',{token,body,signal:request.signal});
    try{localStorage.setItem(storageKey,job.job_id);}catch{/* Server job remains durable. */}
   }
   const world=await pollWorld(job,{token,signal:request.signal,onProgress:j=>setMessage(j.status==='succeeded'?'Your newly generated world is ready.':`World Labs: ${j.status}. This can take several minutes…`)});
   if(current===version.current)onReady(world);
  }catch(e){if(e.name!=='AbortError'&&current===version.current)setError(e.message);}
  finally{if(current===version.current)setBusy(false);}
 }
 return <section className="mv-glass mv-world-generation" aria-label="Realistic world generation">
  <h3>Realistic 3D world</h3><p className="mv-fine">A separate World Labs generation from your photograph. Uses paid credits when enabled. Repeated requests reuse the existing job.</p>
  <label>Generation access code<input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} disabled={busy}/></label>
  <button type="button" className="mv-primary" disabled={busy||!file||!description.trim()||!token} onClick={start}>{busy?'Generating world…':'Generate Realistic 3D World'}</button>
  {busy&&<button type="button" onClick={()=>{controller.current?.abort();setBusy(false);setMessage('Polling paused. The provider job continues; use the action again to resume.');}}>Pause progress checks</button>}
  <p role="status">{message}</p>{error&&<p role="alert" className="mv-error">{error}</p>}
 </section>;
}
