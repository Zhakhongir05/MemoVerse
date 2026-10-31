const terminal = new Set(['failed', 'expired', 'unknown']);
export async function worldFetch(path, {signal, body, method, accessToken, fetchImpl=fetch}={}) {
 if (!path.startsWith('/api/world-')) throw new Error('Invalid world API path.');
 if(path!=='/api/world-config'&&!accessToken)throw new Error('Sign in with your existing account to create or open your worlds.');
 const response=await fetchImpl(path,{method:method||(body?'POST':'GET'),credentials:'omit',headers:accessToken?{Authorization:`Bearer ${accessToken}`}:{},body,signal});
 if(!response.ok){
  let detail;try{detail=(await response.json()).detail;}catch{/* Never display an upstream HTML response. */}
  const messages={401:'Your sign-in session expired. Please sign in again.',403:'This generation request is not allowed.',410:'The judging demo has ended. You can still explore existing worlds.',413:'Choose a smaller photograph.',422:'Check your photograph and story.',429:'The demo allowance or request limit has been reached. Please try later.',503:'World generation is disabled or not configured. Explore the sample instead.',502:'World Labs could not be reached. Resume your existing job later.'};
  throw new Error(typeof detail==='string'&&detail.length<=240?detail:(messages[response.status]||'World generation request failed.'));
 }
 return response.json();
}
export async function worldRequest(path,options={}) {
 const job=await worldFetch(path,options);
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(job.job_id)||!['pending','submitting','succeeded',...terminal].includes(job.status))throw new Error('Invalid world job response.');
 if(job.status==='succeeded'&&(!job.world?.id||!['splatUrl','fullResUrl','colliderUrl',...['thumbnailUrl','panoramaUrl'].filter(k=>job.world[k]!=null)].every(k=>{
  try{const u=new URL(job.world[k]);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='worldlabs.ai'||u.hostname.endsWith('.worldlabs.ai'));}catch{return false;}
 })))throw new Error('World result is missing valid assets.');
 return job;
}
export async function pollWorld(job,{signal,onProgress=()=>{},request=worldRequest,delay=ms=>new Promise((resolve,reject)=>{
 const timer=setTimeout(done,ms);
 function done(){signal?.removeEventListener('abort',abort);resolve();}
 function abort(){clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('Cancelled','AbortError'));}
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
}),timeoutMs=15*60*1000}={}){
 const started=Date.now();
 while(true){
  signal?.throwIfAborted();onProgress(job);
  if(job.status==='succeeded')return job.world;
  if(terminal.has(job.status))throw new Error(job.status==='unknown'?'Submission needs project-owner review. It will not be repeated automatically.':`World generation ${job.status}. No automatic charged retry.`);
  if(Date.now()-started>=timeoutMs)throw new Error('Polling paused after 15 minutes. Resume this job later without generating again.');
  await delay(5000);signal?.throwIfAborted();job=await request(`/api/world-jobs/${job.job_id}`,{signal});
 }
}
