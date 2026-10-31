import copy
import hashlib
import io
import os
import unittest
from unittest.mock import AsyncMock,patch
from uuid import uuid4
import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from backend.main import app
from backend.world_accounts import SupabaseWorlds,get_accounts
from backend.worlds import world_result

A='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222'
def photo():
    out=io.BytesIO();Image.new('RGB',(4,4),'red').save(out,'PNG');return out.getvalue()
def world():return {'id':'world-1','assets':{'splats':{'spz_urls':{'500k':'https://cdn.marble.worldlabs.ai/new.spz','full_res':'https://cdn.marble.worldlabs.ai/full.spz'}},'mesh':{'collider_mesh_url':'https://cdn.marble.worldlabs.ai/collider.glb'},'thumbnail_url':'https://cdn.marble.worldlabs.ai/thumb.jpg'}}

class FakeAccounts:
    """HTTP-route test double. Real SQL reservation rules are tested separately in PostgreSQL."""
    def __init__(self):self.jobs={};self.calls=[]
    async def user(self,token):
        if token in ('account-a-device-1','account-a-device-2'):return A
        if token=='account-b':return B
        raise HTTPException(401,'Sign in again.')
    async def rpc(self,name,p):
        self.calls.append((name,copy.deepcopy(p)));owner=p.get('p_user_id')
        jobs=[j for j in self.jobs.values() if j['owner']==owner]
        if name=='mv_world_binding':return {}
        if name=='mv_world_config':return {'enabled':True,'limit':3,'expires_at':'2026-11-30T00:00:00Z'}
        if name=='mv_world_account':return {'limit':3,'used':len(jobs),'remaining':3-len(jobs),'jobs':[self.public(j) for j in jobs]}
        if name=='mv_world_reserve':
            old=next((j for j in jobs if j['hash']==p['p_submission']),None)
            if old:return {'fresh':False,'job':self.public(old),'model':'marble-1.1'}
            if len(jobs)>=3:raise HTTPException(429,'You have used your 3 free worlds. You can revisit them any time.')
            job={'job_id':p['p_job_id'],'owner':owner,'hash':p['p_submission'],'status':'submitting','world':None,'message':'Submitting'};self.jobs[job['job_id']]=job
            return {'fresh':True,'job':self.public(job),'model':'marble-1.1'}
        job=self.jobs.get(p.get('p_job_id'))
        if not job or job['owner']!=owner:raise HTTPException(404,'World not found for this account.')
        if name=='mv_world_poll':return {'poll':job['status']=='pending','job':self.public(job),'operation_id':job.get('operation_id')}
        if name=='mv_world_finish':job.update(p['p_update']);return self.public(job)
        raise AssertionError(name)
    def public(self,j):return {k:v for k,v in j.items() if k not in ('owner','hash','operation_id')}

class WorldTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'DEMO_MODE':'true','WORLD_GENERATION_ENABLED':'true','WLT_API_KEY':'fake-provider-key'},clear=True);self.env.start()
        self.accounts=FakeAccounts();app.dependency_overrides[get_accounts]=lambda:self.accounts
        self.provider=AsyncMock(return_value={'operation_id':'op-1'});self.mock=patch('backend.worlds.provider',self.provider);self.mock.start()
        self.client=TestClient(app);self.client.__enter__();self.headers={'Authorization':'Bearer account-a-device-1'}
    def tearDown(self):self.client.__exit__(None,None,None);self.mock.stop();app.dependency_overrides.clear();self.env.stop()
    def post(self,story='My quiet room',headers=None,extra=None):return self.client.post('/api/world-jobs',headers=self.headers if headers is None else headers,data={'story':story,'approved':'true',**(extra or {})},files={'photo':('photo.png',photo(),'image/png')})
    def state(self,headers=None):return self.client.get('/api/world-account',headers=headers or self.headers)
    def test_account_starts_with_three_and_no_generation_code(self):
        self.assertEqual(self.state().json()['remaining'],3);self.assertEqual(self.post().status_code,202);self.assertEqual(self.state().json()['remaining'],2)
    def test_missing_invalid_auth_and_guest_cannot_generate(self):
        self.assertEqual(self.post(headers={}).status_code,401);self.assertEqual(self.post(headers={'Authorization':'Bearer forged-token'}).status_code,401);self.provider.assert_not_awaited()
    def test_verified_id_ignores_browser_supplied_account_id(self):
        self.post(extra={'user_id':B});params=next(p for name,p in self.accounts.calls if name=='mv_world_reserve');self.assertEqual(params['p_user_id'],A)
    def test_same_account_cross_device_retry_and_account_switch(self):
        first=self.post();second=self.post(headers={'Authorization':'Bearer account-a-device-2'});self.assertEqual(first.json()['job_id'],second.json()['job_id']);self.assertEqual(self.provider.await_count,1)
        self.assertEqual(self.state({'Authorization':'Bearer account-b'}).json()['remaining'],3)
        self.assertEqual(self.client.get('/api/world-jobs/'+first.json()['job_id'],headers={'Authorization':'Bearer account-b'}).status_code,404)
    def test_fourth_new_job_denied_before_provider(self):
        for i in range(3):self.assertEqual(self.post(story='memory '+str(i)).status_code,202)
        self.assertEqual(self.post(story='fourth').status_code,429);self.assertEqual(self.provider.await_count,3);self.assertEqual(self.state().json()['remaining'],0)
    def test_completed_world_reopens_without_extra_allowance(self):
        first=self.post().json();self.provider.return_value={'done':True,'response':world()}
        result=self.client.get('/api/world-jobs/'+first['job_id'],headers=self.headers);self.assertEqual(result.json()['status'],'succeeded');self.assertIn('thumbnailUrl',result.json()['world'])
        for _ in range(5):self.client.get('/api/world-jobs/'+first['job_id'],headers=self.headers)
        self.assertEqual(self.state().json()['remaining'],2);self.assertEqual(self.provider.await_count,2)
    def test_uncertain_submission_is_held_and_never_submitted_again(self):
        self.provider.side_effect=HTTPException(502,'private provider text');first=self.post();self.assertEqual(first.json()['status'],'unknown');self.assertNotIn('private provider text',first.text)
        self.post();self.assertEqual(self.state().json()['remaining'],2);self.assertEqual(self.provider.await_count,1)
    def test_provider_failure_and_expiry_do_not_refund(self):
        first=self.post().json();self.provider.return_value={'done':True,'error':{'message':'private'}}
        result=self.client.get('/api/world-jobs/'+first['job_id'],headers=self.headers);self.assertEqual(result.json()['status'],'failed');self.assertEqual(self.state().json()['remaining'],2)
    def test_disabled_and_global_database_rejection_never_submit(self):
        with patch.dict(os.environ,{'WORLD_GENERATION_ENABLED':'false'}):self.assertEqual(self.post().status_code,503)
        with patch.object(self.accounts,'rpc',new_callable=AsyncMock,side_effect=HTTPException(429,'Global budget reached.')):self.assertEqual(self.post().status_code,429)
        self.provider.assert_not_awaited()
    def test_storage_failure_after_provider_post_cannot_retry_charge(self):
        original=self.accounts.rpc
        async def failure(name,p):
            if name=='mv_world_finish':raise HTTPException(503,'storage unavailable')
            return await original(name,p)
        with patch.object(self.accounts,'rpc',side_effect=failure):self.assertEqual(self.post().status_code,503)
        self.assertEqual(self.post().json()['status'],'submitting');self.assertEqual(self.provider.await_count,1)
    def test_bad_provider_expiry_does_not_lose_known_operation_id(self):
        self.provider.return_value={'operation_id':'op-1','expires_at':'bad timestamp'}
        result=self.post();self.assertEqual(result.status_code,202);self.assertEqual(result.json()['status'],'pending')
        job=next(iter(self.accounts.jobs.values()));self.assertEqual(job['operation_id'],'op-1');self.assertIsNone(job['expires_at'])
        self.assertEqual(self.state().json()['remaining'],2)

    def test_consent_and_image_validation_before_reservation(self):
        self.assertEqual(self.post(extra={'approved':'false'}).status_code,400)
        result=self.client.post('/api/world-jobs',headers=self.headers,data={'story':'memory','approved':'true'},files={'photo':('bad.png',b'bad','image/png')});self.assertEqual(result.status_code,422);self.provider.assert_not_awaited()

class SupabaseAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_existing_auth_server_verifies_token_and_service_key_stays_server_side(self):
        requests=[]
        async def handle(request):
            requests.append(request)
            if request.url.path=='/auth/v1/user':return httpx.Response(200,json={'id':A,'app_metadata':{'provider':'google'}})
            return httpx.Response(200,json={'remaining':3,'jobs':[]})
        with patch.dict(os.environ,{'SUPABASE_URL':'https://existing.supabase.co','SUPABASE_SERVICE_ROLE_KEY':'server-secret'},clear=True):
            async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
                adapter=SupabaseWorlds(client);self.assertEqual(await adapter.user('existing-user-token'),A);await adapter.rpc('mv_world_account',{'p_user_id':A})
        self.assertEqual(requests[0].headers['authorization'],'Bearer existing-user-token');self.assertEqual(requests[1].headers['authorization'],'Bearer server-secret');self.assertEqual(requests[0].url.host,'existing.supabase.co')
    async def test_forged_or_revoked_user_token_fails_closed(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://existing.supabase.co','SUPABASE_SERVICE_ROLE_KEY':'server-secret'},clear=True):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req:httpx.Response(401,json={'msg':'denied'}))) as client:
                with self.assertRaises(HTTPException) as error:await SupabaseWorlds(client).user('forged')
                self.assertEqual(error.exception.status_code,401)
    async def test_auth_outage_and_database_raw_errors_are_not_exposed(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://existing.supabase.co','SUPABASE_SERVICE_ROLE_KEY':'server-secret'},clear=True):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req:httpx.Response(500,text='private database detail'))) as client:
                with self.assertRaises(HTTPException) as error:await SupabaseWorlds(client).rpc('mv_world_account',{'p_user_id':A})
                self.assertEqual(error.exception.status_code,503);self.assertNotIn('private',error.exception.detail)

class WorldPreviewTests(unittest.TestCase):
    def test_thumbnail_and_panorama(self):
        data=world();data['assets']['imagery']={'pano_url':'https://cdn.marble.worldlabs.ai/pano.jpg'};result=world_result(data);self.assertIn('thumbnailUrl',result);self.assertIn('panoramaUrl',result)
    def test_rejects_untrusted_url(self):
        data=world();data['assets']['thumbnail_url']='file:///private/photo.jpg'
        with self.assertRaises(HTTPException):world_result(data)
