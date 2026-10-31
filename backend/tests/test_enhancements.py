import io,json,math,unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from PIL import Image
from backend.main import app
from backend.agent import ScenePipeline,Settings
from backend.enhancements import Enhancement, EnhancementContext, EnhancementManifest, Calibration, CATALOG, manifest, raw_capture_to_render

WORLD='4fad570a-957c-43a7-b7c9-150945606413'
def item(**changes):
    return dict(id='bed-1',type='bed',assetId='bed-modern-01',position=[1,0,-2],rotation=[0,0,0],scale=[1,1,1],anchor='floor',confidence='low',memory='User supplied memory',**changes)
def context(**kwargs):return {'worldId':WORLD,'coordinateFrame':'render-y-up',**kwargs}
def completion(data):return SimpleNamespace(choices=[SimpleNamespace(finish_reason='stop',message=SimpleNamespace(content=json.dumps(data),refusal=None))])

class EnhancementTests(unittest.TestCase):
    def test_catalog_and_types(self):
        self.assertEqual(len(CATALOG),9)
        for asset,kind in CATALOG.items():
            p=item();p.update(assetId=asset,type=kind);Enhancement.model_validate(p)
        for patch in [dict(assetId='https://evil/model.glb'),dict(type='chair'),dict(url='https://evil')]:
            with self.assertRaises(ValueError):Enhancement.model_validate({**item(),**patch})
    def test_invalid_transforms(self):
        for patch in [dict(position=[math.nan,0,0]),dict(position=[0,0]),dict(scale=[0,1,1]),dict(scale=[21,1,1]),dict(rotation=[0,13,0]),dict(position=[True,0,0]),dict(id='bad/id')]:
            with self.assertRaises(ValueError):Enhancement.model_validate({**item(),**patch})
    def test_frames(self):
        self.assertEqual(raw_capture_to_render([1,2,3]),(1,-2,-3))
        self.assertEqual(raw_capture_to_render(raw_capture_to_render([1,2,3])),(1,2,3))
        with self.assertRaises(ValueError):EnhancementContext.model_validate(context(coordinateFrame='raw-glb'))
    def test_uncalibrated_and_metric(self):
        c=EnhancementContext.model_validate(context())
        m=manifest(c,[Enhancement.model_validate(item())],'ai')
        self.assertNotIn('unitsPerMeter',m.model_dump(exclude_none=True));self.assertEqual(m.scaleStatus,'uncalibrated')
        c.calibration=Calibration(pointA=[0,0,0],pointB=[3,0,0],distanceMeters=2,evidence='measured-scene-distance')
        self.assertEqual(manifest(c,[],'user').unitsPerMeter,1.5)
        with self.assertRaises(ValueError):Calibration(pointA=[0,0,0],pointB=[0,0,0],distanceMeters=2,evidence='measured-scene-distance')
    def test_surfaces_and_user_edits(self):
        for surface,y in [('floor',-2),('ceiling',3),('none',1)]:
            c=EnhancementContext.model_validate(context(proposals=[item()],evidence=[dict(id='bed-1',position=[1,y,-2],surface=surface,kind='collider-hit')]))
            p=manifest(c,c.proposals,'user').enhancements[0]
            self.assertEqual(p.position[1],y);self.assertEqual(p.anchor,surface);self.assertEqual(p.confidence,'low')
        c=EnhancementContext.model_validate(context(proposals=[item()],evidence=[dict(id='bed-1',position=[2,3,4],surface='floor',kind='user-adjusted',rotation=[0,1.5,0])]))
        p=manifest(c,c.proposals,'user').enhancements[0]
        self.assertEqual(p.anchor,'none');self.assertEqual(p.confidence,'medium');self.assertEqual(p.rotation,(0,1.5,0));self.assertEqual(p.memory,'User supplied memory')
    def test_duplicate_and_unknown_evidence(self):
        for values in [dict(proposals=[item(),item()]),dict(evidence=[dict(id='unknown',position=[0,0,0],surface='floor',kind='collider-hit')])]:
            with self.assertRaises(ValueError):EnhancementContext.model_validate(context(**values))
    def test_endpoint_edit_and_existing_contract(self):
        with TestClient(app) as client:
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context(proposals=[item()]))})
            self.assertEqual(r.status_code,200);EnhancementManifest.model_validate(r.json());self.assertEqual(r.headers['cache-control'],'no-store')
            self.assertEqual(client.get('/health').status_code,200)
            self.assertEqual(client.post('/api/generate-enhancements',data={'context':'{}'}).status_code,422)
    def test_mocked_ai_and_failure(self):
        analysis=dict(objects=[],spatial_layout='A desk beside a window',lighting='Bright',colors=['white'],uncertainty='No metric evidence')
        vision=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock(return_value=completion(analysis)))))
        planner=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock(return_value=completion({'enhancements':[item()]})))))
        b=io.BytesIO();Image.new('RGB',(32,32),'white').save(b,format='PNG')
        with TestClient(app) as client:
            app.state.pipeline=ScenePipeline(Settings(demo_mode=False),vision,planner)
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context(story='My supplied story'))},files={'photo':('synthetic.png',b.getvalue(),'image/png')})
            self.assertEqual(r.status_code,200);self.assertEqual(r.json()['source'],'ai');self.assertEqual(r.json()['enhancements'][0]['memory'],'User supplied memory')
            planner.chat.completions.create.return_value=completion({'enhancements':[{**item(),'memory':''}]})
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context(story='My supplied story'))},files={'photo':('synthetic.png',b.getvalue(),'image/png')})
            self.assertEqual(r.json()['enhancements'][0]['memory'],'My supplied story')
            planner.chat.completions.create.return_value=completion({'enhancements':[{**item(),'assetId':'bad'}]})
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context())},files={'photo':('synthetic.png',b.getvalue(),'image/png')})
            self.assertEqual(r.json()['source'],'demo');self.assertTrue(r.json()['fallback'])
    def test_invalid_and_oversized_photo(self):
        with TestClient(app) as client:
            for data,status in [(b'not-an-image',422),(b'x'*(5*1024*1024+1),413)]:
                r=client.post('/api/generate-enhancements',data={'context':json.dumps(context())},files={'photo':('bad.jpg',data,'image/jpeg')})
                self.assertEqual(r.status_code,status)
    def test_demo_never_invents_furniture(self):
        with TestClient(app) as client:
            app.state.pipeline=ScenePipeline(Settings(demo_mode=True))
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context())})
            self.assertEqual(r.json()['enhancements'],[]);self.assertTrue(r.json()['fallback'])
