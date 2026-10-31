"""World Labs jobs and 3-per-account allowances in the existing Supabase database."""
import base64
import hashlib
import os
import re
from datetime import datetime,timedelta,timezone
from urllib.parse import urlparse
from uuid import uuid4
import httpx
from fastapi import APIRouter,Depends,File,Form,HTTPException,UploadFile
from .world_accounts import get_accounts,authenticated_user
router=APIRouter()
BASE='https://api.worldlabs.ai/marble/v1'

def enabled():
    if os.getenv('WORLD_GENERATION_ENABLED','false').lower()!='true' or not os.getenv('WLT_API_KEY'):
        raise HTTPException(503,'New world generation is currently unavailable. You can revisit saved worlds.')

def provider_datetime(value):
    # PostgreSQL JSON timestamps can trim fractional trailing zeros. Normalize
    # those fractions for the Python 3.9 local test runtime as well as Python 3.12.
    value=value.replace('Z','+00:00')
    value=re.sub(r'\.(\d{1,6})(?=[+-]\d{2}:\d{2}$)',lambda m:'.'+m.group(1).ljust(6,'0'),value)
    result=datetime.fromisoformat(value)
    if result.tzinfo is None:raise ValueError('Timezone required')
    return result

async def provider(method, path, body=None):
    key = os.getenv('WLT_API_KEY', '')
    if not key: raise HTTPException(503, 'World Labs credentials are not configured.')
    try:
        async with httpx.AsyncClient(timeout=20 if method=='POST' else 10, follow_redirects=False) as client:
            response = await client.request(method, BASE + '/' + path, headers={'WLT-Api-Key': key}, json=body)
            if response.status_code in (404, 410): raise HTTPException(410, 'World Labs job or world expired.')
            response.raise_for_status()
            return response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, 'World Labs request failed. The job will not be resubmitted automatically.') from None

def asset_url(value):
    url = urlparse(value or '')
    if url.scheme != 'https' or not url.hostname or not (url.hostname == 'worldlabs.ai' or url.hostname.endswith('.worldlabs.ai')) or url.username or url.password:
        raise HTTPException(502, 'World Labs returned an unsupported asset URL.')
    return value

def world_result(world):
    try:
        assets = world['assets']; spz = assets['splats']['spz_urls']
        balanced = spz.get('500k') or spz.get('100k') or spz.get('full_res')
        result = {'id': world['id'], 'splatUrl': asset_url(balanced), 'fullResUrl': asset_url(spz.get('full_res') or balanced), 'colliderUrl': asset_url(assets['mesh']['collider_mesh_url'])}
        # Return generated image assets too, never a backend filesystem path.
        if assets.get('thumbnail_url'):
            result['thumbnailUrl'] = asset_url(assets['thumbnail_url'])
        if (assets.get('imagery') or {}).get('pano_url'):
            result['panoramaUrl'] = asset_url(assets['imagery']['pano_url'])
        return result
    except (KeyError, TypeError):
        raise HTTPException(502, 'World Labs result is missing its SPZ or collider.') from None

@router.get('/api/world-config')
async def world_config(accounts=Depends(get_accounts)):
    try:
        enabled();result=await accounts.rpc('mv_world_config',{})
        return result
    except HTTPException:
        return {'enabled':False,'limit':3,'message':'New world generation is currently unavailable. Explore a saved world instead.'}

@router.get('/api/world-account')
async def account_state(user_id=Depends(authenticated_user),accounts=Depends(get_accounts)):
    return await accounts.rpc('mv_world_account',{'p_user_id':user_id})

@router.post('/api/world-jobs',status_code=202)
async def create_job(story: str=Form(...),photo: UploadFile=File(...),approved: bool=Form(False),user_id=Depends(authenticated_user),accounts=Depends(get_accounts)):
    from .main import validate_photo,MAX_PHOTO_BYTES
    from starlette.concurrency import run_in_threadpool
    try:
        enabled()
        if not approved:raise HTTPException(400,'Please confirm that your photograph and story may be sent to World Labs.')
        story=story.strip()
        if not story or len(story)>2000:raise HTTPException(422,'Enter a memory of 1–2000 characters.')
        data=await photo.read(MAX_PHOTO_BYTES+1)
        if len(data)>MAX_PHOTO_BYTES:raise HTTPException(413,'Photo is too large.')
        await run_in_threadpool(validate_photo,data,photo.content_type)
        submission=hashlib.sha256(b'memoverse-world-v2\0'+hashlib.sha256(data).digest()+b'\0'+story.encode()).hexdigest()
        claim=await accounts.rpc('mv_world_reserve',{'p_user_id':user_id,'p_submission':submission,'p_job_id':str(uuid4())})
        job=claim['job']
        if not claim['fresh']:return job
        # A committed SQL reservation is required before this ONE paid POST.
        try:
            operation=await provider('POST','worlds:generate',{'display_name':'MemoVerse memory','model':claim['model'],'permission':{'public':False},'tags':['ku-inthon-demo',job['job_id']],
                'world_prompt':{'type':'image','text_prompt':story,'image_prompt':{'source':'data_base64','data_base64':base64.b64encode(data).decode()}}})
            operation_id=operation['operation_id']
            if not isinstance(operation_id,str) or not re.fullmatch(r'[A-Za-z0-9-]{1,128}',operation_id):raise ValueError()
            expires=operation.get('expires_at')
            if expires:
                try:
                    provider_datetime(expires)
                except (TypeError,ValueError,AttributeError):expires=None
            updates={'status':'pending','operation_id':operation_id,'expires_at':expires,'message':'World Labs is creating your world…'}
        except (HTTPException,ValueError,KeyError,TypeError):
            updates={'status':'unknown','message':'Submission needs owner review. Your allowance is reserved; this job will not be submitted again automatically.'}
        return await accounts.rpc('mv_world_finish',{'p_user_id':user_id,'p_job_id':job['job_id'],'p_lease':None,'p_update':updates})
    finally:await photo.close()

@router.get('/api/world-jobs/{job_id}')
async def get_job(job_id: str,user_id=Depends(authenticated_user),accounts=Depends(get_accounts)):
    from uuid import UUID
    try:job_id=str(UUID(job_id))
    except ValueError:raise HTTPException(404,'World not found for this account.') from None
    lease=str(uuid4())
    claim=await accounts.rpc('mv_world_poll',{'p_user_id':user_id,'p_job_id':job_id,'p_lease':lease})
    job=claim['job']
    if not claim['poll']:return job
    updates={'status':'pending','message':'World Labs is creating your world…'}
    try:
        expires=job.get('expires_at')
        deadline=provider_datetime(expires) if expires else provider_datetime(job.get('created',datetime.now(timezone.utc).isoformat()))+timedelta(hours=1)
        if deadline<=datetime.now(timezone.utc):
            updates={'status':'expired','message':'This world job expired. No automatic charged retry.'}
        else:
            operation=await provider('GET','operations/'+claim['operation_id'])
            if operation.get('error'):updates={'status':'failed','message':'World Labs could not finish this world. The reservation is retained for billing review.'}
            elif operation.get('done'):
                world=operation.get('response') or {}
                if not world.get('assets'):
                    world_id=world.get('world_id') or (operation.get('metadata') or {}).get('world_id')
                    if not isinstance(world_id,str) or not re.fullmatch(r'[A-Za-z0-9-]{1,128}',world_id):raise ValueError()
                    world=await provider('GET','worlds/'+world_id);world=world.get('world',world)
                assets=world_result(world);updates={'status':'succeeded','world':assets,'world_id':assets['id'],'message':'Your new world is ready.'}
    except HTTPException as error:
        updates={'status':'expired','message':'This world expired. No automatic charged retry.'} if error.status_code==410 else {'status':'pending','message':'Progress is temporarily unavailable. Resume this existing job shortly.'}
    except (ValueError,TypeError,KeyError,AttributeError):updates={'status':'failed','message':'World Labs returned an invalid result. No automatic charged retry.'}
    return await accounts.rpc('mv_world_finish',{'p_user_id':user_id,'p_job_id':job_id,'p_lease':lease,'p_update':updates})
