"""MemoryCast persistence in the EXISTING Supabase project and private Storage."""
from urllib.parse import urlencode,quote,urlparse
import httpx
import copy
from datetime import datetime,timezone
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
    async def recover_failed(self,user,memory_id,context,input_hash):
        """One compare-and-swap recovery inside an existing pre-audio reservation.

        No quota reset, new reservation, uncertain retry, or audio overwrite.
        The service-role key stays server-side; ownership is checked at every read/write.
        """
        query=urlencode({'user_id':'eq.'+user,'memory_id':'eq.'+memory_id,'select':'*','order':'created_at.desc','limit':'1'})
        rows=await self.request('/rest/v1/memorycast_tours?'+query)
        if not rows:return None
        old=rows[0];prior=old.get('context') or {};photos=prior.get('photos',[])
        if (old.get('status')!='failed' or old.get('lease') is not None or old.get('audio_paths') or old.get('audio_durations') or
            not isinstance(old.get('next_step'),int) or not 0<=old['next_step']<=len(photos) or prior.get('automatic_recoveries',0)>=1):
            return old
        fresh=copy.deepcopy(context);fresh['automatic_recoveries']=1
        step=0
        if photos==fresh['photos']:
            for index in range(min(old['next_step'],len(photos))):
                key='photo:'+str(index+1);value=prior.get('sources',{}).get(key)
                if not isinstance(value,str) or not value:break
                fresh['sources'][key]=value;step+=1
        filters=urlencode({'id':'eq.'+old['id'],'user_id':'eq.'+user,'memory_id':'eq.'+memory_id,
            'status':'eq.failed','lease':'is.null','updated_at':'eq.'+old['updated_at']})
        payload={'context':fresh,'input_hash':input_hash,'status':'pending','next_step':step,'total_steps':len(fresh['photos'])+4,
            'script':None,'lease':None,'lease_until':None,'message':'Resuming your included podcast.','updated_at':datetime.now(timezone.utc).isoformat()}
        headers={**supabase_headers(self.key),'Prefer':'return=representation'}
        async def patch(client):
            response=await client.patch(self.url+'/rest/v1/memorycast_tours?'+filters,headers=headers,json=payload)
            if response.status_code==409:return [] # Another current version won; read it below.
            if not response.is_success:raise HTTPException(503,'Saved podcast recovery is temporarily unavailable.')
            return response.json()
        if self.client:changed=await patch(self.client)
        else:
            async with httpx.AsyncClient(timeout=8,follow_redirects=False) as client:changed=await patch(client)
        if changed:return changed[0]
        result=await self.tour_rpc('mc_read',{'p_user':user,'p_memory':memory_id,'p_tour':None})
        return result.get('tour')

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
