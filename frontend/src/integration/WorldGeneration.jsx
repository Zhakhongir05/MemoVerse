import {useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '../ui/supabaseClient.js';
import {worldFetch,pollWorld} from './worldJobs.js';
import {accountWorldClient} from './accountWorldClient.js';

export default function WorldGeneration({user,file,description,onReady,onExploreSample}){
 const [config,setConfig]=useState(null),[allowance,setAllowance]=useState(null),[busy,setBusy]=useState(false);
 const [consent,setConsent]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const controller=useRef(null),version=useRef(0);
 const userId=user?.id;
 const account=useMemo(()=>userId&&supabase?accountWorldClient(userId,supabase):null,[userId]);
 useEffect(()=>{
  const request=new AbortController();let active=true;version.current++;setAllowance(null);setError('');setMessage('');setConsent(false);setBusy(false);
  (async()=>{
   try{
    const settings=await worldFetch('/api/world-config',{signal:request.signal});if(active)setConfig(settings);
    if(account){const state=await account.read('/api/world-account',{signal:request.signal});if(active)setAllowance(state);}
   }catch(e){if(active&&e.name!=='AbortError')setError(e.message);}
  })();
  return()=>{active=false;request.abort();controller.current?.abort();};
 },[account]);
 useEffect(()=>{version.current++;controller.current?.abort();setBusy(false);setConsent(false);setError('');},[file,description]);
 async function refreshAllowance(request,current){
  const state=await account.read('/api/world-account',{signal:request.signal});
  if(current===version.current&&!request.signal.aborted)setAllowance(state);
 }
 async function run(existing=null){
  if(busy||!account||(!existing&&(!file||!description.trim()||!consent||!allowance?.remaining)))return;
  if(!existing && (file.size>4*1024*1024 || description.trim().length>2000)){setError('For 3D generation choose a photograph up to 4 MB and a story up to 2,000 characters.');return;}
  const current=version.current,request=new AbortController();controller.current=request;setBusy(true);setError('');
  try{
   let job;
   if(existing)job=await account.job(`/api/world-jobs/${existing.job_id}`,{signal:request.signal});
   else{
    const body=new FormData();body.append('photo',file,'memory-photo');body.append('story',description.trim());body.append('approved','true');
    setMessage('Uploading your photograph securely…');job=await account.job('/api/world-jobs',{body,signal:request.signal});
   }
   if(current!==version.current)return;
   await refreshAllowance(request,current);
   const world=await pollWorld(job,{signal:request.signal,request:account.job,onProgress:next=>{
    if(current===version.current)setMessage(next.message||'Creating your realistic world. This can take several minutes…');
   }});
   if(current===version.current)await onReady(world);
  }catch(e){if(e.name!=='AbortError'&&current===version.current)setError(e.message);}
  finally{
   if(current===version.current){
    setBusy(false);
    try{await refreshAllowance(request,current);}catch{/* Keep the last confirmed allowance; never pretend to refund a slot. */}
   }
  }
 }
 return <section className="mv-glass mv-world-generation" aria-label="Realistic world experience">
  <h3>Realistic 3D world</h3>
  <p className="mv-fine">Your account includes 3 free world-generation requests during the judging period. Completed worlds can be revisited without using another allowance. Paid upgrades are not available.</p>
  {!account?<p className="mv-fine">Sign in with your existing account to use your 3 free worlds.</p>:<>
   <p role="status">{allowance?`${allowance.remaining} of 3 worlds remaining`:'Checking your world allowance…'}</p>
   {allowance?.remaining===0&&<p className="mv-fine">You’ve used your 3 free worlds. You can revisit them any time.</p>}
   {config?.enabled?<>
    <label className="mv-world-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy||!allowance?.remaining}/> I agree to send this photograph and story to World Labs.</label>
    <button type="button" className="mv-primary" disabled={busy||!file||!description.trim()||!consent||!allowance?.remaining} onClick={()=>run()}>{busy?'Creating your world…':'Generate Realistic 3D World'}</button>
    <p className="mv-fine">New requests close {new Date(config.expires_at).toLocaleDateString()}. Submitted jobs reserve an allowance, including jobs that need billing review.</p>
   </>:<p className="mv-fine">New generation is currently unavailable. Your existing worlds remain accessible.</p>}
   {allowance?.jobs?.length>0&&<div aria-label="Your generated worlds">{allowance.jobs.map((job,index)=><div key={job.job_id}>
    {['succeeded','pending','submitting'].includes(job.status)?<button type="button" className="mv-save-button" disabled={busy} onClick={()=>run(job)}>{job.status==='succeeded'?`Open world ${index+1}`:`Resume world ${index+1}`}</button>:<p className="mv-fine">World {index+1}: {job.status}. Your reservation is retained for review.</p>}
   </div>)}</div>}
  </>}
  {busy&&<><progress aria-label="World generation progress"/><p role="status">{message}</p><button type="button" className="mv-save-button" onClick={()=>{controller.current?.abort();setBusy(false);setMessage('Progress checks paused. Resume your existing job without using another allowance.');}}>Pause progress checks</button></>}
  {!busy&&message&&<p role="status">{message}</p>}{error&&<p role="alert" className="mv-error">{error}</p>}
  <button type="button" className="mv-save-button" onClick={onExploreSample}>Explore sample world</button>
  <p className="mv-fine">The saved sample was generated from a different photograph. Exploring it never uses your allowance.</p>
 </section>;
}
