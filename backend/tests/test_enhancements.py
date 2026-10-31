import io,json,math,unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from fastapi.testclient import TestClient
from PIL import Image
from backend.main import app
from backend.agent import ScenePipeline,Settings
from backend.enhancements import Enhancement, EnhancementContext, EnhancementManifest, Calibration, CATALOG, PERSON_TERMS, manifest, raw_capture_to_render, sanitize_ai_memory

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
        plan={'enhancements':[item()]}
        create=AsyncMock(side_effect=lambda **kwargs: completion(analysis if isinstance(kwargs['messages'][1]['content'],list) else plan))
        vision=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        b=io.BytesIO();Image.new('RGB',(32,32),'white').save(b,format='PNG')
        with TestClient(app) as client:
            app.state.pipeline=ScenePipeline(Settings(demo_mode=False),vision,None)
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context(story='My supplied story'))},files={'photo':('synthetic.png',b.getvalue(),'image/png')})
            self.assertEqual(r.status_code,200);self.assertEqual(r.json()['source'],'ai');self.assertEqual(r.json()['enhancements'][0]['memory'],'User supplied memory')
            planned=json.loads(create.await_args_list[1].kwargs['messages'][1]['content'])
            self.assertEqual(planned['written_memory'],'My supplied story')
            plan={'enhancements':[{**item(),'memory':''}]}
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context(story='My supplied story'))},files={'photo':('synthetic.png',b.getvalue(),'image/png')})
            self.assertEqual(r.json()['enhancements'][0]['memory'],'My supplied story')
            plan={'enhancements':[{**item(),'type':'curtains','assetId':'curtains-01'}]}
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

    def test_photo_position_is_optional_and_clamped(self):
        from backend.schemas import PhotoAnalysis
        base=dict(description='A stool',location='Right of the island')
        for value,expected in [([0.2,0.8],(0.2,0.8)),([2,-1],(1.0,0.0)),([1],None),(['a','b'],None),('nope',None)]:
            obj=PhotoAnalysis.model_validate(dict(objects=[{**base,'photoPosition':value}],spatial_layout='Near the island',lighting='Bright',colors=['white'],uncertainty='Approximate'))
            self.assertEqual(obj.objects[0].photoPosition,expected)
        self.assertEqual(Enhancement.model_validate({**item(),'photoPosition':[2,-1]}).photoPosition,(1.0,0.0))
        self.assertIsNone(Enhancement.model_validate({**item(),'photoPosition':'left'}).photoPosition)
        c=EnhancementContext.model_validate(context())
        m=manifest(c,[Enhancement.model_validate({**item(),'photoPosition':[0.25,0.75]})],'ai')
        self.assertEqual(m.enhancements[0].photoPosition,(0.25,0.75))

    def test_ai_memory_never_mentions_people(self):
        for text,expected in [
            ('A stool on which the boy is sitting.',''),
            ('A wooden stool beside the island. The boy sits on it.','A wooden stool beside the island.'),
            ('A basket near her chair.',''),
            ('A pendant light above the island.','A pendant light above the island.'),
        ]:
            self.assertEqual(sanitize_ai_memory(text),expected)
        c=EnhancementContext.model_validate(context())
        # AI memory is cleaned; a user's own words are never rewritten.
        self.assertEqual(manifest(c,[Enhancement.model_validate({**item(),'memory':'A stool on which the boy is sitting.'})],'ai').enhancements[0].memory,'')
        self.assertEqual(manifest(c,[Enhancement.model_validate({**item(),'memory':'My grandfather sat here.'})],'user').enhancements[0].memory,'My grandfather sat here.')

    def test_endpoint_round_trips_photo_positions(self):
        analysis=dict(objects=[dict(description='A wooden stool',location='Right of the island',photoPosition=[0.8,0.6])],spatial_layout='Stool beside an island',lighting='Bright',colors=['white'],uncertainty='Approximate relationships only')
        plan={'enhancements':[{**item(),'photoPosition':[0.8,0.6]}]}
        create=AsyncMock(side_effect=[completion(analysis),completion(plan)])
        vision=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        b=io.BytesIO();Image.new('RGB',(32,32),'white').save(b,format='PNG')
        with TestClient(app) as client:
            app.state.pipeline=ScenePipeline(Settings(demo_mode=False),vision,None)
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context())},files={'photo':('synthetic.png',b.getvalue(),'image/png')})
            self.assertEqual(r.status_code,200);self.assertEqual(r.json()['enhancements'][0]['photoPosition'],[0.8,0.6])
            self.assertIn('photoPosition',create.await_args_list[0].kwargs['messages'][0]['content'])
            planned=json.loads(create.await_args_list[1].kwargs['messages'][1]['content'])
            self.assertEqual(planned['photo_analysis']['objects'][0]['photoPosition'],[0.8,0.6])

    def test_endpoint_strips_people_from_ai_memory(self):
        analysis=dict(objects=[],spatial_layout='A stool beside an island',lighting='Bright',colors=['white'],uncertainty='Approximate relationships only')
        plan={'enhancements':[{**item(),'memory':'A stool on which the boy sits at the island.'}]}
        create=AsyncMock(side_effect=[completion(analysis),completion(plan)])
        vision=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        b=io.BytesIO();Image.new('RGB',(32,32),'white').save(b,format='PNG')
        with TestClient(app) as client:
            app.state.pipeline=ScenePipeline(Settings(demo_mode=False),vision,None)
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context())},files={'photo':('synthetic.png',b.getvalue(),'image/png')})
            self.assertEqual(r.status_code,200);self.assertEqual(r.json()['source'],'ai')
            memory=r.json()['enhancements'][0]['memory']
            self.assertEqual(memory,'');self.assertIsNone(PERSON_TERMS.search(memory))

    def test_one_unusable_proposal_does_not_discard_the_rest(self):
        # A single unmappable object (or an oversized list) used to fail the whole
        # reply and silently fall back to no furniture.
        good=item()
        analysis=dict(objects=[{'description':f'Object {n}','location':'Floor','photoPosition':[.5,.5]} for n in range(25)],
            spatial_layout='',lighting='',colors=['white']*12,uncertainty='')
        plan={'enhancements':[good,{**item(),'id':'bad-1','type':'curtains','assetId':'curtain-01'},{**item(),'id':'bad-2','position':[0,0]}]}
        create=AsyncMock(side_effect=[completion(analysis),completion(plan)])
        vision=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        b=io.BytesIO();Image.new('RGB',(32,32),'white').save(b,format='PNG')
        with TestClient(app) as client:
            app.state.pipeline=ScenePipeline(Settings(demo_mode=False),vision,None)
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context())},files={'photo':('synthetic.png',b.getvalue(),'image/png')})
            self.assertEqual(r.status_code,200);self.assertEqual(r.json()['source'],'ai')
            self.assertEqual([e['id'] for e in r.json()['enhancements']],['bed-1'])
            observed=json.loads(create.await_args_list[1].kwargs['messages'][1]['content'])['photo_analysis']
            self.assertEqual(len(observed['objects']),20)
            self.assertEqual(observed['spatial_layout'],'Layout not stated')

    def test_truncated_vision_reply_is_retried_once(self):
        truncated=SimpleNamespace(choices=[SimpleNamespace(finish_reason='length',message=SimpleNamespace(content='{"objects": [',refusal=None))])
        analysis=dict(objects=[],spatial_layout='A desk beside a window',lighting='Bright',colors=['white'],uncertainty='Approximate')
        plan={'enhancements':[item()]}
        create=AsyncMock(side_effect=[truncated,completion(analysis),completion(plan)])
        vision=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        b=io.BytesIO();Image.new('RGB',(32,32),'white').save(b,format='PNG')
        with TestClient(app) as client:
            app.state.pipeline=ScenePipeline(Settings(demo_mode=False),vision,None)
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context())},files={'photo':('synthetic.png',b.getvalue(),'image/png')})
            self.assertEqual(r.status_code,200);self.assertEqual(r.json()['source'],'ai')
            self.assertEqual(create.await_count,3)
            self.assertEqual(create.await_args_list[0].kwargs['max_completion_tokens'],2600)
            self.assertEqual(create.await_args_list[1].kwargs['max_completion_tokens'],4000)

    def test_truncated_plan_is_retried_once(self):
        truncated=SimpleNamespace(choices=[SimpleNamespace(finish_reason='length',message=SimpleNamespace(content='{"enhancements": [',refusal=None))])
        analysis=dict(objects=[],spatial_layout='A desk beside a window',lighting='Bright',colors=['white'],uncertainty='Approximate')
        create=AsyncMock(side_effect=[completion(analysis),truncated,completion({'enhancements':[item()]})])
        vision=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        b=io.BytesIO();Image.new('RGB',(32,32),'white').save(b,format='PNG')
        with TestClient(app) as client:
            app.state.pipeline=ScenePipeline(Settings(demo_mode=False),vision,None)
            r=client.post('/api/generate-enhancements',data={'context':json.dumps(context())},files={'photo':('synthetic.png',b.getvalue(),'image/png')})
            self.assertEqual(r.status_code,200);self.assertEqual(r.json()['source'],'ai')
            self.assertEqual(create.await_count,3)
            self.assertEqual(create.await_args_list[1].kwargs['max_completion_tokens'],4000)
            self.assertEqual(create.await_args_list[2].kwargs['max_completion_tokens'],6000)

    def test_everyday_names_map_onto_approved_assets(self):
        # The planner names furniture the way a person would; those names must
        # render as an approved mesh instead of being dropped.
        from backend.enhancements import parse_plan
        from backend.agent import PipelineFailure
        plan={'enhancements':[
            {**item(),'id':'bench-1','type':'bench','assetId':'bench-01'},
            {**item(),'id':'nightstand-1','type':'Nightstand','assetId':'nightstand-wood'},
            {**item(),'id':'ceiling-1','type':'chandelier','assetId':'chandelier-01','anchor':'ceiling'},
            {**item(),'id':'chair-1','type':'bench','assetId':'chair-modern-01'},
            {**item(),'id':'curtain-1','type':'curtains','assetId':'curtains-01'},
        ]}
        got={e.id:(e.type,e.assetId) for e in parse_plan(completion(plan)).enhancements}
        self.assertEqual(got['bench-1'],('chair','chair-modern-01'))
        self.assertEqual(got['nightstand-1'],('desk','desk-modern-01'))
        self.assertEqual(got['ceiling-1'],('pendant','pendant-warm-01'))
        self.assertEqual(got['chair-1'],('chair','chair-modern-01'))
        self.assertNotIn('curtain-1',got)
        with self.assertRaises(PipelineFailure):
            parse_plan(completion({'enhancements':[{**item(),'type':'curtains','assetId':'curtains-01'}]}))

    def test_two_distinct_photos_reach_vision_and_mocked_planner(self):
        analysis=dict(objects=[],spatial_layout='A visible furniture item',lighting='Bright',colors=['white'],uncertainty='Approximate relationships only')
        bed=item();chair={**item(),'id':'chair-1','type':'chair','assetId':'chair-modern-01'}
        vision=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock(side_effect=[completion(analysis),completion({'enhancements':[bed]}),completion(analysis),completion({'enhancements':[chair]})]))))
        with TestClient(app) as client:
            app.state.pipeline=ScenePipeline(Settings(demo_mode=False),vision,None)
            outputs=[]
            for color in ['red','blue']:
                b=io.BytesIO();Image.new('RGB',(32,32),color).save(b,format='PNG')
                r=client.post('/api/generate-enhancements',data={'context':json.dumps(context())},files={'photo':('synthetic.png',b.getvalue(),'image/png')})
                self.assertEqual(r.status_code,200);self.assertEqual(r.json()['source'],'ai')
                outputs.append(r.json()['enhancements'][0]['type'])
            photos=[call.kwargs['messages'][1]['content'][0]['image_url']['url'] for call in vision.chat.completions.create.await_args_list if isinstance(call.kwargs['messages'][1]['content'],list)]
            self.assertNotEqual(photos[0],photos[1]);self.assertEqual(outputs,['bed','chair'])
