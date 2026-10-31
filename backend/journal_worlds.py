"""Journal-bound generation. No provider submission from journal saves or GETs."""
import base64
import os
import re
from urllib.parse import quote
from uuid import UUID, uuid4
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from .world_accounts import authenticated_journal_user, get_accounts, supabase_headers
from .worlds import enabled, provider, create_memory_world, get_job, ProviderRejected

router = APIRouter()
BUCKET = 'memory-worlds'

class ReliveRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    photoIndex: int = Field(default=0, ge=0, le=5)
    approved: bool = False

def memory_uuid(value):
    try: return str(UUID(value))
    except ValueError: raise HTTPException(404, 'Memory not found for this account.') from None

async def storage(accounts, method, path, *, body=None, headers=None):
    auth = supabase_headers(accounts.key)
    auth.update(headers or {})
    try:
        async with httpx.AsyncClient(timeout=45, follow_redirects=False) as client:
            r = await client.request(method, accounts.url+'/storage/v1/'+path, headers=auth, json=body)
            r.raise_for_status()
            return r
    except httpx.HTTPError:
        raise HTTPException(503, 'Private world storage is unavailable. No automatic generation retry.') from None

async def public_job(accounts, user_id, job):
    # Never persist signed URLs. Mint fresh, short-lived references on each read.
    if job.get('status') != 'succeeded': return job
    saved = job.get('world') or {}
    world = {'id': saved.get('id')}
    for key in ('splatUrl', 'colliderUrl'):
        path = (saved.get('storagePaths') or {}).get(key)
        prefix = user_id+'/'+job['job_id']+'/'
        if not isinstance(path, str) or not path.startswith(prefix) or '..' in path.split('/'):
            raise HTTPException(503, 'Saved world assets require recovery; generation will not be repeated.')
        # Verify the private asset still exists before declaring the world ready.
        await storage(accounts, 'HEAD', 'object/authenticated/'+BUCKET+'/'+quote(path, safe='/'))
        r = await storage(accounts, 'POST', 'object/sign/'+BUCKET+'/'+quote(path, safe='/'), body={'expiresIn': 3600})
        signed = r.json().get('signedURL')
        if not isinstance(signed, str) or not signed.startswith('/object/sign/'):
            raise HTTPException(503, 'Could not authorize the saved world assets.')
        world[key] = accounts.url+'/storage/v1'+signed
    world['fullResUrl'] = world['splatUrl']
    world['source'] = 'worldlabs'
    tour_audio = {}
    for chapter in (job.get('guided_tour') or {}).get('chapters', []):
        path = chapter.get('audioPath')
        if not path: continue
        if not path.startswith(user_id+'/'+job['memory_id']+'/') or '..' in path.split('/'):
            raise HTTPException(503, 'Saved narration needs ownership recovery.')
        r = await storage(accounts, 'POST', 'object/sign/memory-assets/'+quote(path, safe='/'), body={'expiresIn':3600})
        signed = r.json().get('signedURL')
        if not isinstance(signed,str) or not signed.startswith('/object/sign/'):
            raise HTTPException(503, 'Saved narration is temporarily unavailable.')
        tour_audio[chapter['id']] = accounts.url+'/storage/v1'+signed
    return {**job, 'world': world, 'assetExpiresIn': 3600, 'tourAudio':tour_audio}

async def resolve_world(accounts, user_id, memory_id):
    """Read both installed binding versions before considering a new reservation."""
    params = {'p_user_id': user_id, 'p_memory_id': memory_id}
    modern = None
    try:
        modern = await accounts.rpc('mv_journal_world', params)
    except HTTPException as error:
        if error.status_code != 503: raise
    if modern and modern.get('status') not in ('none', 'legacy_recovery'):
        if modern['status'] in ('pending', 'submitting'):
            # Serverless deployments cannot rely on a separate durable worker.
            updated = await get_job(modern['job_id'], user_id, accounts, journal=True)
            modern = {**modern, **updated}
        return await public_job(accounts, user_id, modern)
    try:
        saved = await accounts.rpc('mv_world_memory', params)
    except HTTPException as error:
        if error.status_code != 503 or modern is None: raise
        return modern
    job = saved.get('job')
    metadata = saved.get('world') or {}
    if not job and metadata.get('jobId') and metadata.get('source') == 'worldlabs':
        # An older tab may have stored the result before journal bindings existed.
        # The job RPC verifies ownership; never trust browser-supplied asset URLs.
        job = await get_job(metadata['jobId'], user_id, accounts)
        if (job.get('world') or {}).get('id') != metadata.get('id'):
            raise HTTPException(409, 'This saved world needs ownership recovery. No new world was generated.')
    if not job:
        if metadata.get('id') and metadata.get('source') not in ('sample', 'mock'):
            return {'status': 'legacy_recovery', 'memory_id': memory_id}
        return modern or {'status': 'none', 'memory_id': memory_id}
    if job['status'] in ('pending', 'submitting'):
        job = await get_job(job['job_id'], user_id, accounts)
    job = {**job, 'memory_id': memory_id, 'revision': 0}
    if (job.get('world') or {}).get('storagePaths'):
        return await public_job(accounts, user_id, job)
    return job

@router.get('/api/journal/{memory_id}/world')
async def read_world(memory_id: str, user_id=Depends(authenticated_journal_user), accounts=Depends(get_accounts)):
    return await resolve_world(accounts, user_id, memory_uuid(memory_id))

@router.post('/api/journal/{memory_id}/world', status_code=202)
async def relive(memory_id: str, request: ReliveRequest, user_id=Depends(authenticated_journal_user), accounts=Depends(get_accounts)):
    memory_id = memory_uuid(memory_id)
    # Supabase verifies the existing session before ownership or quota operations.
    params = {'p_user_id': user_id, 'p_memory_id': memory_id}
    existing = await resolve_world(accounts, user_id, memory_id)
    # Saved worlds and pending reservations reopen even after the budget is spent.
    if existing['status'] != 'none': return existing
    try:
        await accounts.rpc('mv_journal_world', params)
    except HTTPException as error:
        if error.status_code != 503: raise
        job = await create_memory_world(memory_id, request.approved, request.photoIndex, user_id, accounts)
        return {**job, 'memory_id': memory_id, 'revision': 0}
    if not request.approved: raise HTTPException(400, 'Confirm sending this memory photograph to World Labs.')
    enabled()
    if os.getenv('WORLD_ASSET_RETENTION_APPROVED', 'false').lower() != 'true':
        raise HTTPException(503, 'Durable world storage requires confirmed provider retention permissions.')
    claim = await accounts.rpc('mv_journal_reserve', {**params, 'p_photo_index': request.photoIndex, 'p_job_id': str(uuid4())})
    job = claim['job']
    if not claim['fresh']: return await public_job(accounts, user_id, job)
    # One committed reservation authorizes at most one POST. A timeout or DB
    # failure remains ambiguous; never automatically resubmit/refund a paid job.
    try:
        photo = claim['photo']
        r = await storage(accounts, 'GET', 'object/authenticated/memory-assets/'+quote(photo['path'], safe='/'))
        from .main import validate_photo, MAX_PHOTO_BYTES
        if len(r.content) > MAX_PHOTO_BYTES: raise ValueError()
        validate_photo(r.content, photo['type'])
        result = await provider('POST', 'worlds:generate', {
            'display_name': 'MemoVerse memory', 'model': claim['model'],
            'permission': {'public': False}, 'tags': ['memoverse-journal', job['job_id'].replace('-','')],
            'world_prompt': {'type': 'image', 'text_prompt': claim['story'][:2000],
                'image_prompt': {'source': 'data_base64', 'data_base64': base64.b64encode(r.content).decode()}}})
        operation = result['operation_id']
        if not isinstance(operation, str) or not re.fullmatch(r'[A-Za-z0-9-]{1,128}', operation): raise ValueError()
        updates = {'status': 'pending', 'operation_id': operation, 'message': 'Creating your memory world…'}
    except ProviderRejected as error:
        updates={'status':'failed','rejected':True,'diagnostics':error.diagnostics}
    except Exception:
        updates = {'status': 'unknown', 'message': 'This reservation needs billing review. No automatic paid retry.'}
    return await accounts.rpc('mv_world_finish', {'p_user_id': user_id, 'p_job_id': job['job_id'], 'p_lease': None, 'p_update': updates})

from typing import List, Optional
from .enhancements import EnhancementManifest, Vector, Identifier
from .schemas import ContractModel

class SavedAnchor(ContractModel):
    id: Identifier
    position: Vector
    memory: str = Field(default='', max_length=2000)

class SavedChapter(ContractModel):
    id: Identifier
    narration: str = Field(max_length=6000)
    anchorIds: List[Identifier] = Field(default_factory=list, max_length=40)
    audioPath: Optional[str] = Field(default=None, max_length=500)

class SavedTour(ContractModel):
    chapters: List[SavedChapter] = Field(max_length=3)
    language: str = Field(default='en', pattern=r'^[a-z]{2}(-[A-Z]{2})?$')
    source: str = Field(default='saved', pattern=r'^(ai|sample|saved)$')

class MemoryExperience(ContractModel):
    revision: int = Field(ge=0)
    enhancements: Optional[EnhancementManifest] = None
    anchors: List[SavedAnchor] = Field(default_factory=list, max_length=40)
    guidedTour: Optional[SavedTour] = None

@router.post('/api/journal/{memory_id}/experience')
async def save_experience(memory_id: str, experience: MemoryExperience, user_id=Depends(authenticated_journal_user), accounts=Depends(get_accounts)):
    memory_id = memory_uuid(memory_id)
    job = await accounts.rpc('mv_journal_world', {'p_user_id': user_id, 'p_memory_id': memory_id})
    if job.get('status') != 'succeeded': raise HTTPException(409, 'Load a completed memory world first.')
    if len({a.id for a in experience.anchors}) != len(experience.anchors): raise HTTPException(422, 'Anchor IDs must be unique.')
    if experience.enhancements and experience.enhancements.worldId != job['world']['id']:
        raise HTTPException(422, 'Furniture belongs to a different world.')
    if experience.guidedTour:
        ids = {a.id for a in experience.anchors}
        for chapter in experience.guidedTour.chapters:
            if any(x not in ids for x in chapter.anchorIds): raise HTTPException(422, 'Tour references an unknown anchor.')
            if chapter.audioPath and (not chapter.audioPath.startswith(user_id+'/'+memory_id+'/') or '..' in chapter.audioPath.split('/')):
                raise HTTPException(422, 'Audio must belong to this memory in private storage.')
    if experience.guidedTour and len({c.id for c in experience.guidedTour.chapters}) != len(experience.guidedTour.chapters):
        raise HTTPException(422, 'Chapter IDs must be unique.')
    return await accounts.rpc('mv_journal_experience', {'p_user_id': user_id, 'p_memory_id': memory_id, 'p_revision': experience.revision, 'p_data': experience.model_dump(mode='json')})
