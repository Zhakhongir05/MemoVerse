import test from 'node:test';
import assert from 'node:assert/strict';
import {worldRequest,pollWorld} from './worldJobs.js';
const id='a'.repeat(64);
const world={id:'new-world',splatUrl:'https://cdn.marble.worldlabs.ai/new.spz',fullResUrl:'https://cdn.marble.worldlabs.ai/full.spz',colliderUrl:'https://cdn.marble.worldlabs.ai/new.glb'};
test('world API sends credentials only to own backend and polls without another POST',async()=>{
 const body=new FormData();body.append('approved','true');
 let count=0;
 const job=await worldRequest('/api/world-jobs',{token:'access-code',body,fetchImpl:async(path,options)=>{
  assert.equal(path,'/api/world-jobs');assert.equal(options.method,'POST');assert.equal(options.headers.Authorization,'Bearer access-code');return {ok:true,json:async()=>({job_id:id,status:'pending'})};
 }});
 const statuses=[];
 const result=await pollWorld(job,{token:'access-code',delay:async()=>{},onProgress:j=>statuses.push(j.status),request:async(path,options)=>{
  assert.equal(path,`/api/world-jobs/${id}`);assert.equal(options.body,undefined);count++;return {job_id:id,status:'succeeded',world};
 }});
 assert.deepEqual(result,world);assert.equal(count,1);assert.deepEqual(statuses,['pending','succeeded']);
});
test('failed expired uncertain jobs and timeouts never submit again',async()=>{
 for(const status of ['failed','expired','unknown','submitting'])await assert.rejects(()=>pollWorld({job_id:id,status},{request:()=>assert.fail('no automatic retry')}));
 await assert.rejects(()=>pollWorld({job_id:id,status:'pending'},{timeoutMs:0}),/Resume/);
});
test('world API reports safe failures and rejects malicious assets',async()=>{
 await assert.rejects(()=>worldRequest('/api/world-jobs',{token:'x',fetchImpl:async()=>({ok:false,status:503})}),/disabled or not configured/);
 await assert.rejects(()=>worldRequest('/api/world-jobs',{token:'x',fetchImpl:async()=>({ok:true,json:async()=>({job_id:id,status:'succeeded',world:{...world,splatUrl:'https://evil.test/x'}})})}),/valid assets/);
});
test('completed generated preview survives backend polling and asset validation',async()=>{
 const generated={...world,thumbnailUrl:'https://cdn.marble.worldlabs.ai/generated.jpg',panoramaUrl:'https://cdn.marble.worldlabs.ai/pano.jpg'};
 const job=await worldRequest('/api/world-jobs/'+id,{token:'x',fetchImpl:async()=>({ok:true,json:async()=>({job_id:id,status:'succeeded',world:generated})})});
 const result=await pollWorld(job,{token:'x'});
 assert.equal(result.thumbnailUrl,generated.thumbnailUrl);
 assert.equal(result.panoramaUrl,generated.panoramaUrl);
 await assert.rejects(()=>worldRequest('/api/world-jobs/'+id,{token:'x',fetchImpl:async()=>({ok:true,json:async()=>({...job,world:{...generated,thumbnailUrl:'https://evil.test/photo.jpg'}})})}),/valid assets/);
});
