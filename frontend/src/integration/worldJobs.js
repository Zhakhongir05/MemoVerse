const terminal = new Set(['failed', 'expired', 'unknown', 'submitting']);
export async function worldRequest(path, { token, signal, body, fetchImpl = fetch }) {
 const response = await fetchImpl(path, {method: body ? 'POST' : 'GET', headers: {Authorization: `Bearer ${token}`}, body, signal});
 if (!response.ok) {
  const messages = {403:'A valid generation access code is required.', 413:'Choose a smaller photograph.', 422:'Check your photograph and story.', 429:'The project’s world generation budget has been reached.', 503:'World generation is disabled or not configured. Contact the project owner.', 410:'This world job has expired.', 502:'World Labs could not be reached. Resume this job later; do not generate another.'};
  throw new Error(messages[response.status] || 'World generation request failed.');
 }
 const job = await response.json();
 if (!/^[a-f0-9]{64}$/.test(job.job_id) || !['pending','succeeded',...terminal].includes(job.status)) throw new Error('Invalid world job response.');
 if (job.status === 'succeeded' && (!job.world?.id || !['splatUrl','fullResUrl','colliderUrl',...['thumbnailUrl','panoramaUrl'].filter(k=>job.world[k]!=null)].every(k => {
  try {const u=new URL(job.world[k]);return u.protocol==='https:' && !u.username && !u.password && (u.hostname==='worldlabs.ai'||u.hostname.endsWith('.worldlabs.ai'));} catch {return false;}
 }))) throw new Error('World result is missing valid assets.');
 return job;
}
export async function pollWorld(job, {token, signal, onProgress = () => {}, request = worldRequest, delay = ms => new Promise((resolve,reject)=>{
 const timer=setTimeout(done,ms);
 function done(){signal?.removeEventListener('abort',abort);resolve();}
 function abort(){clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new DOMException('Cancelled','AbortError'));}
 if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
}), timeoutMs = 15 * 60 * 1000}) {
 const started = Date.now();
 while (true) {
  onProgress(job);
  if (job.status === 'succeeded') return job.world;
  if (terminal.has(job.status)) throw new Error(job.status === 'submitting' ? 'Submission is still being recorded. Resume this job shortly.' : job.status === 'unknown' ? 'Submission needs owner review. It will not be repeated automatically.' : `World generation ${job.status}. No automatic charged retry.`);
  if (Date.now()-started>=timeoutMs) throw new Error('Polling paused after 15 minutes. Resume this job later without generating again.');
  await delay(5000);
  signal?.throwIfAborted();
  job = await request(`/api/world-jobs/${job.job_id}`, {token, signal});
 }
}
