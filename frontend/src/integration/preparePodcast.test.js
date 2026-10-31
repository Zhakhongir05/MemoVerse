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
