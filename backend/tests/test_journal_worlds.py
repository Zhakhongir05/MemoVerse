import io
import os
import unittest
import httpx
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from PIL import Image
from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.main import app
from backend.world_accounts import get_accounts, authenticated_user, authenticated_journal_user, SupabaseWorlds
from backend.journal_worlds import public_job
from backend.worlds import get_job

USER='11111111-1111-4111-8111-111111111111'
MEMORY='22222222-2222-4222-8222-222222222222'
JOB='33333333-3333-4333-8333-333333333333'
class Accounts:
    def __init__(self, status='none', forbidden=False):
        self.profile={'identities':[{'provider':'google'}]}; self.status=status; self.forbidden=forbidden; self.reservations=0; self.operation=None
    async def user(self, token):
        if token!='test-session': raise HTTPException(401,'Invalid session')
        return USER
    async def rpc(self, name, params):
        if self.forbidden: raise HTTPException(404,'Not found')
        job={'job_id':JOB,'status':self.status,'world':None}
        if name=='mv_world_memory': return {'job':None,'world':None}
        if name=='mv_world_poll': return {'poll':False,'job':job}
        if name=='mv_journal_world': return job
        if name=='mv_journal_reserve':
            fresh=self.status=='none'
            if fresh: self.status='submitting';self.reservations+=1
            return {'fresh':fresh,'job':{**job,'status':self.status},'photo':{'path':USER+'/'+MEMORY+'/photo.png','type':'image/png'},'story':'A generic synthetic memory','model':'mock-test-model'}
        if name=='mv_world_finish': self.status=params['p_update']['status'];self.operation=params['p_update'].get('operation_id');return {**job,'status':self.status}
        if name=='mv_journal_experience': return {'revision':params['p_revision']+1}
        raise AssertionError(name)

class JournalWorldTests(unittest.TestCase):
    def setUp(self):
        self.accounts=Accounts()
        app.dependency_overrides[get_accounts]=lambda:self.accounts
        self.client=TestClient(app);self.client.__enter__()
        self.env=patch.dict(os.environ,{'WORLD_GENERATION_ENABLED':'true','WORLD_ASSET_RETENTION_APPROVED':'true','WLT_API_KEY':'synthetic-unit-test-key'});self.env.start()
        b=io.BytesIO();Image.new('RGB',(8,8),'white').save(b,format='PNG');self.photo=SimpleNamespace(content=b.getvalue())
    def tearDown(self):
        self.client.__exit__(None,None,None);app.dependency_overrides.clear();self.env.stop()
    def read(self):return self.client.get('/api/journal/'+MEMORY+'/world',headers={'Authorization':'Bearer test-session'})
    def post(self):return self.client.post('/api/journal/'+MEMORY+'/world',json={'approved':True},headers={'Authorization':'Bearer test-session'})
    def test_read_never_generates(self):
        with patch('backend.journal_worlds.provider',new_callable=AsyncMock) as provider:
            self.assertEqual(self.read().json()['status'],'none');provider.assert_not_called()
    def test_older_binding_reopens_when_modern_binding_is_empty_and_budget_is_spent(self):
        original=self.accounts.rpc
        saved={'job_id':JOB,'status':'succeeded','world':{'id':'already-paid-world','source':'worldlabs'}}
        async def rpc(name,params):
            if name=='mv_world_memory':return {'job':saved}
            if name=='mv_journal_reserve':raise HTTPException(429,'Budget reached')
            return await original(name,params)
        self.accounts.rpc=rpc
        with patch('backend.journal_worlds.provider',new_callable=AsyncMock) as provider:
            self.assertEqual(self.read().json()['world']['id'],'already-paid-world')
            self.assertEqual(self.post().json()['world']['id'],'already-paid-world')
            provider.assert_not_called();self.assertEqual(self.accounts.reservations,0)
    def test_pending_modern_job_progresses_without_a_separate_worker(self):
        self.accounts.status='pending'
        with patch('backend.journal_worlds.get_job',new_callable=AsyncMock,return_value={'status':'pending','job_id':JOB}) as poll:
            self.assertEqual(self.read().json()['status'],'pending')
            poll.assert_awaited_once_with(JOB,USER,self.accounts,journal=True)
    def test_saved_result_without_a_binding_never_starts_a_replacement(self):
        original=self.accounts.rpc
        async def rpc(name,params):
            if name=='mv_world_memory':return {'job':None,'world':{'id':'older-saved-world','source':'worldlabs'}}
            return await original(name,params)
        self.accounts.rpc=rpc
        self.assertEqual(self.post().json()['status'],'legacy_recovery')
        self.assertEqual(self.accounts.reservations,0)
    def test_saved_job_metadata_recovery_verifies_the_owned_job(self):
        original=self.accounts.rpc
        async def rpc(name,params):
            if name=='mv_world_memory':return {'job':None,'world':{'id':'owned-world','source':'worldlabs','jobId':JOB}}
            return await original(name,params)
        self.accounts.rpc=rpc
        with patch('backend.journal_worlds.get_job',new_callable=AsyncMock,return_value={'status':'succeeded','job_id':JOB,'world':{'id':'owned-world'}}) as read:
            self.assertEqual(self.read().json()['world']['id'],'owned-world')
            read.assert_awaited_once_with(JOB,USER,self.accounts)
        with patch('backend.journal_worlds.get_job',new_callable=AsyncMock,side_effect=HTTPException(404,'Not owned')):
            self.assertEqual(self.read().status_code,404)
        self.assertEqual(self.accounts.reservations,0)
    def test_first_relive_submits_once_repeated_click_and_refresh_reuse(self):
        with patch('backend.journal_worlds.provider',new_callable=AsyncMock,return_value={'operation_id':'operation-test'}) as provider,patch('backend.journal_worlds.storage',new_callable=AsyncMock,return_value=self.photo):
            self.assertEqual(self.post().json()['status'],'pending')
            self.assertEqual(self.post().json()['status'],'pending')
            self.assertEqual(self.read().json()['status'],'pending')
            self.assertEqual(provider.await_count,1);self.assertEqual(self.accounts.reservations,1)
    def test_ambiguous_provider_failure_never_resubmits(self):
        with patch('backend.journal_worlds.provider',new_callable=AsyncMock,side_effect=HTTPException(502,'provider error')) as provider,patch('backend.journal_worlds.storage',new_callable=AsyncMock,return_value=self.photo):
            self.assertEqual(self.post().json()['status'],'unknown')
            self.post();self.assertEqual(provider.await_count,1)
    def test_saves_experience_and_rejects_foreign_world_manifest(self):
        self.accounts.status='succeeded'
        original=self.accounts.rpc
        async def rpc(name,params):
            result=await original(name,params)
            if name=='mv_journal_world':result['world']={'id':'owned-world'}
            return result
        self.accounts.rpc=rpc
        url='/api/journal/'+MEMORY+'/experience'
        headers={'Authorization':'Bearer test-session'}
        response=self.client.post(url,json={'revision':0,'anchors':[{'id':'a','position':[0,0,0],'memory':'Supplied text'}]},headers=headers)
        self.assertEqual(response.json(),{'revision':1})
        manifest={'worldId':'foreign','enhancements':[],'source':'user','fallback':False}
        self.assertEqual(self.client.post(url,json={'revision':1,'enhancements':manifest},headers=headers).status_code,422)
    def test_verified_accounts_can_read_without_generating_regardless_of_provider(self):
        with patch('backend.journal_worlds.provider',new_callable=AsyncMock) as provider:
            for name in ('google','email'):
                with self.subTest(provider=name):
                    self.accounts.profile={'identities':[{'provider':name}]}
                    self.assertEqual(self.read().status_code,200)
                    self.assertEqual(self.accounts.reservations,0)
            provider.assert_not_called()
    def test_invalid_session_cannot_read_or_reserve(self):
        with patch('backend.journal_worlds.provider',new_callable=AsyncMock) as provider:
            headers={'Authorization':'Bearer invalid-session'}
            self.assertEqual(self.client.get('/api/journal/'+MEMORY+'/world',headers=headers).status_code,401)
            self.assertEqual(self.client.post('/api/journal/'+MEMORY+'/world',json={'approved':True},headers=headers).status_code,401)
            self.assertEqual(self.accounts.reservations,0);provider.assert_not_called()
    def test_requires_authentication(self):
        self.assertEqual(self.client.get('/api/journal/'+MEMORY+'/world').status_code,401)
    def test_foreign_entry_never_reaches_provider(self):
        self.accounts.forbidden=True
        with patch('backend.journal_worlds.provider',new_callable=AsyncMock) as provider:
            self.assertEqual(self.post().status_code,404);provider.assert_not_called()
    def test_disabled_generation_does_not_reserve(self):
        with patch.dict(os.environ,{'WORLD_GENERATION_ENABLED':'false'}):self.assertEqual(self.post().status_code,503)
        self.assertEqual(self.accounts.reservations,0)
    def test_retention_permission_required_before_reservation(self):
        with patch.dict(os.environ,{'WORLD_ASSET_RETENTION_APPROVED':'false'}):self.assertEqual(self.post().status_code,503)
        self.assertEqual(self.accounts.reservations,0)
    def test_pending_reopens_when_new_generation_disabled(self):
        self.accounts.status='pending'
        with patch.dict(os.environ,{'WORLD_GENERATION_ENABLED':'false'}):self.assertEqual(self.post().status_code,202)
    def test_rejects_invalid_photo_selection_and_unknown_fields(self):
        for body in [{'photoIndex':-1,'approved':True},{'approved':True,'imageUrl':'https://arbitrary.example'}]:
            self.assertEqual(self.client.post('/api/journal/'+MEMORY+'/world',json=body,headers={'Authorization':'Bearer test-session'}).status_code,422)

class PrivateAssetTests(unittest.IsolatedAsyncioTestCase):
    async def test_saved_assets_mint_fresh_references_without_generation(self):
        accounts=SimpleNamespace(url='https://project.example')
        job={'status':'succeeded','job_id':JOB,'world':{'id':'world-1','storagePaths':{'splatUrl':USER+'/'+JOB+'/world.spz','colliderUrl':USER+'/'+JOB+'/collider.glb'}}}
        response=SimpleNamespace(json=lambda:{'signedURL':'/object/sign/memory-worlds/test?token=synthetic'})
        with patch('backend.journal_worlds.storage',new_callable=AsyncMock,return_value=response) as storage:
            result=await public_job(accounts,USER,job)
            self.assertEqual(storage.await_count,4)
            self.assertTrue(result['world']['splatUrl'].startswith('https://project.example/storage/v1/object/sign/'))
            self.assertNotIn('token',str(job))
    async def test_private_foreign_asset_path_rejected(self):
        with self.assertRaises(HTTPException): await public_job(SimpleNamespace(),USER,{'status':'succeeded','job_id':JOB,'world':{'storagePaths':{'splatUrl':'other-user/file'}}})
    async def test_worker_only_finishes_after_archive(self):
        accounts=SimpleNamespace(rpc=AsyncMock(side_effect=[{'poll':True,'operation_id':'op-test','job':{'job_id':JOB,'status':'pending'}},{'status':'succeeded'}]))
        raw={'id':'world-1','assets':{'splats':{'spz_urls':{'500k':'https://cdn.marble.worldlabs.ai/world.spz'}},'mesh':{'collider_mesh_url':'https://cdn.marble.worldlabs.ai/collider.glb'}}}
        archived={'id':'world-1','storagePaths':{'splatUrl':'private/path.spz','colliderUrl':'private/path.glb'}}
        with patch('backend.worlds.provider',new_callable=AsyncMock,return_value={'done':True,'response':raw}),patch('backend.world_archive.archive_world',new_callable=AsyncMock,return_value=archived) as archive:
            await get_job(JOB,USER,accounts,journal=True);archive.assert_awaited_once()
            self.assertEqual(accounts.rpc.await_args_list[-1].args[1]['p_update']['world'],archived)
    async def test_archive_failure_never_marks_world_completed(self):
        accounts=SimpleNamespace(rpc=AsyncMock(side_effect=[{'poll':True,'operation_id':'op-test','job':{'job_id':JOB,'status':'pending'}},{'status':'pending'}]))
        raw={'id':'world-1','assets':{'splats':{'spz_urls':{'500k':'https://cdn.marble.worldlabs.ai/world.spz'}},'mesh':{'collider_mesh_url':'https://cdn.marble.worldlabs.ai/collider.glb'}}}
        with patch('backend.worlds.provider',new_callable=AsyncMock,return_value={'done':True,'response':raw}),patch('backend.world_archive.archive_world',new_callable=AsyncMock,side_effect=HTTPException(503,'storage unavailable')):
            await get_job(JOB,USER,accounts,journal=True)
            self.assertEqual(accounts.rpc.await_args_list[-1].args[1]['p_update']['status'],'pending')

class ArchiveTransferTests(unittest.IsolatedAsyncioTestCase):
    async def test_transfer_and_repeat_reuse_private_objects(self):
        import httpx
        from backend.world_archive import archive_world
        uploaded={};downloads=[]
        async def handle(request):
            url=str(request.url)
            if request.url.host=='cdn.marble.worldlabs.ai':
                downloads.append(url)
                return httpx.Response(200,content=b'glTFsynthetic' if url.endswith('.glb') else b'\x1f\x8bsynthetic-spz')
            if request.method=='HEAD': return httpx.Response(200 if url in uploaded else 404)
            if request.method=='POST': uploaded[url]=await request.aread();return httpx.Response(200)
            raise AssertionError((request.method,url))
        original=httpx.AsyncClient
        transport=httpx.MockTransport(handle)
        accounts=SimpleNamespace(url='https://project.example',key='synthetic-service-key')
        world={'id':'test-world','splatUrl':'https://cdn.marble.worldlabs.ai/test.spz','colliderUrl':'https://cdn.marble.worldlabs.ai/test.glb'}
        with patch.dict(os.environ,{'WORLD_ASSET_RETENTION_APPROVED':'true'}),patch('backend.world_archive.httpx.AsyncClient',side_effect=lambda **kwargs:original(transport=transport,**kwargs)):
            first=await archive_world(accounts,USER,JOB,world)
            second=await archive_world(accounts,USER,JOB,world)
        self.assertEqual(first,second);self.assertEqual(len(downloads),2);self.assertEqual(len(uploaded),2)
        self.assertNotIn('https://',str(first));self.assertEqual(first['storagePaths']['splatUrl'],USER+'/'+JOB+'/world.spz')
    async def test_no_archive_without_retention_permission(self):
        from backend.world_archive import archive_world
        with patch.dict(os.environ,{'WORLD_ASSET_RETENTION_APPROVED':'false'}):
            with self.assertRaises(HTTPException):await archive_world(None,USER,JOB,{})

class JournalIdentityTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_adapter_rejects_anonymous_and_malformed_accounts_for_every_provider(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://existing.supabase.test','SUPABASE_SERVICE_ROLE_KEY':'synthetic-service-key'},clear=True):
            for provider in ('google','email'):
                for profile in ({'id':USER,'is_anonymous':True},{'id':'invalid-id'}):
                    with self.subTest(provider=provider,profile=profile):
                        response={**profile,'identities':[{'provider':provider}]}
                        requests=[]
                        def handle(request):
                            requests.append(request.url.path)
                            return httpx.Response(200,json=response)
                        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
                            with self.assertRaises(HTTPException) as error:
                                await authenticated_journal_user('Bearer synthetic-session',SupabaseWorlds(client))
                            self.assertEqual(error.exception.status_code,401)
                        self.assertEqual(requests,['/auth/v1/user'])
