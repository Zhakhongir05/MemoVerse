import test from 'node:test'
import assert from 'node:assert/strict'
import { appendDictation, createDictation } from './dictation.js'
test('dictation appends bounded editable text without audio files',()=>{
 assert.equal(appendDictation('I remember','the sunlight'), 'I remember the sunlight')
 assert.equal(appendDictation('1234','abc',6),'1234 a')
 assert.equal(appendDictation('kept','  '),'kept')
})
test('recognition starts only on demand and emits final text, not audio',()=>{
 class Recognition {start(){this.started=true}}
 const text=[],states=[]
 const r=createDictation({Recognition,onTranscript:x=>text.push(x),onState:x=>states.push(x),onError:()=>{}})
 assert.equal(r.started,undefined)
 const results=[Object.assign([{transcript:'hello'}],{isFinal:true}),Object.assign([{transcript:'partial'}],{isFinal:false})]
 r.onresult({resultIndex:0,results}); assert.deepEqual(text,['hello'])
 r.onend();assert.deepEqual(states,[false]);assert.equal(createDictation({}),null)
})
