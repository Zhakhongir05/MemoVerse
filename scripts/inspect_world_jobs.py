"""Read-only owner diagnostic. No credentials, photographs, stories, or user IDs in output."""
import os,json,urllib.request,urllib.error,hashlib

def request(url,headers,body=None):
    req=urllib.request.Request(url,headers=headers,data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req,timeout=20) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as error:return error.code,{}

def main():
    base=os.environ['SUPABASE_URL'].rstrip('/');key=os.environ['SUPABASE_SERVICE_ROLE_KEY']
    headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json'}
    status,jobs=request(base+'/rest/v1/world_generation_jobs?select=id,user_id,status,model,operation_id,world_id,reserved_credits,journal_entry_id,allowance_released,created_at,updated_at&order=created_at.desc',headers)
    print('OWNER_DIAGNOSTIC jobs_http',status,flush=True)
    if status!=200:raise RuntimeError('Cannot inspect job records')
    for job in jobs:
        job['account_hash']=hashlib.sha256(job.pop('user_id').encode()).hexdigest()[:12]
        print('OWNER_DIAGNOSTIC job',json.dumps(job),flush=True)
    status,config=request(base+'/rest/v1/world_generation_demo?select=model,credits_per_job,reserved_credits,credit_budget,max_in_flight,max_new_per_hour,max_new_per_day',headers)
    print('OWNER_DIAGNOSTIC config',status,json.dumps(config),flush=True)
    status,schema=request(base+'/rest/v1/',{**headers,'Accept':'application/openapi+json'})
    print('OWNER_DIAGNOSTIC rpc_paths',status,json.dumps([p for p in schema.get('paths',{}) if p.startswith('/rpc/')]),flush=True)
    status,entries=request(base+'/rest/v1/journal_entries?select=id,world&limit=100',headers)
    print('OWNER_DIAGNOSTIC journal',status,json.dumps([{'id':e['id'],'has_world':bool(e.get('world')),'world_id':(e.get('world') or {}).get('id')} for e in entries] if isinstance(entries,list) else {}),flush=True)
    wheaders={'WLT-Api-Key':os.environ['WLT_API_KEY'],'Content-Type':'application/json'}
    status,worlds=request('https://api.worldlabs.ai/marble/v1/worlds:list',wheaders,{'page_size':100})
    print('OWNER_DIAGNOSTIC provider_worlds',status,json.dumps({'worlds':[{k:w.get(k) for k in ('world_id','created_at','tags','model')} for w in worlds.get('worlds',[])],'next_page_token':worlds.get('next_page_token')}),flush=True)
    status,credits=request('https://api.worldlabs.ai/marble/v1/credits',wheaders)
    print('OWNER_DIAGNOSTIC credits',status,json.dumps(credits),flush=True)
if __name__=='__main__':main()
