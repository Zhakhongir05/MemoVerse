"""LOCAL BROWSER TEST FIXTURE ONLY. Never imported by production.
Existing Supabase auth and database requests use a local PostgreSQL-backed fixture.
World Labs responses and generated assets are all synthetic."""
import os
from datetime import datetime,timedelta,timezone
os.environ.update({'OPENAI_API_KEY':'','DEEPSEEK_API_KEY':'','DEMO_MODE':'true','WLT_API_KEY':'test-only-not-a-key','WORLD_GENERATION_ENABLED':'true','SUPABASE_URL':'https://existing.supabase.test','SUPABASE_SERVICE_ROLE_KEY':'test-service-role'})
from backend.main import app
from backend import worlds
from backend.world_accounts import SupabaseWorlds,get_accounts
accounts=SupabaseWorlds()
accounts.url='http://127.0.0.1:8036'  # Test-only override; production requires HTTPS.
app.dependency_overrides[get_accounts]=lambda:accounts
submitted=[];polls={}
async def fake_provider(method,path,body=None):
    if method=='POST':
        assert all(len(tag)<=32 for tag in body.get('tags',[]))
        submitted.append(body);key='op-'+str(len(submitted));polls[key]=0
        return {'operation_id':key,'expires_at':(datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()}
    if path.startswith('operations/'):
        key=path.split('/')[-1];polls[key]+=1;index=int(key.split('-')[-1])-1
        if '[fail]' in submitted[index]['world_prompt']['text_prompt']:return {'done':True,'error':{'code':'SYNTHETIC_FAILURE'}}
        if polls[key]<2:return {'done':False}
        return {'done':True,'response':{'world_id':'mock-world-'+str(index+1),'assets':{
            'splats':{'spz_urls':{'500k':'https://cdn.marble.worldlabs.ai/demo-generated.spz','full_res':'https://cdn.marble.worldlabs.ai/demo-generated-full.spz'}},
            'mesh':{'collider_mesh_url':'https://cdn.marble.worldlabs.ai/demo-collider.glb'},
            'thumbnail_url':'https://cdn.marble.worldlabs.ai/demo-thumb.png'}}}
    raise AssertionError('Unexpected mocked provider request')
worlds.provider=fake_provider
@app.get('/__test/stats')
async def stats():return {'submitted':len(submitted),'polls':polls}
