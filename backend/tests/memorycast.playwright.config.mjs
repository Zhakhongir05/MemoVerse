import {defineConfig} from '../../frontend/node_modules/@playwright/test/index.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const python=process.env.MEMOVERSE_TEST_PYTHON||'python3';
export default defineConfig({testDir:'.',testMatch:'memorycast.browser.spec.mjs',workers:1,fullyParallel:false,timeout:60000,retries:0,
 outputDir:'../../frontend/test-results/memorycast-backend',reporter:[['list'],['json',{outputFile:root+'frontend/test-results/memorycast-backend-results.json'}]],
 use:{baseURL:'http://127.0.0.1:8028',headless:true,channel:'chrome'},
 webServer:[
  {command:'node backend/tests/memorycast_fixture_server.mjs',cwd:root,url:'http://127.0.0.1:8038/health',timeout:30000,reuseExistingServer:false},
  {command:`${python} -m uvicorn backend.tests.mock_memorycast_server:app --host 127.0.0.1 --port 8028`,cwd:root,url:'http://127.0.0.1:8028/health',timeout:30000,reuseExistingServer:false},
 ]});
