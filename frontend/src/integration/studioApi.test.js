import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioGenerator } from './studioApi.js';
const scene={title:'Studio fixture',environment:'bedroom',mood:'nostalgic',objects:[{id:'desk-1',type:'desk',position:[0,0,0],scale:[1,1,1],memory:'A user-written memory.',audioUrl:null}]};
const file=new Blob(['synthetic'],{type:'image/png'});
test('teammate form sends only story/photo and preserves validated AI provenance',async()=>{
 let called=0;const generate=createStudioGenerator({fetchImpl:async(url,options)=>{
  called++;assert.equal(url,'/api/generate-scene');assert.deepEqual([...options.body.keys()],['story','photo']);
  assert.equal(options.body.get('story'),'An explicitly written memory.');assert.equal(options.headers,undefined);
  return Response.json({scene,source:'ai',fallback:false,reason:null});
 }});
 const result=await generate({file,audioFile:new Blob(['private audio']),description:'  An explicitly written memory.  '});
 assert.equal(called,1);assert.deepEqual(result.scene,scene);assert.equal(result.source,'ai');assert.equal(result.fallback,false);
});
test('studio adapter retains honest fallback and rejects incompatible mocked UI schema',async()=>{
 const fallback=await createStudioGenerator({fetchImpl:async()=>Response.json({scene,source:'mock',fallback:true,reason:'demo_mode'})})({file,description:'A memory'});
 assert.equal(fallback.fallback,true);
 await assert.rejects(createStudioGenerator({fetchImpl:async()=>Response.json({version:1,objects:[],source:'mock'})})({file,description:'A memory'}),/unsupported scene response/);
});
test('studio reports backend failures and honors cancellation',async()=>{
 const status=[];await assert.rejects(createStudioGenerator({fetchImpl:async()=>new Response('private upstream error',{status:502})})({file,description:'A memory',onStatus:s=>status.push(s)}),/unavailable/);
 assert.equal(status.at(-1).state,'error');assert.doesNotMatch(status.at(-1).message,/private/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(createStudioGenerator({fetchImpl:async(_,options)=>{options.signal.throwIfAborted();}})({file,description:'A memory',signal:controller.signal}),{name:'AbortError'});
});
