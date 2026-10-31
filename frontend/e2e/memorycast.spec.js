import {test,expect} from '@playwright/test';
import {spz,collider,png} from './fixtures.js';
import {sessionFor,TEST_USERS} from '../../backend/tests/supabase_fixture.mjs';
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
test('one completed world prepares one saved podcast; headphones replay without generation',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let creates=0,steps=0,failedRead=false;
 await page.route('https://cdn.marble.worldlabs.ai/**',r=>r.fulfill({body:r.request().url().includes('.spz')?spz():r.request().url().includes('.glb')?collider():png,headers:{'Access-Control-Allow-Origin':'*'}}));
 await page.route('https://api.worldlabs.ai/**',()=>{throw Error('No paid generation');});
 await page.route('**/test-narration.wav',r=>r.fulfill({body:wav(),contentType:'audio/wav'}));
 const tour=()=>creates?({id:'11111111-1111-4111-8111-111111111111',status:steps===3?'ready':'pending',script:{version:4,chapters:[1,2,3].map(order=>({order,title:'Personal chapter '+order,narration:'The red chair stands beside the window.',anchor_id:null}))},audio:steps===3?[1,2,3].map(order=>({order,url:`http://127.0.0.1:${process.env.MEMOVERSE_TEST_FRONTEND_PORT||5206}/test-narration.wav`,duration_seconds:2})):[]}):null;
 await page.route('**/api/memorycast/**',r=>{
  const q=r.request();if(q.method()==='POST'&&q.url().includes('/memories/')){expect(q.postDataJSON().regenerate).toBe(false);creates++;return r.fulfill({status:202,json:{tour:tour(),fresh:true}});}
  if(q.method()==='POST'){steps++;return r.fulfill({json:{tour:tour(),advanced:true}});}
  if(creates===1&&steps===3&&!failedRead){failedRead=true;return r.fulfill({status:503,json:{detail:{code:'memorycast_storage_unavailable'}}});}
  return r.fulfill({json:{generation_enabled:true,stale:false,tour:tour()}});
 });
 await page.addInitScript(s=>localStorage.setItem('sb-127-auth-token',JSON.stringify(s)),sessionFor(TEST_USERS[0]));
 await page.goto('/');await page.getByRole('button',{name:'Explore Memories',exact:true}).click();await page.getByRole('button',{name:'＋ New Memory',exact:true}).click();
 await page.locator('#mj-title').fill('Podcast browser test');await page.locator('#mj-story').fill('I remember reading beside the red chair.');await page.locator('#mj-photos').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});
 await page.getByRole('button',{name:'Save journal entry ↗',exact:true}).click();expect(creates).toBe(0);
 await page.getByRole('button',{name:'Create world + podcast',exact:true}).click();
 await expect.poll(()=>steps).toBe(3);expect(creates).toBe(1);
 await expect(page.getByRole('region',{name:'Immersive memory exploration'})).toBeVisible();
 await expect(page.locator('[data-world-state="ready"]')).toBeVisible();
 await expect(page.getByRole('toolbar',{name:'Memory world controls'}).getByRole('button')).toHaveCount(4);
 await expect(page.getByRole('region',{name:'Enhanced objects'})).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('minimal-3d.png')});
 await page.getByRole('button',{name:'Listen',exact:true}).click();
 const audio=page.locator('audio');await expect(audio).toHaveCount(1);
 await expect.poll(()=>audio.evaluate(a=>a.currentTime)).toBeGreaterThan(.1);
 await expect(page.getByRole('heading',{name:'Personal chapter 2',exact:true})).toBeVisible();
 expect(creates).toBe(1);expect(steps).toBe(3);
 await page.reload();await expect(page.locator('[data-world-state="ready"]')).toBeVisible();
 await page.getByRole('button',{name:'Listen',exact:true}).click();await expect(page.getByRole('heading',{name:'Personal chapter 1',exact:true})).toBeVisible();
 expect(creates).toBe(1);expect(steps).toBe(3);expect(errors).toEqual([]);
});

test('one creation action prepares podcast, enters world automatically, headphones play and reload reuses it',async({page})=>{
 let creates=0, advances=0;
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.marble.worldlabs.ai/**',r=>r.fulfill({body:r.request().url().includes('.spz')?spz():r.request().url().includes('.glb')?collider():png,headers:{'Access-Control-Allow-Origin':'*'}}));
 await page.route('https://api.worldlabs.ai/**',()=>{throw Error('No paid generation')});
 await page.route('**/test-narration.wav',r=>r.fulfill({body:wav(),contentType:'audio/wav'}));
 const tour=()=>({id:'22222222-2222-4222-8222-222222222222',status:advances===3?'ready':'pending',script:{version:4,chapters:[1,2,3].map(order=>({order,title:'Saved chapter '+order,narration:'Your journal recalls reading beside the window.',anchor_id:null}))},audio:advances===3?[1,2,3].map(order=>({order,url:`http://127.0.0.1:${process.env.MEMOVERSE_TEST_FRONTEND_PORT||5206}/test-narration.wav`,duration_seconds:60})):[]});
 await page.route('**/api/memorycast/**',r=>{
  const q=r.request();
  if(q.method()==='POST'&&q.url().includes('/memories/')){creates++;expect(q.postDataJSON().regenerate).toBe(false);return r.fulfill({status:202,json:{tour:tour()}})}
  if(q.method()==='POST'){advances++;return r.fulfill({json:{tour:tour(),advanced:true}})}
  return r.fulfill({json:{generation_enabled:true,stale:false,tour:creates?tour():null}});
 });
 await page.addInitScript(s=>localStorage.setItem('sb-127-auth-token',JSON.stringify(s)),sessionFor(TEST_USERS[0]));
 await page.goto('/');await page.getByRole('button',{name:'Explore Memories',exact:true}).click();await page.getByRole('button',{name:'＋ New Memory',exact:true}).click();
 await page.locator('#mj-title').fill('One step memory');await page.locator('#mj-story').fill('I remember reading at the window.');await page.locator('#mj-photos').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});
 await page.getByRole('button',{name:'Create world + podcast',exact:true}).click();
 await expect(page.getByRole('region',{name:'Immersive memory exploration'})).toBeVisible({timeout:30000});
 await expect.poll(()=>advances).toBe(3);expect(creates).toBe(1);
 await expect(page.getByText('Memory journal ·',{exact:false})).toHaveCount(0);
 await page.getByRole('button',{name:'Listen',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Saved chapter 1'})).toBeVisible();
 await expect.poll(()=>page.locator('audio').evaluate(a=>a.currentTime)).toBeGreaterThan(.1);
 await page.getByRole('button',{name:'Next chapter',exact:true}).click();await expect(page.getByRole('heading',{name:'Saved chapter 2'})).toBeVisible();
 await page.reload();await expect(page.getByRole('region',{name:'Immersive memory exploration'})).toBeVisible();await page.getByRole('button',{name:'Listen',exact:true}).click();await expect(page.getByRole('heading',{name:'Saved chapter 1'})).toBeVisible();expect(creates).toBe(1);expect(advances).toBe(3);expect(errors).toEqual([]);
 await expect(page.locator('[data-world-state="ready"]')).toBeAttached({timeout:30000});await page.screenshot({path:'test-results/minimal-memory-player.png',animations:'disabled'});
 await page.setViewportSize({width:390,height:844});const player=page.locator('.im-listening');await expect(player).toBeVisible();expect((await player.boundingBox()).width).toBeLessThanOrEqual(390);await page.screenshot({path:'test-results/minimal-memory-mobile.png',animations:'disabled'});
 await page.getByRole('button',{name:'Listen',exact:true}).click();await page.getByRole('button',{name:'Back to memory',exact:true}).click();await page.getByRole('button',{name:'← Back to My Journal',exact:true}).click();await page.getByRole('button',{name:'Listen to memory',exact:true}).click();await expect(page.getByRole('heading',{name:'Saved chapter 1'})).toBeVisible();await expect.poll(()=>page.locator('audio').evaluate(a=>a.currentTime)).toBeGreaterThan(.1);expect(creates).toBe(1);
});

test('failed pre-audio job recovers automatically before headphones without a preparation button',async({page})=>{
 let creates=0,steps=0,targetId=null;
 const failed={id:'33333333-3333-4333-8333-333333333333',status:'failed',next_step:1,total_steps:5,script:null,audio:[]};
 const tour=()=>({id:'44444444-4444-4444-8444-444444444444',status:steps===3?'ready':'pending',script:{version:4,chapters:[1,2,3].map(order=>({order,title:'Recovered chapter '+order,narration:'Your memory of watching for birds by the window.',anchor_id:null}))},audio:steps===3?[1,2,3].map(order=>({order,url:`http://127.0.0.1:${process.env.MEMOVERSE_TEST_FRONTEND_PORT||5206}/test-narration.wav`,duration_seconds:60})):[]});
 await page.route('**/test-narration.wav',r=>r.fulfill({body:wav(),contentType:'audio/wav'}));
 await page.route('**/rest/v1/journal_entries*',r=>{if(r.request().method()==='POST'){const data=r.request().postDataJSON();targetId=(Array.isArray(data)?data[0]:data).id}return r.continue()});
 await page.route('**/api/memorycast/**',r=>{
  const q=r.request();
  if(q.url().includes('/memories/')&&!q.url().includes(targetId||'not-a-memory'))return r.fulfill({json:{generation_enabled:false,tour:null}});
  if(q.method()==='POST'&&q.url().includes('/memories/')){creates++;expect(q.postDataJSON().regenerate).toBe(false);return r.fulfill({status:202,json:{tour:tour()}})}
  if(q.method()==='POST'){steps++;return r.fulfill({json:{tour:tour(),advanced:true}})}
  return r.fulfill({json:{generation_enabled:true,stale:creates===0,tour:creates?tour():failed}});
 });
 await page.route('**/api/journal/*/world',()=>{throw Error('No world request needed to recover a journal podcast')});
 await page.addInitScript(s=>localStorage.setItem('sb-127-auth-token',JSON.stringify(s)),sessionFor(TEST_USERS[0]));
 await page.goto('/');await page.getByRole('button',{name:'Explore Memories',exact:true}).click();await page.getByRole('button',{name:'＋ New Memory',exact:true}).click();
 await page.locator('#mj-title').fill('Stopped podcast recovery');await page.locator('#mj-story').fill('I remember looking for birds by the window.');await page.locator('#mj-photos').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'Save journal entry ↗',exact:true}).click();
 await page.getByRole('button',{name:'← Back to My Journal',exact:true}).click();await page.getByRole('button',{name:'Listen to memory',exact:true}).click();
 await expect(page.getByRole('button',{name:/Prepare podcast|Create podcast|Generate updated/})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Recovered chapter 1'})).toBeVisible();await expect.poll(()=>page.locator('audio').evaluate(a=>a.currentTime)).toBeGreaterThan(.1);expect(creates).toBe(1);expect(steps).toBe(3);
});
