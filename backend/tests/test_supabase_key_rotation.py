"""Only synthetic credentials and mocked transports; no live Supabase calls."""
import os
import unittest
from unittest.mock import patch
import httpx
from backend.world_accounts import SupabaseWorlds,supabase_headers
from backend.memorycast_store import TourStore

class KeyRotationTests(unittest.IsolatedAsyncioTestCase):
    async def test_new_secret_key_only_uses_apikey_for_service_rpc(self):
        requests=[]
        def handle(req):
            requests.append(req)
            return httpx.Response(200,json={'enabled':True,'limit':3})
        with patch.dict(os.environ,{'SUPABASE_URL':'https://test.supabase.co','SUPABASE_SERVICE_ROLE_KEY':'sb_secret_synthetic_fixture'}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
                result=await SupabaseWorlds(client).rpc('mv_world_config',{})
        self.assertEqual(result['limit'],3)
        self.assertEqual(requests[0].headers['apikey'],'sb_secret_synthetic_fixture')
        self.assertNotIn('authorization',requests[0].headers)
    async def test_user_session_still_uses_user_bearer_jwt(self):
        self.assertEqual(supabase_headers('sb_secret_synthetic','user-jwt'),{'apikey':'sb_secret_synthetic','Authorization':'Bearer user-jwt'})
    async def test_legacy_service_role_behavior_preserved(self):
        self.assertEqual(supabase_headers('synthetic-legacy-key'),{'apikey':'synthetic-legacy-key','Authorization':'Bearer synthetic-legacy-key'})
    async def test_private_storage_uses_new_secret_without_invalid_bearer(self):
        requests=[]
        def handle(req):requests.append(req);return httpx.Response(200,json={'signedURL':'/object/sign/test'})
        with patch.dict(os.environ,{'SUPABASE_URL':'https://test.supabase.co','SUPABASE_SERVICE_ROLE_KEY':'sb_secret_synthetic_fixture'}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
                await TourStore(client).storage('POST','object/sign/memorycast-audio/test',body={'expiresIn':900})
        self.assertNotIn('authorization',requests[0].headers)
