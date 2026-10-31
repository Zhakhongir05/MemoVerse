"""Explicit, disabled-by-default Marble jobs. No background tasks in serverless workers."""
import base64
import hashlib
import hmac
import json
import os
import sqlite3
import time
from datetime import datetime, timezone
from urllib.parse import urlparse
import httpx
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile

router = APIRouter()
BASE = 'https://api.worldlabs.ai/marble/v1'

class JobStore:
    """Redis REST for serverless; SQLite only on a persistent non-Vercel host."""
    def __init__(self):
        self.url = os.getenv('WORLD_REDIS_REST_URL', '')
        self.token = os.getenv('WORLD_REDIS_REST_TOKEN', '')
        self.path = os.getenv('WORLD_JOB_DB', '')
        if not self.url and (os.getenv('VERCEL') or not self.path):
            raise HTTPException(503, 'World generation requires durable job storage.')
        if self.url and (not self.url.startswith('https://') or not self.token):
            raise HTTPException(503, 'World job storage is not configured.')
        if not self.url:
            with sqlite3.connect(self.path) as db:
                db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, value TEXT NOT NULL)')
    async def redis(self, *command):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(self.url, headers={'Authorization': f'Bearer {self.token}'}, json=list(command))
                response.raise_for_status()
                payload = response.json()
                if payload.get('error'): raise ValueError()
                return payload['result']
        except (httpx.HTTPError, ValueError, KeyError):
            raise HTTPException(503, 'World job storage unavailable. No new generation was started.') from None
    async def get(self, key):
        if self.url:
            value = await self.redis('GET', 'memoverse:world:' + key)
        else:
            with sqlite3.connect(self.path) as db:
                row = db.execute('SELECT value FROM jobs WHERE id=?', (key,)).fetchone()
                value = row[0] if row else None
        return json.loads(value) if value else None
    async def reserve(self, key, value, cap):
        # Atomic across processes/instances. Reservations never expire automatically:
        # an ambiguous provider POST must never cause an automatic paid resubmission.
        if self.url:
            script = """if redis.call('EXISTS',KEYS[1])==1 then return 0 end
if tonumber(redis.call('GET',KEYS[2]) or '0')>=tonumber(ARGV[2]) then return -1 end
redis.call('SET',KEYS[1],ARGV[1]); redis.call('INCR',KEYS[2]); return 1"""
            result = await self.redis('EVAL', script, 2, 'memoverse:world:' + key, 'memoverse:world:budget', json.dumps(value), cap)
        else:
            with sqlite3.connect(self.path) as db:
                db.execute('BEGIN IMMEDIATE')
                if db.execute('SELECT 1 FROM jobs WHERE id=?', (key,)).fetchone(): return False
                if db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0] >= cap:
                    raise HTTPException(429, 'World generation budget reached. Contact the project owner.')
                db.execute('INSERT INTO jobs VALUES (?,?)', (key, json.dumps(value)))
            return True
        if result == -1: raise HTTPException(429, 'World generation budget reached. Contact the project owner.')
        return result == 1
    async def save(self, key, value):
        if self.url:
            await self.redis('SET', 'memoverse:world:' + key, json.dumps(value))
        else:
            with sqlite3.connect(self.path) as db:
                db.execute('UPDATE jobs SET value=? WHERE id=?', (json.dumps(value), key))

def authorize(authorization: str = Header(default='')):
    token = os.getenv('WORLD_GENERATION_ACCESS_TOKEN', '')
    if not token or not hmac.compare_digest(authorization, 'Bearer ' + token):
        raise HTTPException(403, 'A generation access code from the project owner is required.')

def get_store(): return JobStore()

async def provider(method, path, body=None):
    key = os.getenv('WLT_API_KEY', '')
    if not key: raise HTTPException(503, 'World Labs credentials are not configured.')
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
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
        return {'id': world['id'], 'splatUrl': asset_url(balanced), 'fullResUrl': asset_url(spz.get('full_res') or balanced), 'colliderUrl': asset_url(assets['mesh']['collider_mesh_url'])}
    except (KeyError, TypeError):
        raise HTTPException(502, 'World Labs result is missing its SPZ or collider.') from None

def public(job):
    return {key: job.get(key) for key in ['job_id', 'status', 'world', 'message', 'expires_at']}

@router.post('/api/world-jobs', dependencies=[Depends(authorize)], status_code=202)
async def create_job(story: str = Form(...), photo: UploadFile = File(...), approved: bool = Form(False), store=Depends(get_store)):
    from .main import validate_photo, MAX_PHOTO_BYTES
    from starlette.concurrency import run_in_threadpool
    try:
        if not approved: raise HTTPException(400, 'Explicit paid generation approval is required.')
        story = story.strip()
        if not story or len(story) > 2000: raise HTTPException(422, 'Enter a memory of 1–2000 characters.')
        data = await photo.read(MAX_PHOTO_BYTES + 1)
        if len(data) > MAX_PHOTO_BYTES: raise HTTPException(413, 'Photo is too large.')
        await run_in_threadpool(validate_photo, data, photo.content_type)
        model = os.getenv('WORLD_LABS_MODEL', 'marble-1.1')
        key = hashlib.sha256(b'memoverse-world-v1\0' + model.encode() + b'\0' + story.encode() + b'\0' + data).hexdigest()
        existing = await store.get(key)
        if existing: return public(existing)
        if os.getenv('WORLD_GENERATION_ENABLED', 'false').lower() != 'true':
            raise HTTPException(503, 'Paid world generation is disabled pending project-owner approval.')
        if not os.getenv('WLT_API_KEY'): raise HTTPException(503, 'World Labs credentials are not configured.')
        try:
            cap = int(os.getenv('WORLD_MAX_JOBS', '1'))
            if cap < 1: raise ValueError()
        except ValueError:
            raise HTTPException(503, 'World generation budget is not configured.') from None
        job = {'job_id': key, 'status': 'submitting', 'created': time.time(), 'message': 'Submitting world generation…'}
        if not await store.reserve(key, job, cap):
            return public(await store.get(key))
        try:
            operation = await provider('POST', 'worlds:generate', {'display_name': 'MemoVerse memory', 'model': model, 'permission': {'public': False}, 'world_prompt': {'type': 'image', 'text_prompt': story, 'image_prompt': {'source': 'data_base64', 'data_base64': base64.b64encode(data).decode()}}})
            operation_id = operation['operation_id']
            # IDs are provider data, never permit path injection.
            if not isinstance(operation_id, str) or not operation_id.replace('-', '').isalnum(): raise ValueError()
            job.update(status='pending', operation_id=operation_id, expires_at=operation.get('expires_at'), message='World Labs is generating your world…')
        except (HTTPException, KeyError, ValueError):
            job.update(status='unknown', message='Submission could not be confirmed. Contact the project owner; do not start another charged job.')
        await store.save(key, job)
        return public(job)
    finally:
        await photo.close()

@router.get('/api/world-jobs/{job_id}', dependencies=[Depends(authorize)])
async def get_job(job_id: str, store=Depends(get_store)):
    if len(job_id) != 64 or any(c not in '0123456789abcdef' for c in job_id): raise HTTPException(404, 'World job not found.')
    job = await store.get(job_id)
    if not job: raise HTTPException(404, 'World job not found.')
    if job['status'] != 'pending' or time.time() - job.get('checked', 0) < 5: return public(job)
    expires = job.get('expires_at')
    try:
        expired = bool(expires and datetime.fromisoformat(expires.replace('Z', '+00:00')) <= datetime.now(timezone.utc))
    except (ValueError, TypeError):
        raise HTTPException(502, 'World Labs returned an invalid job expiry.') from None
    if expired:
        job.update(status='expired', message='World job expired. Contact the project owner before generating again.')
    else:
        try:
            operation = await provider('GET', 'operations/' + job['operation_id'])
            if operation.get('error'):
                job.update(status='failed', message='World Labs generation failed. No automatic charged retry.')
            elif operation.get('done'):
                world = operation.get('response') or {}
                if not world.get('assets'):
                    world_id = world.get('world_id') or (operation.get('metadata') or {}).get('world_id')
                    if not isinstance(world_id, str) or not world_id.replace('-', '').isalnum(): raise HTTPException(502, 'World result is unavailable.')
                    world = await provider('GET', 'worlds/' + world_id)
                    world = world.get('world', world)
                job.update(status='succeeded', world=world_result(world), message='Your newly generated world is ready.')
        except HTTPException as error:
            if error.status_code == 410: job.update(status='expired', message='World job expired. No automatic charged retry.')
            else: raise
    job['checked'] = time.time()
    await store.save(job_id, job)
    return public(job)
