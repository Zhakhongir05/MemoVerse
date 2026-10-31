import test from 'node:test'
import assert from 'node:assert/strict'
import { preparePodcast } from './preparePodcast.js'

test('world and player share one podcast creation and reuse ready recordings', async () => {
  let creates=0, advances=0
  const request=async(path,options={})=>{
    if(options.method==='POST' && path.startsWith('/memories/')) {
      creates++;assert.equal(options.body.regenerate,false)
      return {tour:{id:'tour',status:'pending'}}
    }
    if(options.method==='POST') {advances++;return {advanced:true,tour:{id:'tour',status:advances===3?'ready':'pending'}}}
    return {generation_enabled:true,tour:advances===3?{id:'tour',status:'ready'}:null}
  }
  const first=preparePodcast('one',request), second=preparePodcast('one',request)
  assert.equal(first,second)
  await first
  await preparePodcast('one',request)
  assert.equal(creates,1);assert.equal(advances,3)
})
test('failed, uncertain and disabled jobs never automatically retry paid steps',async()=>{
  for(const status of ['failed','uncertain','ready',null]) {
    let writes=0
    await preparePodcast('blocked',async(_path,options={})=>{
      if(options.method==='POST')writes++
      return {generation_enabled:false,tour:status?{status}:null}
    })
    assert.equal(writes,0)
  }
})
test('a failed read never becomes a creation request',async()=>{
  let calls=0
  await assert.rejects(preparePodcast('read-error',async()=>{calls++;throw Error('Storage unavailable')}),/Storage unavailable/)
  assert.equal(calls,1)
})

test('failed reservation is recovered once without requesting regeneration',async()=>{
 let writes=0, advances=0
 const result=await preparePodcast('failed-reservation',async(path,options={})=>{
  if(options.method==='POST'&&path.startsWith('/memories/')){writes++;assert.equal(options.body.regenerate,false);return {tour:{id:'same-reservation',status:'pending'}}}
  if(options.method==='POST'){advances++;return {tour:{id:'same-reservation',status:'ready'},advanced:true}}
  return {generation_enabled:true,tour:{id:'same-reservation',status:advances?'ready':'failed'}}
 })
 assert.equal(writes,1);assert.equal(advances,1);assert.equal(result.tour.id,'same-reservation')
})
test('drafts without a world or reservation are never narrated by backfill',async()=>{
 let writes=0
 await preparePodcast('draft',async(_path,options={})=>{if(options.method==='POST')writes++;return {generation_enabled:true,tour:null}}, {existingOnly:true})
 assert.equal(writes,0)
})

test('explicit podcast action retries its reservation without any world request',async()=>{
 const calls=[];let ready=false
 const result=await preparePodcast('manual-podcast',async(path,options={})=>{
  calls.push({path,options})
  if(path.endsWith('/advance')){ready=true;return {advanced:true,tour:{id:'saved-tour',status:'ready'}}}
  if(options.method==='POST')return {tour:{id:'saved-tour',status:'pending'}}
  return {generation_enabled:true,tour:{id:'saved-tour',status:ready?'ready':'failed'}}
 },{retryFailed:true})
 assert.equal(result.tour.status,'ready')
 assert.equal(calls.find(call=>call.options.body)?.options.body.retry_failed,true)
 assert.ok(calls.every(call=>!call.path.includes('world')))
 assert.equal(calls.find(call=>call.options.body).options.body.regenerate,false)
})

test('explicit update replaces a ready recording with a new reservation',async()=>{
 let created=false
 const calls=[]
 const result=await preparePodcast('stale-podcast',async(path,options={})=>{
  calls.push({path,options})
  if(path.endsWith('/advance'))return {advanced:true,tour:{id:'new-tour',status:'ready'}}
  if(options.method==='POST'){created=true;return {tour:{id:'new-tour',status:'pending'}}}
  return {generation_enabled:true,tour:{id:created?'new-tour':'old-tour',status:created?'ready':'ready'}}
 },{regenerate:true})
 assert.equal(result.tour.id,'new-tour')
 assert.equal(calls.find(call=>call.options.body).options.body.regenerate,true)
})
