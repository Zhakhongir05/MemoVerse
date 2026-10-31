import {test,expect} from '@playwright/test';
import {spz,collider,png} from './fixtures.js';
import {sessionFor,TEST_USERS} from '../../backend/tests/supabase_fixture.mjs';
function wav(){const b=Buffer.alloc(32044);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(32000,40);return b;}
test('update old podcast, play saved audio and reopen without generation',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let creates=0,steps=0;
 await page.route('https://cdn.marble.worldlabs.ai/**',r=>r.fulfill({body:r.request().url().includes('.spz')?spz():r.request().url().includes('.glb')?collider():png,headers:{'Access-Control-Allow-Origin':'*'}}));
 await page.route('https://api.worldlabs.ai/**',()=>{throw Error('No paid generation');});
 await page.route('**/test-narration.wav',r=>r.fulfill({body:wav(),contentType:'audio/wav'}));
 const tour=()=>({id:'11111111-1111-4111-8111-111111111111',status:steps===3?'ready':'pending',message:steps===3?'Narration saved.':'Preparing narration.',script:{chapters:[1,2,3].map(order=>({order,title:'Personal chapter '+order,narration:'The red chair stands beside the window. Your entry recalls reading there.',anchor_id:null}))},audio:[1,2,3].map(order=>({order,url:'http://127.0.0.1:5206/test-narration.wav',duration_seconds:2}))});
 await page.route('**/api/memorycast/**',r=>{
  const q=r.request();if(q.method()==='POST'&&q.url().includes('/memories/')){expect(q.postDataJSON().regenerate).toBe(true);creates++;return r.fulfill({status:202,json:{tour:tour(),fresh:true}});}
  if(q.method()==='POST'){steps++;return r.fulfill({json:{tour:tour(),advanced:true}});}
  const saved=tour();saved.status='ready';return r.fulfill({json:{generation_enabled:true,stale:creates===0,tour:saved}});
 });
 await page.addInitScript(s=>localStorage.setItem('sb-127-auth-token',JSON.stringify(s)),sessionFor(TEST_USERS[0]));
 await page.goto('/');await page.getByRole('button',{name:'Explore Memories',exact:true}).click();await page.getByRole('button',{name:'＋ New Memory',exact:true}).click();
 await page.locator('#mj-title').fill('Podcast browser test');await page.locator('#mj-story').fill('I remember reading beside the red chair.');await page.locator('#mj-photos').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});
 await page.getByRole('button',{name:'Save journal entry ↗',exact:true}).click();await page.getByRole('button',{name:'Relive in 3D ✧',exact:true}).click();await page.getByRole('button',{name:'Explore Freely ↗',exact:true}).click();
 await expect(page.getByText(/Loaded 4 splats and collider/)).toBeVisible();await page.getByRole('button',{name:'Guided tour',exact:true}).click();await page.getByRole('button',{name:'Generate updated personalized podcast',exact:true}).click();
 await expect(page.getByText('Narration saved.',{exact:true})).toBeVisible();expect(creates).toBe(1);expect(steps).toBe(3);
 const audio=page.locator('audio');await audio.evaluate(a=>a.play());await expect.poll(()=>audio.evaluate(a=>a.currentTime)).toBeGreaterThan(.1);
 await page.getByRole('button',{name:'Next chapter',exact:true}).click();await expect(page.getByRole('heading',{name:'Personal chapter 2'})).toBeVisible();
 await page.reload();await expect(page.getByText(/Loaded 4 splats and collider/)).toBeVisible();await page.getByRole('button',{name:'Guided tour',exact:true}).click();await expect(page.getByRole('heading',{name:'Personal chapter 1'})).toBeVisible();expect(creates).toBe(1);expect(steps).toBe(3);expect(errors).toEqual([]);
});
