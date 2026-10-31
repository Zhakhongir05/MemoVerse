import asyncio
import copy
import io
import json
import os
import unittest
import wave
from types import SimpleNamespace
from unittest.mock import AsyncMock,patch
from uuid import uuid4
import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.main import app
from backend.world_accounts import get_accounts
from backend.memorycast import get_tour_provider
from backend.memorycast_store import TourStore,get_tour_store
from backend.memorycast_schema import context_for,fingerprint,TourDraft,render_tour
from backend.memorycast_provider import TourProvider,audio_duration,normalize_wav

A='11111111-1111-4111-8111-111111111111';B='22222222-2222-4222-8222-222222222222';M='33333333-3333-4333-8333-333333333333'
def memory():return {'id':M,'title':'Rain at the window','story':'I listened to the rain by the wooden desk.','mood':'Nostalgic','photos':[],'scene':{'objects':[{'id':'desk-1','type':'desk','position':[1,0,-2],'memory':'The wooden desk by the window.'}]},'world':{'id':'owned-world'}}
def wav():
    out=io.BytesIO()
    with wave.open(out,'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(8000);f.writeframes(b'\x00\x00'*8000)
    return out.getvalue()
def draft(context,include_photo=True):return TourDraft.model_validate({'journal_reading':{'interpretation':'The entry recalls listening beside the desk; emotion is not explicitly stated.','evidence_quote':context['sources'].get('journal:story','')[:100]},'chapters':[{'order':i+1,'narration':'The wooden desk sits beside the window. Your entry recalls listening to the rain there.','anchor_id':'desk-1' if context['anchors'] else None,'excerpts':[{'source_id':'journal:story','quote':context['sources']['journal:story'][:100]}]+([{'source_id':k,'quote':v[:100]} for k,v in context['sources'].items() if k.startswith('photo:')][:1] if include_photo else []),'ambience':'quiet'} for i in range(3)]})
def completion(value):
    value=copy.deepcopy(value)
    if 'chapters' in value:
        for c in value['chapters']:c['source_ids']=[e['source_id'] for e in c.pop('excerpts',[])]
    return SimpleNamespace(choices=[SimpleNamespace(finish_reason='stop',message=SimpleNamespace(content=json.dumps(value),refusal=None))])

class Contracts(unittest.TestCase):
    def test_fingerprint_ignores_sync_timestamps_but_tracks_actual_edits(self):
        m=memory();base=fingerprint(context_for(m,A,'en'));m['updated_at']='tomorrow';self.assertEqual(base,fingerprint(context_for(m,A,'en')))
        m['story']='A different saved story.';self.assertNotEqual(base,fingerprint(context_for(m,A,'en')))
        self.assertNotEqual(base,fingerprint(context_for(memory(),A,'ko')))
    def test_saved_scene_is_artistic_context_not_personal_evidence(self):
        m=memory();m['scene'].update({'title':'Symbolic reading room','environment':'bedroom','mood':'nostalgic'})
        ctx=context_for(m,A,'en')
        self.assertTrue(ctx['visualization']['interpretation_only'])
        self.assertEqual(ctx['visualization']['object_types'],['desk'])
        self.assertFalse(any(k.startswith('visualization:') for k in ctx['sources']))
        prior=fingerprint(ctx);m['scene']['environment']='garden'
        self.assertNotEqual(prior,fingerprint(context_for(m,A,'en')))
    def test_only_valid_existing_anchors_are_spatial_targets(self):
        m=memory();m['scene']['objects'] += [{'id':'bad','position':[True,0,0]},{'id':'far','position':[100,0,0]},{'id':'nan','position':[float('nan'),0,0]}]
        ctx=context_for(m,A,'en');self.assertEqual([a['id'] for a in ctx['anchors']],['desk-1'])
        script=render_tour(draft(ctx),ctx);self.assertEqual(script['chapters'][1]['camera']['target'],[1,0,-2]);self.assertEqual(len(script['chapters']),3)
        self.assertEqual(script['chapters'][-1]['title'],'Reflection')
    def test_missing_anchors_get_safe_poses_and_no_fabricated_personal_story(self):
        m=memory();m['scene']=None;ctx=context_for(m,A,'en');tour=render_tour(draft(ctx),ctx)
        self.assertIsNone(tour['chapters'][0]['anchor_id']);self.assertEqual(tour['chapters'][0]['camera']['position'],[.25,.1,.45])
        self.assertNotIn('Take a breath',tour['chapters'][0]['narration'])
    def test_unknown_anchor_invented_quote_or_extra_prose_is_rejected(self):
        ctx=context_for(memory(),A,'en')
        value=draft(ctx);value.chapters[0].anchor_id='invented';self.assertRaises(ValueError,render_tour,value,ctx)
        value=draft(ctx);value.chapters[0].excerpts[0].quote='My grandfather took me there.';self.assertRaises(ValueError,render_tour,value,ctx)
        value=draft(ctx);value.chapters[0].narration='Take a deep breath. There is no need to hurry.';self.assertRaises(ValueError,render_tour,value,ctx)
        data=draft(ctx).model_dump();data['narration']='Invented';self.assertRaises(ValueError,TourDraft.model_validate,data)
        value=draft(ctx);value.chapters[0].order=3;self.assertRaises(ValueError,render_tour,value,ctx)
    def test_evidence_accepts_case_and_typography_but_not_invention(self):
        from backend.memorycast_schema import copied_excerpt
        self.assertTrue(copied_excerpt('I used to look for the birds','i used to look for the birds'))
        self.assertFalse(copied_excerpt('My father watched birds with me','i used to look for the birds'))
    def test_feeling_interpretation_requires_real_journal_evidence(self):
        ctx=context_for(memory(),A,'en');value=draft(ctx)
        value.journal_reading.evidence_quote='I felt grief when my grandfather left.'
        self.assertRaises(ValueError,render_tour,value,ctx)
    def test_chapters_cannot_ignore_photo_or_journal(self):
        ctx=context_for(memory(),A,'en');ctx['sources']['photo:1']='A wooden desk by the window.'
        value=draft(ctx,include_photo=False);self.assertRaises(ValueError,render_tour,value,ctx)
    def test_private_photos_must_belong_to_this_account_and_memory(self):
        m=memory();m['photos']=[{'path':B+'/'+M+'/p.jpg','type':'image/jpeg'}];self.assertRaises(ValueError,context_for,m,A,'en')
        m['photos'][0]['path']=A+'/'+M+'/../p.jpg';self.assertRaises(ValueError,context_for,m,A,'en')
    def test_audio_requires_decodable_bounded_wav(self):
        self.assertEqual(audio_duration(wav()),1)
        for data in [b'fake-mp3',wav()[:-100],b'\0'*(8*1024*1024+1)]:
            with self.assertRaises((ValueError,wave.Error,EOFError)):audio_duration(data)

class Providers(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'MEMORYCAST_SCRIPT_PROVIDER':'deepseek'});self.env.start();self.addCleanup(self.env.stop)
    async def test_openai_script_mode_does_not_require_lablup_access(self):
        ctx=context_for(memory(),A,'en');create=AsyncMock(return_value=completion(draft(ctx).model_dump()))
        pipeline=SimpleNamespace(openai=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))),deepseek=None,settings=SimpleNamespace(openai_model='existing-openai-model'))
        with patch.dict(os.environ,{'MEMORYCAST_SCRIPT_PROVIDER':'openai','MEMORYCAST_SCRIPT_MODEL':'existing-openai-model'}):
            provider=TourProvider(pipeline);self.assertTrue(provider.configured());await provider.script(ctx)
        self.assertEqual(create.call_args.kwargs['model'],'existing-openai-model')
    async def test_only_evidence_edited_narration_is_returned(self):
        ctx=context_for(memory(),A,'en')
        before=draft(ctx).model_dump();before['chapters'][0]['narration']='Your grandfather waited with you beside the desk every Sunday.'
        after=draft(ctx).model_dump()
        create=AsyncMock(side_effect=[completion(before),completion(after)])
        pipeline=SimpleNamespace(deepseek=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))),openai=object(),settings=SimpleNamespace(deepseek_model='existing-lablup-model'))
        result=await TourProvider(pipeline).script(ctx)
        self.assertEqual(create.await_count,2)
        self.assertEqual(json.loads(create.call_args_list[0].kwargs['messages'][1]['content'])['visualization'],ctx['visualization'])
        self.assertEqual(json.loads(create.call_args_list[1].kwargs['messages'][1]['content'])['visualization'],ctx['visualization'])
        self.assertNotIn('grandfather',result['chapters'][0]['narration'])
        self.assertEqual(result['chapters'][0]['evidence'][0]['quote'],ctx['sources']['journal:story'])
    async def test_lablup_uses_existing_model_and_grounded_contract(self):
        ctx=context_for(memory(),A,'en');deep=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=AsyncMock(return_value=completion(draft(ctx).model_dump())))))
        pipeline=SimpleNamespace(deepseek=deep,openai=object(),settings=SimpleNamespace(deepseek_model='existing-lablup-model'))
        result=await TourProvider(pipeline).script(ctx);self.assertEqual(result['chapters'][0]['anchor_id'],'desk-1')
        call=deep.chat.completions.create.call_args.kwargs;self.assertEqual(call['model'],'existing-lablup-model');self.assertEqual(call['timeout'],12)
    async def test_spoken_script_preserves_photo_specific_prose_and_journal_evidence(self):
        outputs=[]
        for detail in ['A red chair beside a sunlit window.', 'A blue bicycle against a brick wall.']:
            ctx=context_for(memory(),A,'en');ctx['sources']['photo:1']=detail
            value=draft(ctx).model_dump()
            for c in value['chapters']:
                c['narration']=detail+' Your journal recalls listening to rain by the wooden desk.'
                c['excerpts']=[{'source_id':'photo:1','quote':detail},{'source_id':'journal:story','quote':ctx['sources']['journal:story']}]
            create=AsyncMock(return_value=completion(value))
            pipeline=SimpleNamespace(deepseek=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))),openai=object(),settings=SimpleNamespace(deepseek_model='existing-lablup-model'))
            result=await TourProvider(pipeline).script(ctx)
            self.assertEqual(result['chapters'][0]['narration'],value['chapters'][0]['narration'])
            self.assertIn(detail,result['chapters'][1]['narration'])
            self.assertNotIn('Take a breath',result['chapters'][0]['narration'])
            outputs.append(result)
        self.assertNotEqual(outputs[0]['chapters'][0]['narration'],outputs[1]['chapters'][0]['narration'])
    async def test_photo_evidence_is_required_when_a_photo_was_analyzed(self):
        ctx=context_for(memory(),A,'en');ctx['sources']['photo:1']='A red chair.'
        create=AsyncMock(return_value=completion(draft(ctx,include_photo=False).model_dump()))
        pipeline=SimpleNamespace(deepseek=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))),openai=object(),settings=SimpleNamespace(deepseek_model='existing-lablup-model'))
        with self.assertRaises(ValueError):await TourProvider(pipeline).script(ctx)
    async def test_saved_photo_vision_reuses_existing_openai_client(self):
        value={'objects':[{'description':'A red synthetic image','location':'center'}],'spatial_layout':'A flat test image','lighting':'Even light','colors':['red'],'uncertainty':'Synthetic test image only'}
        create=AsyncMock(return_value=completion(value))
        pipeline=SimpleNamespace(openai=SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))),settings=SimpleNamespace(openai_model='existing-vision-model'))
        result=await TourProvider(pipeline).vision(b'photo','image/png')
        self.assertIn('red synthetic',result);self.assertEqual(create.call_args.kwargs['model'],'existing-vision-model')
    async def test_streamed_wav_lengths_are_finalized_before_private_upload(self):
        streamed=bytearray(wav());streamed[4:8]=b'\xff'*4;streamed[40:44]=b'\xff'*4
        speech=AsyncMock(return_value=SimpleNamespace(content=bytes(streamed)))
        pipeline=SimpleNamespace(openai=SimpleNamespace(audio=SimpleNamespace(speech=SimpleNamespace(create=speech))))
        data,duration=await TourProvider(pipeline).speech('Synthetic test.','en')
        self.assertEqual(duration,1);self.assertEqual(data,wav())
        self.assertEqual(audio_duration(bytes(streamed)),1)
        with self.assertRaises(ValueError):normalize_wav(bytes(streamed)[:-1])
    async def test_openai_voice_returns_playable_wav_without_transcription(self):
        speech=AsyncMock(return_value=SimpleNamespace(content=wav()));pipeline=SimpleNamespace(openai=SimpleNamespace(audio=SimpleNamespace(speech=SimpleNamespace(create=speech))),deepseek=object())
        data,duration=await TourProvider(pipeline).speech('A real journal excerpt.','en');self.assertEqual(duration,1);self.assertEqual(data,wav())
        args=speech.call_args.kwargs;self.assertEqual(args['model'],'gpt-4o-mini-tts');self.assertEqual(args['voice'],'coral');self.assertEqual(args['response_format'],'wav')

class Accounts:
    async def user(self,token):
        if token not in ('account-a','account-b'):raise HTTPException(401,'Invalid session')
        return A if token=='account-a' else B

class Store:
    def __init__(self):self.memory=memory();self.jobs={};self.uploads={};self.signs=0;self.fail_upload=False
    async def journal(self,user,id):
        if user!=A or id!=M:raise HTTPException(404,'Memory not found')
        return self.memory
    async def photograph(self,path):
        from PIL import Image
        data=io.BytesIO();Image.new('RGB',(4,4),'red').save(data,'PNG');return data.getvalue()
    async def signed_audio(self,path):self.signs+=1;return 'https://existing.supabase.test/storage/v1/object/sign/memorycast-audio/'+path+'?token='+str(self.signs)
    async def upload(self,path,data):
        if self.fail_upload:raise HTTPException(503,'Storage unavailable')
        self.uploads[path]=data
    async def tour_rpc(self,name,p):
        if name=='mc_read':
            jobs=[v for v in self.jobs.values() if v['user_id']==p['p_user'] and v['memory_id']==p['p_memory'] and (not p['p_tour'] or v['id']==p['p_tour'])]
            return {'tour':copy.deepcopy(jobs[-1]) if jobs else None,'enabled':True}
        if name=='mc_reserve':
            matches=[v for v in self.jobs.values() if v['input_hash']==p['p_hash']]
            if matches:return {'fresh':False,'tour':copy.deepcopy(matches[0])}
            if self.jobs and not p['p_regenerate']:raise HTTPException(409,'Explicitly regenerate edited memory')
            t={'id':p['p_id'],'memory_id':p['p_memory'],'user_id':p['p_user'],'input_hash':p['p_hash'],'language':p['p_context']['language'],'mood':p['p_context']['mood'],'context':copy.deepcopy(p['p_context']),'script':None,'audio_paths':[],'audio_durations':[],'status':'pending','next_step':0,'total_steps':len(p['p_context']['photos'])+4,'lease':None}
            self.jobs[t['id']]=t;return {'fresh':True,'tour':copy.deepcopy(t)}
        t=self.jobs.get(p['p_id'])
        if not t or t['user_id']!=p['p_user']:raise HTTPException(404,'Tour not found')
        if name=='mc_claim':
            if t['status']!='pending' or t['lease']:return {'claimed':False,'tour':copy.deepcopy(t)}
            t['lease']=p['p_lease'];return {'claimed':True,'tour':copy.deepcopy(t)}
        if t['lease']!=p['p_lease']:return {'tour':copy.deepcopy(t)}
        update=p['p_update'];t['lease']=None;t['status']=update.get('status','pending')
        for key in ['context','script','message']:
            if key in update:t[key]=copy.deepcopy(update[key])
        if 'audio_path' in update:t['audio_paths'].append(update['audio_path']);t['audio_durations'].append(update['duration'])
        if t['status']=='pending':
            t['next_step']+=1
            if t['next_step']==t['total_steps']:t['status']='ready'
        return {'tour':copy.deepcopy(t)}

class Provider:
    def __init__(self):self.calls=[];self.timeout=False;self.invalid=False
    def configured(self):return True
    async def vision(self,data,mime):self.calls.append('vision');return 'A red synthetic photograph.'
    async def script(self,ctx):self.calls.append('script');return render_tour(draft(ctx),ctx)
    async def speech(self,text,language):
        self.calls.append('speech')
        if self.timeout:raise asyncio.TimeoutError()
        return (b'invalid' if self.invalid else wav()),1

class Routes(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'MEMORYCAST_LIVE_ENABLED':'true','OPENAI_API_KEY':'','DEEPSEEK_API_KEY':''});self.env.start()
        self.store=Store();self.provider=Provider()
        app.dependency_overrides.update({get_accounts:lambda:Accounts(),get_tour_store:lambda:self.store,get_tour_provider:lambda:self.provider})
        self.client=TestClient(app);self.client.__enter__();self.headers={'Authorization':'Bearer account-a'}
    def tearDown(self):self.client.__exit__(None,None,None);app.dependency_overrides.clear();self.env.stop()
    def create(self,**changes):return self.client.post('/api/memorycast/memories/'+M,headers=self.headers,json={'approved':True,**changes})
    def step(self,id,headers=None):return self.client.post('/api/memorycast/tours/'+id+'/advance',headers=headers or self.headers)
    def load(self):return self.client.get('/api/memorycast/memories/'+M,headers=self.headers)
    def ready(self):
        id=self.create().json()['tour']['id']
        for _ in range(4):self.assertEqual(self.step(id).status_code,200)
        return id
    def test_read_reports_disabled_flag_without_provider_calls(self):
        os.environ['MEMORYCAST_LIVE_ENABLED']='false'
        result=self.load().json()
        self.assertEqual(result['generation_reason'],'memorycast_disabled')
        self.assertFalse(result['generation_enabled']);self.assertEqual(self.provider.calls,[])
    def test_read_reports_missing_providers_without_charging(self):
        self.provider.configured=lambda:False
        self.assertEqual(self.load().json()['generation_reason'],'memorycast_providers_unconfigured')
        self.assertEqual(self.provider.calls,[])
    def test_private_photo_analysis_is_saved_before_personalized_script(self):
        self.store.memory['photos']=[{'path':A+'/'+M+'/photo.png','type':'image/png'}]
        id=self.create().json()['tour']['id']
        for _ in range(5):self.assertEqual(self.step(id).status_code,200)
        self.assertEqual(self.provider.calls,['vision','script','speech','speech','speech'])
        self.assertEqual(self.store.jobs[id]['context']['sources']['photo:1'],'A red synthetic photograph.')
    def test_saved_three_chapter_audio_replays_across_sessions_without_ai(self):
        self.ready();self.assertEqual(self.provider.calls,['script','speech','speech','speech']);self.assertEqual(len(self.store.uploads),3)
        for _ in range(4):
            result=self.load().json();self.assertEqual(result['tour']['status'],'ready');self.assertEqual(len(result['tour']['audio']),3)
            self.assertNotIn('context',result['tour']);self.assertNotIn('lease',result['tour']);self.assertFalse(result['stale'])
        self.assertEqual(len(self.provider.calls),4);self.assertEqual(self.create().json()['fresh'],False);self.assertEqual(len(self.provider.calls),4)
    def test_saved_korean_tour_reopens_without_a_false_language_edit(self):
        id=self.create(language='ko').json()['tour']['id']
        for _ in range(4):self.step(id)
        saved=self.load().json();self.assertFalse(saved['stale']);self.assertEqual(saved['tour']['language'],'ko')
    def test_changed_memory_requires_explicit_regenerate_and_keeps_old_audio(self):
        self.ready();self.store.memory['story']='A changed journal entry.';self.assertTrue(self.load().json()['stale'])
        self.assertEqual(self.create().status_code,409);self.assertEqual(self.create(regenerate=True).status_code,202);self.assertEqual(len(self.provider.calls),4)
    def test_authentication_ownership_consent_and_disabled_generation(self):
        self.assertEqual(self.client.get('/api/memorycast/memories/'+M).status_code,401)
        self.assertEqual(self.client.get('/api/memorycast/memories/'+M,headers={'Authorization':'Bearer account-b'}).status_code,404)
        self.assertEqual(self.create(approved=False).status_code,403)
        self.assertEqual(self.create(user_id=B).status_code,422)
        os.environ['MEMORYCAST_LIVE_ENABLED']='false';self.assertEqual(self.create().status_code,503);self.assertEqual(self.provider.calls,[])
    def test_other_account_cannot_advance_existing_job(self):
        id=self.create().json()['tour']['id'];self.assertEqual(self.step(id,{'Authorization':'Bearer account-b'}).status_code,404);self.assertEqual(self.provider.calls,[])
    def test_timeouts_invalid_audio_and_storage_failure_never_retry_paid_step(self):
        for mode in ['timeout','invalid','upload']:
            with self.subTest(mode=mode):
                self.store.jobs.clear();id=self.create().json()['tour']['id'];self.step(id)
                self.provider.timeout=mode=='timeout';self.provider.invalid=mode=='invalid';self.store.fail_upload=mode=='upload'
                result=self.step(id).json()['tour'];self.assertIn(result['status'],('failed','uncertain'));count=len(self.provider.calls)
                self.step(id);self.assertEqual(len(self.provider.calls),count)
    def test_ready_replay_still_works_with_generation_disabled(self):
        self.ready();os.environ['MEMORYCAST_LIVE_ENABLED']='false';result=self.load();self.assertEqual(result.status_code,200);self.assertFalse(result.json()['generation_enabled']);self.assertEqual(len(self.provider.calls),4)
    def test_corrupt_cross_account_storage_path_is_never_signed(self):
        id=self.ready();self.store.jobs[id]['audio_paths'][0]=B+'/'+M+'/'+id+'/1.wav'
        self.assertEqual(self.load().status_code,503);self.assertEqual(self.store.signs,0)

class StorageAdapter(unittest.IsolatedAsyncioTestCase):
    async def test_private_upload_and_signed_url_use_server_authority(self):
        seen=[]
        def handle(request):
            seen.append(request)
            if '/object/sign/' in str(request.url):return httpx.Response(200,json={'signedURL':'/object/sign/memorycast-audio/'+A+'/'+M+'/tour/1.wav?token=test'})
            return httpx.Response(200,json={})
        with patch.dict(os.environ,{'SUPABASE_URL':'https://existing.supabase.test','SUPABASE_SERVICE_ROLE_KEY':'server-test-only'}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
                store=TourStore(client);await store.upload(A+'/'+M+'/tour/1.wav',wav());url=await store.signed_audio(A+'/'+M+'/tour/1.wav')
        self.assertTrue(url.startswith('https://existing.supabase.test/'));self.assertEqual(seen[0].headers['x-upsert'],'false');self.assertEqual(seen[0].headers['authorization'],'Bearer server-test-only')
    async def test_external_signed_url_is_rejected(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://existing.supabase.test','SUPABASE_SERVICE_ROLE_KEY':'server-test-only'}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _:httpx.Response(200,json={'signedURL':'https://evil.test/audio'}))) as client:
                with self.assertRaises(HTTPException):await TourStore(client).signed_audio(A+'/'+M+'/tour/1.wav')

class StorageDiagnostics(unittest.IsolatedAsyncioTestCase):
    async def test_missing_rpc_has_specific_safe_error(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://test.supabase.co','SUPABASE_SERVICE_ROLE_KEY':'sb_secret_synthetic'}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request:httpx.Response(404,json={'message':'raw private diagnostics'}))) as client:
                with self.assertRaises(HTTPException) as caught:
                    await TourStore(client).tour_rpc('mc_read',{})
        self.assertEqual(caught.exception.status_code,503)
        self.assertEqual(caught.exception.detail['code'],'memorycast_schema_unavailable')
        self.assertNotIn('raw private',str(caught.exception.detail))
