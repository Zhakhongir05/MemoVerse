import base64, io, json, os, unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from PIL import Image
from pydantic import ValidationError
from backend.agent import Settings, ScenePipeline, PipelineFailure, mock_scene
from backend.schemas import GenerateResponse

def completion(value):
    return SimpleNamespace(choices=[SimpleNamespace(finish_reason='stop', message=SimpleNamespace(content=json.dumps(value), refusal=None))])
def client(fn):
    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock(side_effect=fn))))
class RealGenerationTests(unittest.IsolatedAsyncioTestCase):
    async def test_defaults_fail_closed(self):
        with patch.dict(os.environ, {}, clear=True): settings=Settings.from_env()
        self.assertFalse(settings.demo_mode); self.assertFalse(settings.allow_fallback)
        with self.assertRaises(PipelineFailure) as result: await ScenePipeline(settings).generate('memory',b'image','image/png')
        self.assertEqual(result.exception.code,'missing_credentials')
    async def test_two_images_ground_different_metadata(self):
        async def vision(**args):
            encoded=args['messages'][1]['content'][1]['image_url']['url'].split(',')[1]
            with Image.open(io.BytesIO(base64.b64decode(encoded))) as image: color='red' if image.getpixel((0,0))[0]>100 else 'blue'
            return completion({'objects':[{'description':color+' chair','location':'left'}],'spatial_layout':'Chair beside wall','lighting':'Daylight','colors':[color],'uncertainty':'Unknown scale'})
        async def planner(**args):
            data=json.loads(args['messages'][1]['content']); color=data['photo_analysis']['colors'][0]
            scene=mock_scene().model_dump();scene['title']=color+' memory';scene['objects'][0]['memory']=data['written_memory'];scene['objects'][0]['position']=[-2 if color=='red' else 2,0,-2]
            return completion(scene)
        first,second=client(vision),client(planner);pipeline=ScenePipeline(Settings(),first,second);results=[]
        for color in ['red','blue']:
            out=io.BytesIO();Image.new('RGB',(4,4),color).save(out,'PNG');results.append(await pipeline.generate('My '+color+' chair',out.getvalue(),'image/png'))
        self.assertNotEqual(results[0].scene,results[1].scene);self.assertTrue(all(r.source=='ai' and not r.fallback for r in results))
        self.assertEqual(first.chat.completions.create.await_count,2);self.assertEqual(second.chat.completions.create.await_count,2)
    async def test_invalid_output_never_becomes_demo_by_default(self):
        async def invalid(**args): return completion({})
        with self.assertRaises(PipelineFailure): await ScenePipeline(Settings(),client(invalid),client(invalid)).generate('story',b'image','image/png')
    def test_envelope_rejects_false_provenance(self):
        with self.assertRaises(ValidationError): GenerateResponse(scene=mock_scene(),source='ai',fallback=True,reason='demo_mode')
    async def test_provider_timeout_keeps_safe_stage(self):
        import httpx
        from openai import APITimeoutError
        async def timeout(**args): raise APITimeoutError(request=httpx.Request('POST','https://api.openai.com'))
        with self.assertRaises(PipelineFailure) as failure:
            await ScenePipeline(Settings(),client(timeout),client(timeout)).generate('story',b'photo','image/png')
        self.assertEqual(failure.exception.code,'provider_timeout');self.assertEqual(failure.exception.stage,'vision')
