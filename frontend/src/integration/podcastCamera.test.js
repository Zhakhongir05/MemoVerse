import test from 'node:test'
import assert from 'node:assert/strict'
import { podcastTarget } from './podcastCamera.js'
test('playback focuses only existing bounded anchors, never model camera coordinates',()=>{
 const anchors=[{id:'desk',position:[1,0,-2]}]
 assert.deepEqual(podcastTarget({anchor_id:'desk'},anchors),[1,0,-2])
 for(const cue of [null,{anchor_id:'unknown'},{camera:{target:[1,2,3]}}])assert.equal(podcastTarget(cue,anchors),null)
 for(const position of [[NaN,0,0],[true,0,0],[100,0,0]])assert.equal(podcastTarget({anchor_id:'desk'},[{id:'desk',position}]),null)
})
