"""Durable SPZ/GLB transfer, run by the worker, never in a browser request."""
import os
import tempfile
from urllib.parse import quote
import httpx
from fastapi import HTTPException
from .worlds import asset_url
from .world_accounts import supabase_headers

async def archive_world(accounts, user_id, job_id, world):
    if os.getenv('WORLD_ASSET_RETENTION_APPROVED','false').lower() != 'true':
        raise HTTPException(503, 'Confirm provider retention permission before archiving.')
    paths = {}
    # Deterministic keys make interrupted transfers safe to resume. Do not store
    # provider signed URLs as the permanent record or load arbitrary client URLs.
    async with httpx.AsyncClient(timeout=300, follow_redirects=False) as client:
        for key, name in [('splatUrl','world.spz'), ('colliderUrl','collider.glb')]:
            url = asset_url(world[key]); path = f'{user_id}/{job_id}/{name}'
            target = accounts.url+'/storage/v1/object/memory-worlds/'+quote(path, safe='/')
            headers = supabase_headers(accounts.key)
            existing = await client.head(target, headers=headers)
            if existing.status_code != 200:
                if existing.status_code not in (400,404): raise HTTPException(503,'Archive status unavailable.')
                with tempfile.TemporaryFile() as file:
                    size = 0
                    async with client.stream('GET',url) as response:
                        response.raise_for_status()
                        async for chunk in response.aiter_bytes():
                            size += len(chunk)
                            if size > 1024**3: raise HTTPException(503,'World asset exceeds storage transfer limit.')
                            file.write(chunk)
                    file.seek(0); signature = file.read(4); file.seek(0)
                    if not size or (key=='colliderUrl' and signature!=b'glTF') or (key=='splatUrl' and signature[:2]!=b'\x1f\x8b'):
                        raise HTTPException(502,'Invalid world asset format.')
                    async def chunks():
                        while True:
                            data=file.read(1024*1024)
                            if not data: break
                            yield data
                    result = await client.post(target,headers={**headers,'Content-Type':'application/octet-stream','Content-Length':str(size),'x-upsert':'true'}, content=chunks())
                    result.raise_for_status()
                check = await client.head(target,headers=headers)
                check.raise_for_status()
            paths[key] = path
    return {'id':world['id'],'storagePaths':paths,'source':'worldlabs'}
