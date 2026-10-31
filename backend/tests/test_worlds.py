import asyncio, io, os, tempfile, unittest
from unittest.mock import patch, AsyncMock
from PIL import Image
from fastapi.testclient import TestClient
from backend.main import app
from backend.worlds import JobStore

def photo():
    stream=io.BytesIO();Image.new('RGB',(4,4),'red').save(stream,'PNG');return stream.getvalue()
def world():
    return {'id':'world-1','assets':{'splats':{'spz_urls':{'500k':'https://cdn.marble.worldlabs.ai/new.spz','full_res':'https://cdn.marble.worldlabs.ai/full.spz'}},'mesh':{'collider_mesh_url':'https://cdn.marble.worldlabs.ai/collider.glb'}}}
class WorldTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.env=patch.dict(os.environ,{'WORLD_JOB_DB':self.temp.name+'/jobs.db','WORLD_GENERATION_ENABLED':'true','WORLD_GENERATION_ACCESS_TOKEN':'test-access','WORLD_MAX_JOBS':'1','WLT_API_KEY':'fake-key','VERCEL':'','WORLD_REDIS_REST_URL':''});self.env.start()
        self.client=TestClient(app);self.client.__enter__();self.headers={'Authorization':'Bearer test-access'}
    def tearDown(self):
        self.client.__exit__(None,None,None);self.env.stop();self.temp.cleanup()
    def post(self,story='My memory',approved='true',headers=None):
        return self.client.post('/api/world-jobs',headers=self.headers if headers is None else headers,data={'story':story,'approved':approved},files={'photo':('photo.png',photo(),'image/png')})
    def test_auth_approval_and_disabled_never_call_provider(self):
        with patch('backend.worlds.provider',new_callable=AsyncMock) as provider:
            self.assertEqual(self.post(headers={}).status_code,403);self.assertEqual(self.post(approved='false').status_code,400)
            with patch.dict(os.environ,{'WORLD_GENERATION_ENABLED':'false'}):self.assertEqual(self.post().status_code,503)
            provider.assert_not_awaited()
    def test_submit_cache_poll_success_and_budget(self):
        with patch('backend.worlds.provider',new_callable=AsyncMock) as provider:
            provider.return_value={'operation_id':'op-123'};first=self.post();self.assertEqual(first.status_code,202,first.text);key=first.json()['job_id']
            self.assertEqual(self.post().json()['job_id'],key);self.assertEqual(provider.await_count,1)
            self.assertEqual(provider.call_args.args[2]['world_prompt']['image_prompt']['source'],'data_base64');self.assertNotIn('fake-key',first.text)
            self.assertEqual(self.post(story='Different memory').status_code,429)
            provider.return_value={'done':True,'response':world()};result=self.client.get('/api/world-jobs/'+key,headers=self.headers)
            self.assertEqual(result.json()['status'],'succeeded',result.text);self.assertIn('colliderUrl',result.json()['world'])
            self.client.get('/api/world-jobs/'+key,headers=self.headers);self.assertEqual(provider.await_count,2)
    def test_ambiguous_submission_is_not_retried(self):
        from fastapi import HTTPException
        with patch('backend.worlds.provider',new_callable=AsyncMock,side_effect=HTTPException(502,'safe')) as provider:
            self.assertEqual(self.post().json()['status'],'unknown');self.assertEqual(self.post().json()['status'],'unknown');self.assertEqual(provider.await_count,1)
    def test_expiry(self):
        with patch('backend.worlds.provider',new_callable=AsyncMock,return_value={'operation_id':'op-123','expires_at':'2000-01-01T00:00:00Z'}):key=self.post().json()['job_id']
        self.assertEqual(self.client.get('/api/world-jobs/'+key,headers=self.headers).json()['status'],'expired')
    def test_provider_failure_and_pending_throttle(self):
        with patch('backend.worlds.provider',new_callable=AsyncMock) as provider:
            provider.return_value={'operation_id':'op-123'};key=self.post().json()['job_id'];provider.return_value={'done':False}
            self.assertEqual(self.client.get('/api/world-jobs/'+key,headers=self.headers).json()['status'],'pending')
            self.client.get('/api/world-jobs/'+key,headers=self.headers);self.assertEqual(provider.await_count,2)
            store=JobStore();job=asyncio.run(store.get(key));job['checked']=0;asyncio.run(store.save(key,job));provider.return_value={'done':True,'error':{'message':'private provider data'}}
            response=self.client.get('/api/world-jobs/'+key,headers=self.headers);self.assertEqual(response.json()['status'],'failed');self.assertNotIn('private provider data',response.text)
    def test_serverless_requires_durable_storage(self):
        from fastapi import HTTPException
        with patch.dict(os.environ,{'VERCEL':'1'}):
            with self.assertRaises(HTTPException):JobStore()

class StoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_reservation_is_atomic_across_store_instances(self):
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {'WORLD_REDIS_REST_URL':'','WORLD_JOB_DB':folder+'/jobs.db','VERCEL':''}):
            stores=[JobStore(),JobStore()]
            results=await asyncio.gather(*(s.reserve('a'*64,{'status':'submitting'},1) for s in stores))
            self.assertEqual(results.count(True),1)
    async def test_redis_uses_atomic_claim_and_budget_script(self):
        with patch.dict(os.environ,{'WORLD_REDIS_REST_URL':'https://redis.example.test','WORLD_REDIS_REST_TOKEN':'test','VERCEL':'1'}):
            store=JobStore()
            with patch.object(store,'redis',new_callable=AsyncMock,return_value=1) as command:
                self.assertTrue(await store.reserve('a'*64,{'status':'submitting'},1))
                self.assertEqual(command.call_args.args[0],'EVAL')
                self.assertIn("redis.call('EXISTS'",command.call_args.args[1])
                self.assertIn("redis.call('INCR'",command.call_args.args[1])

class WorldPreviewTests(unittest.TestCase):
    def test_generated_preview_and_panorama_reach_frontend_contract(self):
        from backend.worlds import world_result
        result=world();result['assets']['thumbnail_url']='https://cdn.marble.worldlabs.ai/generated.jpg';result['assets']['imagery']={'pano_url':'https://cdn.marble.worldlabs.ai/panorama.jpg'}
        output=world_result(result)
        self.assertEqual(output['thumbnailUrl'],result['assets']['thumbnail_url'])
        self.assertEqual(output['panoramaUrl'],result['assets']['imagery']['pano_url'])
        self.assertEqual(output['splatUrl'],'https://cdn.marble.worldlabs.ai/new.spz')
    def test_optional_preview_cannot_escape_asset_host_validation(self):
        from backend.worlds import world_result
        from fastapi import HTTPException
        result=world();result['assets']['thumbnail_url']='file:///private/photo.jpg'
        with self.assertRaises(HTTPException):world_result(result)
