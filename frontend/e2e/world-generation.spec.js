import {test,expect} from '@playwright/test';
import {spz,collider,png} from './fixtures.js';
import {sessionFor,TEST_USERS} from '../../backend/tests/supabase_fixture.mjs';

async function prepare(page,index=0){
 await page.route('https://cdn.marble.worldlabs.ai/**',async route=>{
  const url=route.request().url();
  return route.fulfill({body:url.includes('.spz')?spz():url.includes('.glb')?collider():png,contentType:url.includes('.glb')?'model/gltf-binary':'application/octet-stream',headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.route('https://api.worldlabs.ai/**',()=>{throw new Error('Real World Labs API must never be contacted');});
 const sessions=Object.fromEntries(TEST_USERS.map(id=>[id,sessionFor(id)]));
 await page.addInitScript(({sessions,id})=>{
  const selected=localStorage.getItem('e2e-account')||id;
  localStorage.setItem('sb-127-auth-token',JSON.stringify(sessions[selected]));
 },{sessions,id:TEST_USERS[index]});
 await page.goto('/');await page.getByRole('button',{name:'Explore Memories'}).click();await page.getByRole('button',{name:'Memory Studio',exact:true}).click();
 await expect(page.getByRole('button',{name:'Explore sample world'})).toBeVisible();
 await expect(page.getByText('3 of 3 worlds remaining',{exact:true})).toBeVisible();
}
async function inputs(page,story='A calm room in a synthetic judging demo photograph.'){
 await page.locator('#mv-photo').setInputFiles({name:'demo.png',mimeType:'image/png',buffer:png});
 await page.locator('#mv-description').fill(story);
 await page.getByRole('checkbox',{name:'I agree to send this photograph and story to World Labs.'}).check();
}
async function stats(request){return(await request.get('http://127.0.0.1:8026/__test/stats')).json();}

test('existing Google account gets 3 worlds, progress and its new 3D result',async({page,request})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await prepare(page,0);await inputs(page);const before=(await stats(request)).submitted;
 await expect(page.getByLabel('Generation access code')).toHaveCount(0);
 await page.getByRole('button',{name:'Generate Realistic 3D World',exact:true}).click();await expect(page.getByRole('progressbar')).toBeVisible();
 await expect(page.getByText('2 of 3 worlds remaining',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'New generated world',exact:true})).toBeVisible({timeout:30000});
 await expect(page.getByRole('img',{name:'Preview of your newly generated World Labs world'})).toBeVisible();await expect(page.getByText(/Loaded 4 splats and collider/)).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'joyful',exact:true}).click();await expect(page.getByRole('button',{name:'joyful',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Place memory',exact:true})).toBeVisible();await page.screenshot({path:test.info().outputPath('account-generated-world.png')});
 expect((await stats(request)).submitted).toBe(before+1);expect(errors).toEqual([]);
});

test('same account restores its pending job after reload without using another allowance',async({page,request})=>{
 await prepare(page,1);await inputs(page,'A separate recovery test photograph.');const before=(await stats(request)).submitted;
 await page.getByRole('button',{name:'Generate Realistic 3D World',exact:true}).click();await expect(page.getByRole('progressbar')).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Explore Memories'}).click();await page.getByRole('button',{name:'Memory Studio',exact:true}).click();
 await expect(page.getByText('2 of 3 worlds remaining',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Resume world 1',exact:true}).click();
 await expect(page.getByRole('button',{name:'New generated world',exact:true})).toBeVisible({timeout:30000});expect((await stats(request)).submitted).toBe(before+1);
});

test('all 3 used disables new generation but keeps revisits free',async({page,request})=>{
 await request.post('http://127.0.0.1:8036/__test/seed-completed',{data:{user_id:TEST_USERS[2]}});
 // This account already used its three allowances in the test database.
 await page.route('https://cdn.marble.worldlabs.ai/**',route=>route.fulfill({body:route.request().url().includes('.spz')?spz():route.request().url().includes('.glb')?collider():png,headers:{'Access-Control-Allow-Origin':'*'}}));
 const session=sessionFor(TEST_USERS[2]);await page.addInitScript(session=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),session);
 await page.goto('/');await page.getByRole('button',{name:'Explore Memories'}).click();await page.getByRole('button',{name:'Memory Studio',exact:true}).click();
 await expect(page.getByText('0 of 3 worlds remaining',{exact:true})).toBeVisible();await expect(page.getByText(/You’ve used your 3 free worlds/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Generate Realistic 3D World',exact:true})).toBeDisabled();const before=(await stats(request)).submitted;
 await page.getByRole('button',{name:'Open world 1',exact:true}).click();await expect(page.getByRole('button',{name:'New generated world',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open world 2',exact:true}).click();await expect(page.getByText('0 of 3 worlds remaining',{exact:true})).toBeVisible();
 expect((await stats(request)).submitted).toBe(before);
});

test('switching Google accounts never reuses another account allowance or jobs',async({page,request})=>{
 await prepare(page,3);await inputs(page,'A first account’s synthetic memory.');
 await page.getByRole('button',{name:'Generate Realistic 3D World',exact:true}).click();await expect(page.getByText('2 of 3 worlds remaining',{exact:true})).toBeVisible();
 await page.evaluate(id=>localStorage.setItem('e2e-account',id),TEST_USERS[4]);await page.reload();await page.getByRole('button',{name:'Explore Memories'}).click();await page.getByRole('button',{name:'Memory Studio',exact:true}).click();
 await expect(page.getByText('3 of 3 worlds remaining',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^(Open|Resume) world/})).toHaveCount(0);
 const response=await request.get('http://127.0.0.1:8026/api/world-account',{headers:{Authorization:'Bearer '+sessionFor(TEST_USERS[3]).access_token}});expect((await response.json()).remaining).toBe(2);
});

test('failure retains the reservation and the saved sample stays separately usable',async({page})=>{
 await prepare(page,5);await inputs(page,'A synthetic [fail] request.');await page.getByRole('button',{name:'Generate Realistic 3D World',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'World generation failed'})).toBeVisible({timeout:20000});await expect(page.getByText('2 of 3 worlds remaining',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Explore sample world',exact:true}).click();await expect(page.getByText('Saved bedroom sample',{exact:true})).toBeVisible();await expect(page.getByText(/Loaded 4 splats and collider/)).toBeVisible({timeout:30000});
});

test('existing Google login stays available to signed-out visitors',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Explore Memories'}).click();await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible();await expect(page.getByRole('button',{name:'Generate Realistic 3D World',exact:true})).toHaveCount(0);
});

test('Relive My Memory directly generates the photo world and revisits it for free',async({page,request})=>{
 await page.route('http://127.0.0.1:8036/rest/v1/journal_entries**',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:[]});
  const row=route.request().postDataJSON();return route.fulfill({json:row});
 });
 await page.route('http://127.0.0.1:8036/storage/v1/object/**',route=>route.fulfill({json:{Key:'synthetic-private-photo'}}));
 await prepare(page,6);await page.getByRole('button',{name:'← Back to journal memory',exact:true}).click();
 const plan=page.getByRole('complementary',{name:'Your generation plan'});
 await expect(plan.getByText('Judging demo · Free plan')).toBeVisible();
 await expect(plan.getByText('3 of 3 worlds remaining',{exact:true})).toBeVisible();
 const before=(await stats(request)).submitted;
 await page.getByRole('button',{name:'＋ New Memory',exact:true}).click();
 await page.locator('#mj-title').fill('A synthetic judging memory');
 await page.locator('#mj-story').fill('A quiet synthetic photograph, used only in our mocked browser test.');
 await page.locator('#mj-photos').setInputFiles({name:'journal.png',mimeType:'image/png',buffer:png});
 await page.getByRole('button',{name:'Save journal entry ↗',exact:true}).click();
 expect((await stats(request)).submitted).toBe(before);
 await page.getByRole('button',{name:'Relive My Memory ✧',exact:true}).click();
 await expect(page.getByRole('progressbar')).toBeVisible();
 await expect(page.getByRole('button',{name:'SenseShift',exact:true})).toBeVisible({timeout:30000});
 await expect(page.getByRole('button',{name:'SenseShift',exact:true})).toBeVisible();
 await expect(page.locator('canvas')).toBeVisible();
 expect((await stats(request)).submitted).toBe(before+1);
 await page.getByRole('button',{name:'← Back to memory',exact:true}).click();
 await page.getByRole('button',{name:'Relive My Memory ✧',exact:true}).click();
 await expect(page.getByRole('button',{name:'SenseShift',exact:true})).toBeVisible();
 expect((await stats(request)).submitted).toBe(before+1);
 await page.screenshot({path:test.info().outputPath('journal-free-plan-world.png')});
});

test('paid-plan mock checkout cannot add real allowance or submit a provider job',async({page,request})=>{
 await prepare(page,7);await page.getByRole('button',{name:'← Back to journal memory',exact:true}).click();
 await page.getByRole('button',{name:'Plans',exact:true}).click();
 await expect(page.getByText('3 generations remaining · Free plan',{exact:true})).toBeVisible();
 const before=(await stats(request)).submitted;
 await page.getByRole('button',{name:'Preview 15 generations · ₩10,000',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await dialog.locator('#mc-name').fill('Demo User');await dialog.locator('#mc-number').fill('4242424242424242');
 await dialog.locator('#mc-expiry').fill('1230');await dialog.locator('#mc-cvc').fill('123');
 await dialog.getByRole('button',{name:'Simulate payment · ₩10,000',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'Mock payment complete',exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Back to plans',exact:true}).click();
 await expect(page.getByText('3 generations remaining · Free plan',{exact:true})).toBeVisible();
 expect((await stats(request)).submitted).toBe(before);
});

test('guest journal and alternative 3D previews remain usable without generation',async({page,request})=>{
 await page.goto('/');await page.getByRole('button',{name:'Explore Memories'}).click();
 await page.getByRole('button',{name:'Continue exploring without signing in',exact:true}).click();
 await expect(page.getByRole('button',{name:'My Journal',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Memory Studio',exact:true}).click();
 const before=(await stats(request)).submitted;
 await page.locator('#mv-photo').setInputFiles({name:'preview.png',mimeType:'image/png',buffer:png});
 await page.getByRole('button',{name:'Photo depth · not reconstruction',exact:true}).click();
 await expect(page.locator('canvas')).toBeVisible();
 await page.getByRole('button',{name:'Grounded diorama',exact:true}).click();
 await expect(page.locator('canvas')).toBeVisible();
 await page.getByRole('button',{name:'Symbolic objects',exact:true}).click();
 await expect(page.locator('canvas')).toBeVisible();
 expect((await stats(request)).submitted).toBe(before);
});

test('a preview demo scene is explicitly labelled and never presented as real generation',async({page,request})=>{
 await prepare(page,9);await inputs(page,'A synthetic symbolic scene provenance test.');
 const before=(await stats(request)).submitted;
 await page.getByRole('button',{name:'Generate My Memory',exact:false}).click();
 await expect(page.getByText('Prepared demo scene (demo_mode); not generated from your upload.',{exact:true})).toBeVisible();
 await expect(page.getByText('SYMBOLIC DEMO',{exact:true}).first()).toBeVisible();
 expect((await stats(request)).submitted).toBe(before);
});

async function openJournalGeneration(page,index,story){
 await page.route('http://127.0.0.1:8036/rest/v1/journal_entries**',route=>route.fulfill({json:route.request().method()==='GET'?[]:route.request().postDataJSON()}));
 await page.route('http://127.0.0.1:8036/storage/v1/object/**',route=>route.fulfill({json:{Key:'synthetic-photo'}}));
 await prepare(page,index);await page.getByRole('button',{name:'← Back to journal memory',exact:true}).click();
 await page.getByRole('button',{name:'＋ New Memory',exact:true}).click();
 await page.locator('#mj-title').fill('A Relive generation test');await page.locator('#mj-story').fill(story);
 await page.locator('#mj-photos').setInputFiles({name:'relive.png',mimeType:'image/png',buffer:png});
 await page.getByRole('button',{name:'Save journal entry ↗',exact:true}).click();
}

test('failed Relive generation shows an error without substituting a symbolic world',async({page})=>{
 await openJournalGeneration(page,10,'A synthetic [fail] Relive test.');
 await page.getByRole('button',{name:'Relive My Memory ✧',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'World generation failed'})).toBeVisible({timeout:30000});
 await expect(page.getByRole('button',{name:'SenseShift',exact:true})).toHaveCount(0);
 await expect(page.locator('canvas')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Use symbolic fallback',exact:true})).toBeVisible();
});

test('unavailable real generation does not silently open a sample or spend allowance',async({page,request})=>{
 await page.route('**/api/world-config',route=>route.fulfill({json:{enabled:false,limit:3}}));
 await openJournalGeneration(page,11,'A synthetic disabled-generation test.');
 const before=(await stats(request)).submitted;
 await page.getByRole('button',{name:'Relive My Memory ✧',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'no symbolic scene has been substituted'})).toBeVisible();
 await expect(page.locator('canvas')).toHaveCount(0);expect((await stats(request)).submitted).toBe(before);
});
