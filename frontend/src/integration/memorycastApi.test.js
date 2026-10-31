import test from 'node:test'
import assert from 'node:assert/strict'
import { memorycastRequest } from './memorycastApi.js'
const id='11111111-1111-4111-8111-111111111111'
const client={auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}}
test('podcast replay reads only; generation sends text context identity, never an audio file',async()=>{
 const calls=[];const fetchImpl=async(url,options)=>{calls.push({url,...options});return {ok:true,json:async()=>({tour:null})}}
 await memorycastRequest('/memories/'+id,{client,fetchImpl})
 await memorycastRequest('/memories/'+id,{client,fetchImpl,method:'POST',body:{approved:true,language:'en'}})
 assert.equal(calls[0].method,'GET');assert.equal(calls[0].body,undefined)
 assert.deepEqual(JSON.parse(calls[1].body),{approved:true,language:'en'})
 assert.equal(calls[1].headers['Content-Type'],'application/json')
})
test('disabled narration is an explicit error and does not substitute uploaded/sample audio',async()=>{
 await assert.rejects(memorycastRequest('/memories/'+id,{client,fetchImpl:async()=>({ok:false,status:503})}),/not enabled/)
 await assert.rejects(memorycastRequest('/memories/'+id,{client:null}),/Sign in/)
})
