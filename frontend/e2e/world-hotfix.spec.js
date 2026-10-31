import {test,expect} from '@playwright/test';
import {spz,collider,png} from './fixtures.js';
import {sessionFor,TEST_USERS} from '../../backend/tests/supabase_fixture.mjs';
const stats=async request=>(await request.get('http://127.0.0.1:8026/__test/stats')).json();
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
 await page.getByRole('button',{name:'Relive in 3D ✧',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Enter Memory World',exact:true})).toBeVisible({timeout:30000});
 expect((await stats(request)).submitted).toBe(before+1);
 await page.getByRole('button',{name:'Explore Freely ↗',exact:true}).click();
 await expect(page.locator('[data-world-source="generated"]')).toBeVisible();
 await expect(page.getByText(/Loaded 4 splats and collider/)).toBeVisible({timeout:30000});
 const worldId=await page.locator('[data-world-id]').getAttribute('data-world-id');
 await page.reload();await page.getByRole('button',{name:'Explore Memories',exact:true}).click();
 await page.getByRole('button',{name:/Open Focused production world test/}).click();
 await page.getByRole('button',{name:'Enter Memory World ✧',exact:true}).click();
 await page.getByRole('button',{name:'Explore Freely ↗',exact:true}).click();
 await expect(page.locator('[data-world-id]')).toHaveAttribute('data-world-id',worldId);
 await expect(page.getByText(/Loaded 4 splats and collider/)).toBeVisible({timeout:30000});
 expect((await stats(request)).submitted).toBe(before+1);
});
test('refresh resumes a pending journal job instead of resubmitting',async({page,request})=>{
 await setup(page,1);await save(page,'Pending world recovery');const before=(await stats(request)).submitted;
 await page.getByRole('button',{name:'Relive in 3D ✧',exact:true}).click();
 await expect.poll(async()=>(await stats(request)).submitted).toBe(before+1);
 await page.reload();await page.getByRole('button',{name:'Explore Memories',exact:true}).click();
 await page.getByRole('button',{name:/Open Pending world recovery/}).click();
 await page.getByRole('button',{name:'Relive in 3D ✧',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Enter Memory World',exact:true})).toBeVisible({timeout:30000});
 expect((await stats(request)).submitted).toBe(before+1);
});
test('reservation failures display the precise backend error without submission or sample fallback',async({page,request})=>{
 await setup(page,2);await save(page,'Specific reservation error');const before=(await stats(request)).submitted;
 const message='Generation is blocked by earlier submissions awaiting owner review. No new World Labs request was sent; your allowance is unchanged.';
 await page.route('**/api/journal/*/world',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{detail:message}}):route.continue());
 await page.getByRole('button',{name:'Relive in 3D ✧',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:message})).toBeVisible();
 await expect(page.getByText('Uploading your photograph securely…',{exact:true})).toHaveCount(0);
 await expect(page.locator('canvas')).toHaveCount(0);expect((await stats(request)).submitted).toBe(before);
});
