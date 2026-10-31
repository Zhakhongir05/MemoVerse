import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=process.env.MEMOVERSE_TEST_PYTHON||'python3';
export default defineConfig({
 testDir:'./e2e',workers:1,fullyParallel:false,retries:0,timeout:90000,
 expect:{timeout:15000},reporter:[['list'],['json',{outputFile:'test-results/browser-results.json'}]],
 use:{baseURL:'http://127.0.0.1:5206',headless:true,channel:process.env.MEMOVERSE_BROWSER_CHANNEL||'chrome',viewport:{width:1440,height:1100},screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 webServer:[
  {command:'node backend/tests/supabase_fixture.mjs',cwd:root,url:'http://127.0.0.1:8036/health',reuseExistingServer:false,timeout:30000},
  {command:`${python} -m uvicorn backend.tests.mock_world_server:app --host 127.0.0.1 --port 8026`,cwd:root,url:'http://127.0.0.1:8026/health',reuseExistingServer:false,timeout:30000},
  {command:'npm run dev -- --host 127.0.0.1 --port 5206 --strictPort',env:{MEMOVERSE_BACKEND_URL:'http://127.0.0.1:8026',VITE_SUPABASE_URL:'http://127.0.0.1:8036',VITE_SUPABASE_PUBLISHABLE_KEY:'test-publishable'},url:'http://127.0.0.1:5206',reuseExistingServer:false,timeout:30000},
 ],
});
