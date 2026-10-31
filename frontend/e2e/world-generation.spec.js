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
 await page.goto('/');await page.getByRole('button',{name:'Enter Your Memories'}).click();
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
 await page.reload();await page.getByRole('button',{name:'Enter Your Memories'}).click();
 await expect(page.getByText('2 of 3 worlds remaining',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Resume world 1',exact:true}).click();
 await expect(page.getByRole('button',{name:'New generated world',exact:true})).toBeVisible({timeout:30000});expect((await stats(request)).submitted).toBe(before+1);
});

test('all 3 used disables new generation but keeps revisits free',async({page,request})=>{
 await request.post('http://127.0.0.1:8036/__test/seed-completed',{data:{user_id:TEST_USERS[2]}});
 // This account already used its three allowances in the test database.
 await page.route('https://cdn.marble.worldlabs.ai/**',route=>route.fulfill({body:route.request().url().includes('.spz')?spz():route.request().url().includes('.glb')?collider():png,headers:{'Access-Control-Allow-Origin':'*'}}));
 const session=sessionFor(TEST_USERS[2]);await page.addInitScript(session=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),session);
 await page.goto('/');await page.getByRole('button',{name:'Enter Your Memories'}).click();
 await expect(page.getByText('0 of 3 worlds remaining',{exact:true})).toBeVisible();await expect(page.getByText(/You’ve used your 3 free worlds/)).toBeVisible();
 await expect(page.getByRole('button',{name:'Generate Realistic 3D World',exact:true})).toBeDisabled();const before=(await stats(request)).submitted;
 await page.getByRole('button',{name:'Open world 1',exact:true}).click();await expect(page.getByRole('button',{name:'New generated world',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open world 2',exact:true}).click();await expect(page.getByText('0 of 3 worlds remaining',{exact:true})).toBeVisible();
 expect((await stats(request)).submitted).toBe(before);
});

test('switching Google accounts never reuses another account allowance or jobs',async({page,request})=>{
 await prepare(page,3);await inputs(page,'A first account’s synthetic memory.');
 await page.getByRole('button',{name:'Generate Realistic 3D World',exact:true}).click();await expect(page.getByText('2 of 3 worlds remaining',{exact:true})).toBeVisible();
 await page.evaluate(id=>localStorage.setItem('e2e-account',id),TEST_USERS[4]);await page.reload();await page.getByRole('button',{name:'Enter Your Memories'}).click();
 await expect(page.getByText('3 of 3 worlds remaining',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/^(Open|Resume) world/})).toHaveCount(0);
 const response=await request.get('http://127.0.0.1:8026/api/world-account',{headers:{Authorization:'Bearer '+sessionFor(TEST_USERS[3]).access_token}});expect((await response.json()).remaining).toBe(2);
});

test('failure retains the reservation and the saved sample stays separately usable',async({page})=>{
 await prepare(page,5);await inputs(page,'A synthetic [fail] request.');await page.getByRole('button',{name:'Generate Realistic 3D World',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'World generation failed'})).toBeVisible({timeout:20000});await expect(page.getByText('2 of 3 worlds remaining',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Explore sample world',exact:true}).click();await expect(page.getByText('Saved bedroom sample',{exact:true})).toBeVisible();await expect(page.getByText(/Loaded 4 splats and collider/)).toBeVisible({timeout:30000});
});

test('existing Google login stays available to signed-out visitors',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible();await expect(page.getByRole('button',{name:'Generate Realistic 3D World',exact:true})).toHaveCount(0);
});
