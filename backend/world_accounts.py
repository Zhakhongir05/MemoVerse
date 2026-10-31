"""Adapter to the EXISTING Supabase project. No account creation or token minting."""
import os
from uuid import UUID
import httpx
from urllib.parse import quote
from fastapi import Depends, Header, HTTPException

def unavailable():return HTTPException(503,'World generation is not configured. Please try again later.')

class SupabaseWorlds:
    def __init__(self,client=None):
        self.url=os.getenv('SUPABASE_URL','').rstrip('/')
        self.key=os.getenv('SUPABASE_SERVICE_ROLE_KEY','')
        if not self.url.startswith('https://') or not self.key:raise unavailable()
        self.client=client
    async def request(self,path,*,token=None,body=None):
        headers={'apikey':self.key,'Authorization':'Bearer '+(token or self.key)}
        try:
            if self.client:
                response=await self.client.request('POST' if body is not None else 'GET',self.url+path,headers=headers,json=body)
            else:
                async with httpx.AsyncClient(timeout=8,follow_redirects=False) as client:
                    response=await client.request('POST' if body is not None else 'GET',self.url+path,headers=headers,json=body)
            if token and response.status_code in (401,403):raise HTTPException(401,'Please sign in with your existing account again.')
            response.raise_for_status();return response.json()
        except (httpx.HTTPError,ValueError):raise unavailable() from None
    async def user(self,token):
        result=await self.request('/auth/v1/user',token=token)
        if not isinstance(result,dict):raise unavailable()
        try:
            if result.get('is_anonymous') is True:raise ValueError()
            return str(UUID(result['id']))
        except (ValueError,KeyError,TypeError):raise HTTPException(401,'Sign in with your existing account to create a world.') from None
    async def rpc(self,name,params):
        result=await self.request('/rest/v1/rpc/'+name,body=params)
        if not isinstance(result,dict):raise unavailable()
        if result.get('error'):
            code=result['error'];status={'not_found':404,'memory_changed':409,'review_required':503,'in_flight_limit':429,'disabled':503,'unconfigured':503,'ended':410}.get(code,429)
            # Messages originate only in our SQL functions, never raw PostgREST errors.
            message=result.get('message','World generation is unavailable.')
            if code=='busy' and message=='World generation is busy. Please return shortly.':
                message='All global generation slots are occupied, including submissions awaiting owner review. No new World Labs job was submitted and your account allowance is unchanged.'
            raise HTTPException(status,message)
        return result
    async def photo(self,path,limit):
        headers={'apikey':self.key,'Authorization':'Bearer '+self.key}
        try:
            async with httpx.AsyncClient(timeout=15,follow_redirects=False) as client:
                async with client.stream('GET',self.url+'/storage/v1/object/authenticated/memory-assets/'+quote(path,safe='/'),headers=headers) as response:
                    response.raise_for_status();data=bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data)>limit:raise HTTPException(413,'Choose a saved photograph up to 4 MB for world generation.')
                    return bytes(data),response.headers.get('content-type','').split(';')[0]
        except httpx.HTTPError:raise HTTPException(503,'The saved photograph could not be loaded. Retry cloud sync before generating.') from None

def get_accounts():return SupabaseWorlds()

async def authenticated_user(authorization: str=Header(default=''),accounts=Depends(get_accounts)):
    if not authorization.startswith('Bearer ') or not 1<len(authorization[7:])<=8192:
        raise HTTPException(401,'Sign in with your existing account to create a world.')
    return await accounts.user(authorization[7:])
