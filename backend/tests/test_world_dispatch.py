"""Failure boundaries: queue durability, one paid POST, safe rejection diagnostics."""
import os
import unittest
from unittest.mock import patch
import httpx
from fastapi import HTTPException
from backend.worlds import provider, ProviderRejected
from backend.tests import test_worlds as fixtures
photo=fixtures.photo

class DispatchTests(unittest.TestCase):
    setUp=fixtures.WorldTests.setUp
    tearDown=fixtures.WorldTests.tearDown
    post=fixtures.WorldTests.post
    state=fixtures.WorldTests.state
    def test_enqueue_returns_before_provider_and_survives_client_close(self):
        result=self.client.post('/api/world-jobs',headers=self.headers,data={'story':'Saved memory','approved':'true'},files={'photo':('photo.png',photo(),'image/png')})
        self.assertEqual(result.status_code,202)
        self.assertEqual(result.json()['status'],'submitting')
        self.provider.assert_not_awaited()
        job_id=result.json()['job_id']
        # A separate worker or later browser session dispatches the persisted input.
        for _ in range(3):
            self.assertEqual(self.client.post('/api/world-jobs/'+job_id+'/dispatch',headers=self.headers).status_code,202)
        self.assertEqual(self.provider.await_count,1)
    def test_confirmed_rejection_is_distinct_from_ambiguous_timeout(self):
        self.provider.side_effect=ProviderRejected(422,['body.tags.1'])
        result=self.post()
        self.assertEqual(result.json()['status'],'failed')
        self.assertTrue(result.json()['allowance_released'])
    def test_other_account_cannot_dispatch_reserved_job(self):
        first=self.post().json()
        response=self.client.post('/api/world-jobs/'+first['job_id']+'/dispatch',headers={'Authorization':'Bearer account-b'})
        self.assertEqual(response.status_code,404)
        self.assertEqual(self.provider.await_count,1)

class ProviderResponseTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_422_path_preserves_only_safe_validation_locations(self):
        actual=httpx.AsyncClient
        async def handle(request):
            return httpx.Response(422,json={'detail':[{'loc':['body','tags',1],'msg':'bad','input':'PRIVATE INPUT'}]})
        with patch.dict(os.environ,{'WLT_API_KEY':'private-key'}),patch('backend.worlds.httpx.AsyncClient',lambda **kwargs:actual(transport=httpx.MockTransport(handle),**kwargs)):
            with self.assertRaises(ProviderRejected) as error:await provider('POST','worlds:generate',{})
        self.assertEqual(error.exception.diagnostics,{'http_status':422,'fields':['body.tags.1']})
        self.assertNotIn('PRIVATE',str(error.exception.diagnostics))
    async def test_5xx_and_transport_timeout_remain_ambiguous(self):
        actual=httpx.AsyncClient
        for mode in ('server','timeout'):
            def handle(request):
                if mode=='timeout':raise httpx.ReadTimeout('private upstream',request=request)
                return httpx.Response(500,text='private upstream')
            with patch.dict(os.environ,{'WLT_API_KEY':'private-key'}),patch('backend.worlds.httpx.AsyncClient',lambda **kwargs:actual(transport=httpx.MockTransport(handle),**kwargs)):
                with self.assertRaises(HTTPException) as error:await provider('POST','worlds:generate',{})
                self.assertNotIsInstance(error.exception,ProviderRejected)
