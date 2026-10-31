import test from 'node:test'
import assert from 'node:assert/strict'
import { journalWorldRequest, waitForJournalWorld } from './journalWorldApi.js'
const id='11111111-1111-4111-8111-111111111111'
const client={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-session'}}})}}
test('read is GET, explicit generation is one JSON POST with authenticated session',async()=>{
 const calls=[];const fetchImpl=async(url,opts)=>{calls.push({url,...opts});return {ok:true,json:async()=>({status:'pending'})}}
 await journalWorldRequest(id,{client,fetchImpl})
 await journalWorldRequest(id,{client,fetchImpl,method:'POST',body:{approved:true,photoIndex:0}})
 assert.equal(calls[0].method,'GET');assert.equal(calls[0].body,undefined)
 assert.equal(calls[1].method,'POST');assert.equal(calls[1].headers.Authorization,'Bearer synthetic-session')
 assert.deepEqual(JSON.parse(calls[1].body),{approved:true,photoIndex:0})
})
test('polling and refreshed clients only read the same job, never submit',async()=>{
 const values=[{status:'pending',job_id:'one'},{status:'succeeded',job_id:'one'}];let count=0
 const request=async(_id,opts)=>{assert.equal(opts.method,undefined);return values[Math.min(count++,1)]}
 assert.equal((await waitForJournalWorld(id,{request,sleep:async()=>{}})).job_id,'one')
 assert.equal((await waitForJournalWorld(id,{request})).status,'succeeded');assert.equal(count,3)
})
test('auth, missing-entry, and failed job outcomes are explicit',async()=>{
 await assert.rejects(journalWorldRequest(id,{client:null}),/Sign in/)
 await assert.rejects(journalWorldRequest(id,{client,fetchImpl:async()=>({ok:false,status:404})}),/Sync this memory/)
 const failed=await waitForJournalWorld(id,{request:async()=>({status:'unknown'})});assert.equal(failed.status,'unknown')
})
