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
 await page.getByRole('button',{name:'Relive in 3D ✧',exact:true}).click();
 await expect.poll(()=>steps).toBe(3);expect(creates).toBe(1);
 await page.getByRole('button',{name:'Explore Freely ↗',exact:true}).click();
 await expect(page.locator('[data-world-state="ready"]')).toBeVisible();
 await expect(page.getByRole('toolbar',{name:'Memory world controls'}).getByRole('button')).toHaveCount(4);
 await expect(page.getByRole('region',{name:'Enhanced objects'})).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('minimal-3d.png')});
 await page.getByRole('button',{name:'Listen',exact:true}).click();
 const audio=page.locator('audio');await expect(audio).toHaveCount(1);
 await expect.poll(()=>audio.evaluate(a=>a.currentTime)).toBeGreaterThan(.1);
 await expect(page.getByText('Personal chapter 2 · 2/3')).toBeVisible();
 expect(creates).toBe(1);expect(steps).toBe(3);
 await page.reload();await expect(page.locator('[data-world-state="ready"]')).toBeVisible();
 await page.getByRole('button',{name:'Listen',exact:true}).click();await expect(page.getByText('Personal chapter 1 · 1/3')).toBeVisible();
 expect(creates).toBe(1);expect(steps).toBe(3);expect(errors).toEqual([]);
});
