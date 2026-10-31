import asyncio
import copy
import io
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import httpx
from fastapi.testclient import TestClient
from openai import AsyncOpenAI
from PIL import Image
from pydantic import ValidationError
from backend.main import app, get_pipeline, MAX_PHOTO_BYTES
from backend.agent import Settings, ScenePipeline, mock_scene
from backend.schemas import Scene, GenerateResponse

ANALYSIS = {'objects': [{'description': 'a wooden desk', 'location': 'left foreground'}], 'spatial_layout': 'Desk near a wall.', 'lighting': 'Soft window light.', 'colors': ['brown', 'white'], 'uncertainty': 'No exact dimensions can be inferred.'}

def image(fmt='PNG'):
    out = io.BytesIO()
    Image.new('RGB', (32, 32), (140, 90, 60)).save(out, format=fmt)
    return out.getvalue()

def completion(data, finish='stop'):
    content = data if isinstance(data, str) else json.dumps(data)
    return SimpleNamespace(choices=[SimpleNamespace(finish_reason=finish, message=SimpleNamespace(content=content, refusal=None))])

def client_mock(result):
    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock(return_value=result))))

class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.pipeline = ScenePipeline(Settings())
        app.dependency_overrides[get_pipeline] = lambda: self.pipeline
        self.ctx = TestClient(app)
        self.client = self.ctx.__enter__()
    def tearDown(self):
        self.ctx.__exit__(None, None, None)
        app.dependency_overrides.clear()
    def post(self, data=None, photo=None):
        return self.client.post('/api/generate-scene', data={'story': 'My old room'} if data is None else data,
                                files={'photo': ('photo.png', image(), 'image/png')} if photo is None else photo)
    def test_health_and_existing_root(self):
        self.assertEqual(self.client.get('/health').status_code, 200)
        self.assertEqual(self.client.get('/health').json(), {'status': 'ok'})
        self.assertEqual(self.client.get('/').json(), {'project': 'MemoVerse', 'status': 'ok'})
        self.assertEqual(app.title, 'MemoVerse Backend')
    def test_missing_photo(self):
        response = self.client.post('/api/generate-scene', data={'story': 'My room'})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()['detail'][0]['loc'], ['body', 'photo'])
    def test_empty_missing_long_story(self):
        for story in ['', '   ', 'x' * 2001]:
            response = self.post({'story': story})
            self.assertEqual(response.status_code, 422)
            self.assertNotIn('input', response.json()['detail'][0])
        self.assertEqual(self.post({}).status_code, 422)
    def test_invalid_signature_mime_and_corrupt_image(self):
        for payload, mime in [(b'bad', 'image/png'), (image(), 'image/jpeg'), (b'\x89PNG\r\n\x1a\ninvalid', 'image/png'), (b'', 'image/png'), (image('GIF'), 'image/gif')]:
            response = self.post(photo={'photo': ('fake.png', payload, mime)})
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(response.json()['detail'][0]['type'], 'invalid_image')
    def test_oversized_file_and_body(self):
        for size in [MAX_PHOTO_BYTES + 1, MAX_PHOTO_BYTES + 100000]:
            response = self.post(photo={'photo': ('large.png', b'x' * size, 'image/png')})
            self.assertEqual(response.status_code, 413, response.text)
            self.assertEqual(response.json()['detail'][0]['type'], 'file_too_large')
    def test_chunked_body_limit_and_cors_error(self):
        response = self.client.post('/api/generate-scene',
            content=iter([b'x' * 1000000 for _ in range(6)]),
            headers={'Content-Type': 'multipart/form-data; boundary=test', 'Origin': 'http://localhost:5173'})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
        self.assertEqual(response.json()['detail'][0]['type'], 'file_too_large')

    def test_supported_images_and_exact_demo_envelope(self):
        for fmt, mime in [('JPEG', 'image/jpeg'), ('PNG', 'image/png'), ('WEBP', 'image/webp')]:
            response = self.post(photo={'photo': ('photo', image(fmt), mime)})
            self.assertEqual(response.status_code, 200, response.text)
            data = response.json()
            self.assertEqual(set(data), {'scene', 'source', 'fallback', 'reason'})
            self.assertEqual(data, {'scene': mock_scene().model_dump(mode='json'), 'source': 'mock', 'fallback': True, 'reason': 'demo_mode'})
            self.assertEqual(set(data['scene']), {'title', 'environment', 'mood', 'objects'})
            self.assertEqual(set(data['scene']['objects'][0]), {'id', 'type', 'position', 'scale', 'memory', 'audioUrl'})
            GenerateResponse.model_validate(data)
    def test_successful_endpoint_with_mocked_providers(self):
        self.pipeline = ScenePipeline(Settings(demo_mode=False), client_mock(completion(ANALYSIS)), client_mock(completion(mock_scene().model_dump())))
        response = self.post()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'scene': mock_scene().model_dump(mode='json'), 'source': 'ai', 'fallback': False, 'reason': None})
    def test_invalid_provider_output_endpoint(self):
        self.pipeline = ScenePipeline(Settings(demo_mode=False), client_mock(completion(ANALYSIS)), client_mock(completion('{invalid')))
        response = self.post()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['reason'], 'invalid_model_output')
        self.assertEqual(response.json()['source'], 'mock')
    def test_cors_and_schema_proposal(self):
        for origin, allowed in [('http://localhost:5173', True), ('https://untrusted.example', False)]:
            response = self.client.options('/api/generate-scene', headers={'Origin': origin, 'Access-Control-Request-Method': 'POST'})
            self.assertEqual('access-control-allow-origin' in response.headers, allowed)
        self.assertEqual(self.client.get('/api/scene-schema').json()['status'], 'proposal_pending_renderer_confirmation')

class SchemaTests(unittest.TestCase):
    def test_rejects_unsafe_scene_values(self):
        scene = mock_scene().model_dump()
        changes = [{'type': 'mesh'}, {'position': [11, 0, 0]}, {'position': [float('nan'), 0, 0]}, {'position': [True, 0, 0]}, {'scale': [0, 1, 1]}, {'scale': [-1, 1, 1]}, {'scale': [6, 1, 1]}, {'scale': [1, 1]}, {'audioUrl': 'https://evil.test/a.mp3'}, {'id': '<script>'}]
        for change in changes:
            data = copy.deepcopy(scene)
            data['objects'][0].update(change)
            with self.subTest(change=change), self.assertRaises(ValidationError):
                Scene.model_validate(data)
        for data in [dict(scene, objects=[scene['objects'][0]] * 8), dict(scene, objects=[scene['objects'][0]] * 2), dict(scene, objects=[]), dict(scene, extra='no'), dict(scene, mood='serene')]:
            with self.assertRaises(ValidationError):
                Scene.model_validate(data)

class PipelineTests(unittest.IsolatedAsyncioTestCase):
    async def test_lablup_endpoint_configuration(self):
        import os
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'test-openai', 'DEEPSEEK_API_KEY': 'test-lablup', 'DEMO_MODE': 'false', 'DEEPSEEK_BASE_URL': 'https://api.console.lablup.ai/v1', 'DEEPSEEK_MODEL': 'DeepSeek-V4.1-Flash-B300'}):
            settings = Settings.from_env()
        pipeline = ScenePipeline(settings)
        try:
            self.assertEqual(str(pipeline.deepseek.base_url), 'https://api.console.lablup.ai/v1/')
            self.assertEqual(str(pipeline.openai.base_url), 'https://api.openai.com/v1/')
            self.assertEqual(settings.deepseek_model, 'DeepSeek-V4.1-Flash-B300')
        finally:
            await pipeline.close()
        with self.assertRaises(ValueError):
            ScenePipeline(Settings(deepseek_base_url='https://untrusted.example'))

    async def test_sdk_wire_format_and_provider_separation(self):
        requests = []
        async def handle(request):
            requests.append(request)
            payload = ANALYSIS if request.url.host == 'api.openai.com' else mock_scene().model_dump()
            return httpx.Response(200, json={'id': 'test', 'object': 'chat.completion', 'created': 1, 'model': 'test', 'choices': [{'index': 0, 'finish_reason': 'stop', 'message': {'role': 'assistant', 'content': json.dumps(payload)}}]})
        async with AsyncOpenAI(api_key='test-openai', http_client=httpx.AsyncClient(transport=httpx.MockTransport(handle))) as vision, AsyncOpenAI(api_key='test-deepseek', base_url='https://api.deepseek.com', http_client=httpx.AsyncClient(transport=httpx.MockTransport(handle))) as planner:
            result = await ScenePipeline(Settings(demo_mode=False), vision, planner).generate('Written memory only', image(), 'image/png')
        self.assertEqual(result.source, 'ai')
        self.assertEqual([r.url.host for r in requests], ['api.openai.com', 'api.deepseek.com'])
        first, second = [json.loads(r.content) for r in requests]
        self.assertTrue(first['messages'][1]['content'][1]['image_url']['url'].startswith('data:image/png;base64,'))
        self.assertNotIn('Written memory only', json.dumps(first))
        self.assertEqual(first['model'], 'gpt-4.1-mini')
        self.assertEqual(second['model'], 'deepseek-flash')
        self.assertEqual(second['response_format'], {'type': 'json_object'})
        self.assertNotIn('base64', json.dumps(second))
        self.assertEqual(json.loads(second['messages'][1]['content'])['photo_analysis'], ANALYSIS)
    async def test_invalid_empty_truncated_deepseek(self):
        for output in [completion(''), completion('   '), completion('not json'), completion(mock_scene().model_dump(), 'length'), completion({'objects': []})]:
            pipeline = ScenePipeline(Settings(demo_mode=False), client_mock(completion(ANALYSIS)), client_mock(output))
            result = await pipeline.generate('My room', image(), 'image/png')
            self.assertEqual(result.reason, 'invalid_model_output')
            self.assertTrue(result.fallback)
    async def test_invalid_vision_does_not_call_deepseek(self):
        second = client_mock(completion(mock_scene().model_dump()))
        result = await ScenePipeline(Settings(demo_mode=False), client_mock(completion('bad')), second).generate('story', image(), 'image/png')
        self.assertEqual(result.reason, 'invalid_model_output')
        second.chat.completions.create.assert_not_awaited()
    async def test_timeout_and_provider_failure(self):
        vision = client_mock(completion(ANALYSIS))
        async def slow(**kwargs):
            await asyncio.sleep(.1)
        vision.chat.completions.create.side_effect = slow
        result = await ScenePipeline(Settings(demo_mode=False, timeout=.001), vision, client_mock(None)).generate('story', image(), 'image/png')
        self.assertEqual(result.reason, 'provider_timeout')
        from openai import APIConnectionError
        vision.chat.completions.create.side_effect = APIConnectionError(request=httpx.Request('POST', 'https://api.openai.com'))
        result = await ScenePipeline(Settings(demo_mode=False), vision, client_mock(None)).generate('story', image(), 'image/png')
        self.assertEqual(result.reason, 'provider_failure')
    async def test_missing_keys_and_demo_do_not_call_providers(self):
        result = await ScenePipeline(Settings(demo_mode=False)).generate('story', image(), 'image/png')
        self.assertEqual(result.reason, 'missing_credentials')
        client = client_mock(None)
        result = await ScenePipeline(Settings(), client, client).generate('story', image(), 'image/png')
        self.assertEqual(result.reason, 'demo_mode')
        client.chat.completions.create.assert_not_awaited()
    async def test_fallback_disabled_is_structured_http_error(self):
        pipeline = ScenePipeline(Settings(demo_mode=False, allow_fallback=False))
        app.dependency_overrides[get_pipeline] = lambda: pipeline
        try:
            with TestClient(app) as client:
                response = client.post('/api/generate-scene', data={'story': 'A story'}, files={'photo': ('photo.png', image(), 'image/png')})
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json()['detail'][0]['type'], 'missing_credentials')
        finally:
            app.dependency_overrides.clear()

if __name__ == '__main__':
    unittest.main()
