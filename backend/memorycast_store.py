"""MemoryCast persistence in the EXISTING Supabase project and private Storage."""
from urllib.parse import urlencode,quote,urlparse
import httpx
from fastapi import HTTPException
from .world_accounts import SupabaseWorlds,supabase_headers

class TourStore(SupabaseWorlds):
    def upstream_error(self,path,response):
        if path.startswith('/rest/v1/rpc/mc_'):
            code='memorycast_schema_unavailable' if response.status_code==404 else 'memorycast_storage_unavailable'
            message='Podcast database functions are unavailable. Ask the owner to verify the MemoryCast migration and schema cache.' if response.status_code==404 else 'Podcast storage is temporarily unavailable. Retry loading your saved tour.'
            raise HTTPException(503,{'code':code,'message':message})

    async def journal(self,user_id,memory_id):
        query=urlencode({'id':'eq.'+memory_id,'user_id':'eq.'+user_id,'deleted_at':'is.null','select':'id,title,story,mood,photos,scene,world','limit':'1'})
        result=await self.request('/rest/v1/journal_entries?'+query)
        if not isinstance(result,list) or not result:raise HTTPException(404,'Saved memory not found for this account.')
        return result[0]
    async def tour_rpc(self,name,body):
        result=await self.request('/rest/v1/rpc/'+name,body=body)
        if not isinstance(result,dict):raise HTTPException(503,'MemoryCast storage is unavailable.')
        if result.get('error'):raise HTTPException({'not_found':404,'disabled':503,'stale':409,'limit':429}.get(result['error'],409),result.get('message','MemoryCast is unavailable.'))
        return result
    async def storage(self,method,path,*,data=None,body=None):
        headers=supabase_headers(self.key)
        if data is not None:headers.update({'Content-Type':'audio/wav','x-upsert':'false'})
        try:
            async def call(client):return await client.request(method,self.url+'/storage/v1/'+path,headers=headers,content=data,json=body)
            if self.client:r=await call(self.client)
            else:
                async with httpx.AsyncClient(timeout=8,follow_redirects=False) as client:r=await call(client)
            r.raise_for_status();return r
        except httpx.HTTPError:raise HTTPException(503,'Private narration storage is temporarily unavailable.') from None
    async def photograph(self,path):
        # Stream/bound remote media; a private Storage path cannot become an SSRF URL.
        async with httpx.AsyncClient(timeout=8,follow_redirects=False) as client:
            async with client.stream('GET',self.url+'/storage/v1/object/authenticated/memory-assets/'+quote(path,safe='/'),headers=supabase_headers(self.key)) as response:
                response.raise_for_status();data=bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data)>10*1024*1024:raise HTTPException(413,'A saved photograph exceeds the 10 MB narration-analysis limit.')
                return bytes(data)
    async def upload(self,path,data):
        await self.storage('POST','object/memorycast-audio/'+quote(path,safe='/'),data=data)
    async def signed_audio(self,path):
        response=await self.storage('POST','object/sign/memorycast-audio/'+quote(path,safe='/'),body={'expiresIn':900})
        raw=response.json().get('signedURL') or response.json().get('signedUrl')
        if not isinstance(raw,str):raise HTTPException(503,'Narration playback could not be authorized.')
        url=self.url+'/storage/v1'+raw if raw.startswith('/object/') else raw
        parsed=urlparse(url)
        if (parsed.scheme,parsed.netloc)!=(urlparse(self.url).scheme,urlparse(self.url).netloc) or parsed.username or not parsed.path.startswith('/storage/v1/object/sign/memorycast-audio/'):
            raise HTTPException(503,'Invalid private playback reference.')
        return url

def get_tour_store():return TourStore()
