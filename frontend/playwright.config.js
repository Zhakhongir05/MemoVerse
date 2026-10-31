import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=process.env.MEMOVERSE_TEST_PYTHON||'python3';
const frontPort=process.env.MEMOVERSE_TEST_FRONTEND_PORT||'5206',apiPort=process.env.MEMOVERSE_TEST_BACKEND_PORT||'8026',dbPort=process.env.MEMOVERSE_TEST_SUPABASE_PORT||'8036';
const front=`http://127.0.0.1:${frontPort}`,api=`http://127.0.0.1:${apiPort}`,db=`http://127.0.0.1:${dbPort}`;
export default defineConfig({
 testDir:'./e2e',workers:1,fullyParallel:false,retries:0,timeout:90000,
 expect:{timeout:15000},reporter:[['list'],['json',{outputFile:'test-results/browser-results.json'}]],
 use:{baseURL:front,headless:true,channel:process.env.MEMOVERSE_BROWSER_CHANNEL||'chrome',viewport:{width:1440,height:1100},screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
 webServer:[
  {command:'node backend/tests/supabase_fixture.mjs',cwd:root,url:db+'/health',reuseExistingServer:false,timeout:30000},
  {command:`${python} -m uvicorn backend.tests.mock_world_server:app --host 127.0.0.1 --port ${apiPort}`,cwd:root,url:api+'/health',reuseExistingServer:false,timeout:30000},
  {command:process.env.MEMOVERSE_TEST_PRODUCTION?`npm run build && npm run preview -- --host 127.0.0.1 --port ${frontPort} --strictPort`:`npm run dev -- --host 127.0.0.1 --port ${frontPort} --strictPort`,env:{MEMOVERSE_BACKEND_URL:api,VITE_SUPABASE_URL:db,VITE_SUPABASE_PUBLISHABLE_KEY:'test-publishable'},url:front,reuseExistingServer:false,timeout:30000},
 ],
});
