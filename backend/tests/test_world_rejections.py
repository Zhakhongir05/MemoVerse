import os
import unittest
from unittest.mock import patch
import httpx
from fastapi import HTTPException
from backend.worlds import provider, ProviderRejected

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
