import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateScene } from './generateScene.js';
import { parseSceneResponse, sceneStatus } from './sceneResponse.js';
const types = ['desk', 'bed', 'chair', 'window', 'bookshelf', 'lamp', 'photo-frame'];
const fixture = () => ({scene:{title:'Test room',environment:'bedroom',mood:'nostalgic',objects:types.map((type,i)=>({id:`object-${i}`,type,position:[i,0,-2],scale:[1,1.5,.5],memory:'An explicitly written memory.',audioUrl:null}))},source:'mock',fallback:true,reason:'demo_mode'});
const photo = new Blob(['synthetic-test'], {type:'image/png'});

test('unwraps scene envelope, preserves all seven asset types and transform vectors',()=>{
 const input=fixture(), result=parseSceneResponse(input);
 assert.deepEqual(result,input);assert.notEqual(result,input);
 result.scene.objects[0].position[0]=9;
 assert.equal(input.scene.objects[0].position[0],0);
});
test('all backend moods supported by the boundary; renderer mappings are not invented',()=>{
 for(const mood of ['nostalgic','joyful','melancholic']) assert.equal(parseSceneResponse({...fixture(),scene:{...fixture().scene,mood}}).scene.mood,mood);
});
test('rejects missing scene, unknown asset, unsafe transforms, duplicate IDs, extra keys and unsafe audio',()=>{
 const mutations=[p=>delete p.scene,p=>p.scene.objects[0].type='mesh',p=>p.scene.objects[0].position=[NaN,0,0],p=>p.scene.objects[0].position=[11,0,0],p=>p.scene.objects[0].scale=[0,1,1],p=>p.scene.objects[0].scale=[1,1],p=>p.scene.objects[1].id=p.scene.objects[0].id,p=>p.scene.objects[0].audioUrl='https://example.com/unsafe',p=>p.scene.objects=[],p=>p.scene.environment='forest',p=>p.scene.objects[0].unexpected=true,p=>p.scene.objects.push({...p.scene.objects[0],id:'eighth'})];
 for(const mutate of mutations){const p=fixture();mutate(p);assert.throws(()=>parseSceneResponse(p));}
});
test('provenance is required and inconsistent fallback labels rejected',()=>{
 for(const p of [{...fixture(),source:'ai'},{...fixture(),fallback:false},{...fixture(),reason:null},{...fixture(),source:undefined}]) assert.throws(()=>parseSceneResponse(p));
 const ai={...fixture(),source:'ai',fallback:false,reason:null};assert.match(sceneStatus(parseSceneResponse(ai)),/AI-generated/);
 assert.match(sceneStatus(fixture()),/not generated from your upload/);
});
test('sends correct FormData, unwraps result.scene and reports loading then honest fallback',async()=>{
 const states=[];
 const result=await generateScene({story:'  A quiet memory  ',photo,baseUrl:'http://127.0.0.1:8000/',onStatus:s=>states.push(s),fetchImpl:async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:8000/api/generate-scene');assert.equal(options.method,'POST');assert.ok(options.body instanceof FormData);
  assert.equal(options.body.get('story'),'A quiet memory');assert.ok(options.body.get('photo') instanceof Blob);assert.equal(options.headers,undefined);assert.ok(options.signal);
  return Response.json(fixture());
 }});
 assert.deepEqual(result.scene,fixture().scene);assert.deepEqual(states.map(s=>s.state),['loading','ready']);assert.equal(states[1].fallback,true);
});
test('HTTP errors are clear, do not expose raw bodies and leave existing scene ownership with caller',async()=>{
 for(const status of [413,422,502]){
  const states=[];
  await assert.rejects(generateScene({story:'A memory',photo,onStatus:s=>states.push(s),fetchImpl:async()=>new Response('private provider text',{status})}));
  assert.equal(states.at(-1).state,'error');assert.doesNotMatch(states.at(-1).message,/private provider text/);
 }
});
test('invalid frontend input is rejected before network traffic',async()=>{
 for(const values of [{story:''},{story:'x'.repeat(2001)},{photo:new Blob(['x'],{type:'image/gif'})},{photo:new Blob([new Uint8Array(5*1024*1024+1)],{type:'image/png'})}]){
  await assert.rejects(generateScene({story:'A memory',photo,...values,fetchImpl:()=>{assert.fail('must not fetch');}}));
 }
});
test('invalid JSON/schema never enters ready state; aborted request is reported',async()=>{
 for(const fetchImpl of [async()=>Response.json({scene:{}}),async()=>{throw new DOMException('cancelled','AbortError');}]){
  const states=[];await assert.rejects(generateScene({story:'A memory',photo,onStatus:s=>states.push(s),fetchImpl}));
  assert.deepEqual(states.map(s=>s.state),['loading','error']);
 }
});
// Generated in a temporary directory by the integration check, never committed.
if(process.env.MEMOVERSE_RESPONSE_FIXTURE) test('actual FastAPI response satisfies frontend boundary',()=>{
 const payload=JSON.parse(readFileSync(process.env.MEMOVERSE_RESPONSE_FIXTURE,'utf8'));
 assert.deepEqual(parseSceneResponse(payload),payload);
});

test('same-origin API requests use the Vite proxy without exposing provider credentials',async()=>{
 await generateScene({story:'A memory',photo,baseUrl:'',fetchImpl:async(url,options)=>{
  assert.equal(url,'/api/generate-scene');assert.equal(options.headers,undefined);
  assert.deepEqual([...options.body.keys()],['story','photo']);
  return Response.json({...fixture(),source:'ai',fallback:false,reason:null});
 }});
});
