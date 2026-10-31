import {test,expect} from '@playwright/test';
import {spz,collider,png} from './fixtures.js';
import {sessionFor,TEST_USERS} from '../../backend/tests/supabase_fixture.mjs';
const stats=async request=>(await request.get(`http://127.0.0.1:${process.env.MEMOVERSE_TEST_BACKEND_PORT||8026}/__test/stats`)).json();
async function setup(page,index){
 await page.route('https://cdn.marble.worldlabs.ai/**',route=>route.fulfill({body:route.request().url().includes('.spz')?spz():route.request().url().includes('.glb')?collider():png,contentType:route.request().url().includes('.glb')?'model/gltf-binary':'application/octet-stream',headers:{'Access-Control-Allow-Origin':'*'}}));
 await page.route('https://api.worldlabs.ai/**',()=>{throw new Error('Paid provider must never be contacted');});
 await page.addInitScript(session=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),sessionFor(TEST_USERS[index]));
 await page.goto('/');await page.getByRole('button',{name:'Explore Memories',exact:true}).click();
}
async function save(page,title){
 await page.getByRole('button',{name:'＋ New Memory',exact:true}).click();
 await page.locator('#mj-title').fill(title);await page.locator('#mj-story').fill('A synthetic photograph for the focused world generation test.');
 await page.locator('#mj-photos').setInputFiles({name:'test.png',mimeType:'image/png',buffer:png});
 await page.getByRole('button',{name:'Save journal entry ↗',exact:true}).click();
}
test('first Relive submits once, renders its world and reopens it after reload for free',async({page,request})=>{
 await setup(page,0);const before=(await stats(request)).submitted;
 await save(page,'Focused production world test');expect((await stats(request)).submitted).toBe(before);
 await page.getByRole('button',{name:'Create 3D world',exact:true}).click();
 await expect(page.locator('[data-world-source="generated"]')).toBeVisible({timeout:30000});
 expect((await stats(request)).submitted).toBe(before+1);
 await expect(page.locator('[data-world-source="generated"]')).toBeVisible();
 await expect(page.locator('[data-world-state="ready"]')).toBeVisible({timeout:30000});
 const worldId=await page.locator('[data-world-id]').getAttribute('data-world-id');
 const pollsBefore=(await stats(request)).polls;
 await page.reload();
 await expect(page.locator('[data-world-id]')).toHaveAttribute('data-world-id',worldId);
 await expect(page.locator('[data-world-state="ready"]')).toBeVisible({timeout:30000});
 expect((await stats(request)).submitted).toBe(before+1);
 expect((await stats(request)).polls).toEqual(pollsBefore);
 // The journal must show the saved API world, even when its source photo exists.
 const writes=[];
 page.on('request',r=>{if(r.method()==='POST' && /\/api\/(journal|world-|generate-enhancements|sensory-cues)/.test(r.url()))writes.push(r.url())});
 await page.getByRole('button',{name:'Back to memory',exact:true}).click();
 await page.getByRole('button',{name:'← Back to My Journal',exact:true}).click();
 const preview=page.locator('.jh-world [data-world-preview="true"]');
 await expect(preview).toHaveAttribute('data-world-id',worldId);
 await expect(preview).toHaveAttribute('data-world-state','ready',{timeout:30000});
 await expect(preview.locator('canvas')).toBeVisible();
 await expect(page.locator('.jh-cover')).toHaveCount(0);
 expect(writes).toEqual([]);
 expect((await stats(request)).submitted).toBe(before+1);
 expect((await stats(request)).polls).toEqual(pollsBefore);
 // A broken saved response must never default to the predefined sample or photo.
 await page.route('**/api/journal/*/world',route=>route.request().method()==='GET'?route.fulfill({json:{status:'succeeded',world:null}}):route.continue());
 await page.reload();
 await page.getByRole('button',{name:'Explore Memories',exact:true}).click();
 await expect(page.locator('.jh-world').getByRole('alert')).toContainText('Saved 3D assets are unavailable');
 await expect(page.locator('.jh-world canvas')).toHaveCount(0);
 await expect(page.locator('.jh-cover')).toHaveCount(0);
 expect((await stats(request)).submitted).toBe(before+1);
});
test('refresh resumes a pending journal job instead of resubmitting',async({page,request})=>{
 await setup(page,1);await save(page,'Pending world recovery');const before=(await stats(request)).submitted;
 await page.getByRole('button',{name:'Create 3D world',exact:true}).click();
 await expect.poll(async()=>(await stats(request)).submitted).toBe(before+1);
 await page.reload();
 await expect(page.locator('[data-world-source="generated"]')).toBeVisible({timeout:30000});
 expect((await stats(request)).submitted).toBe(before+1);
});
test('reservation failures display the precise backend error without submission or sample fallback',async({page,request})=>{
 await setup(page,2);await save(page,'Specific reservation error');const before=(await stats(request)).submitted;
 const message='Generation is blocked by earlier submissions awaiting owner review. No new World Labs request was sent; your allowance is unchanged.';
 await page.route('**/api/journal/*/world',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{detail:message}}):route.continue());
 await page.getByRole('button',{name:'Create 3D world',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:message})).toBeVisible();
 await expect(page.getByRole('button',{name:'Create 3D world',exact:true})).toHaveCount(0);
 await expect(page.getByText('Uploading your photograph securely…',{exact:true})).toHaveCount(0);
 await expect(page.locator('canvas')).toHaveCount(0);expect((await stats(request)).submitted).toBe(before);
});
