import {test,expect} from '../../frontend/node_modules/@playwright/test/index.mjs';
import {M} from './memorycast_database_fixture.mjs';
const auth={Authorization:'Bearer session-a'};
const path='/api/memorycast/memories/'+M;
test('owned memory generates persisted chapters and playable private voice; new sessions replay with zero AI calls',async({page,request,browser})=>{
 const result=await request.post(path,{headers:auth,data:{approved:true}});expect(result.status()).toBe(202);const job=(await result.json()).tour;
 for(let i=0;i<5;i++){const step=await request.post('/api/memorycast/tours/'+job.id+'/advance',{headers:auth});expect(step.status()).toBe(200);}
 const ready=(await(await request.get(path,{headers:auth})).json()).tour;
 expect(ready.status).toBe('ready');expect(ready.script.chapters.map(c=>c.title)).toEqual(['Arrival','Rediscovery','Reflection']);expect(ready.script.chapters[1].camera.target).toEqual([1,0,-2]);
 expect(ready.script.chapters[0].narration).toContain('I listened to the rain');expect(ready.script.chapters[0].subtitles).toBe(ready.script.chapters[0].narration);
 await page.goto('/__test/page');await page.evaluate(url=>document.getElementById('audio').src=url,ready.audio[0].url);
 await page.getByRole('button',{name:'Play test narration'}).click();
 await expect.poll(()=>page.evaluate(()=>document.getElementById('audio').duration)).toBe(1);
 await expect.poll(()=>page.evaluate(()=>document.getElementById('audio').ended)).toBe(true);
 const before=(await(await request.get('/__test/stats')).json()).calls;
 await page.reload();const context=await browser.newContext();const session=await context.newPage();await session.goto('/__test/page');
 const replay=await session.evaluate(async p=>(await fetch(p,{headers:{Authorization:'Bearer session-a'}})).json(),path);
 expect(replay.tour.id).toBe(job.id);expect(replay.tour.audio).toHaveLength(3);expect((await(await request.get('/__test/stats')).json()).calls).toEqual(before);
 expect((await request.get(ready.audio[0].url.replace('test-only-signed','invalid'))).status()).toBe(403);
 await context.close();
});
test('account switching and stale memory never regenerate without explicit request',async({request})=>{
 expect((await request.get(path,{headers:{Authorization:'Bearer session-b'}})).status()).toBe(404);
 const saved=(await(await request.get(path,{headers:auth})).json()).tour;
 const before=(await(await request.get('/__test/stats')).json()).calls.length;
 await request.post('http://127.0.0.1:8038/__test/edit',{headers:{apikey:'test-service-role'},data:{story:'A changed memory of a quiet morning.'}});
 expect((await(await request.get(path,{headers:auth})).json()).stale).toBe(true);
 expect((await request.post(path,{headers:auth,data:{approved:true}})).status()).toBe(409);
 const next=await request.post(path,{headers:auth,data:{approved:true,regenerate:true}});expect(next.status()).toBe(202);expect((await next.json()).tour.id).not.toBe(saved.id);
 expect((await(await request.get('/__test/stats')).json()).calls.length).toBe(before);
 const old=(await(await request.get(path+'?tour_id='+saved.id,{headers:auth})).json()).tour;expect(old.status).toBe('ready');
});
