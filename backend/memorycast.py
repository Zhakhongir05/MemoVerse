"""Authenticated, persistent MemoryCast jobs. GET/replay never calls AI."""
import asyncio
import copy
import os
import math
from uuid import UUID,uuid4
from fastapi import APIRouter,Depends,HTTPException,Request
from .world_accounts import authenticated_user
from .memorycast_store import get_tour_store
from .memorycast_provider import TourProvider,audio_duration
from .memorycast_schema import TourRequest,context_for,fingerprint

router=APIRouter(prefix='/api/memorycast',tags=['MemoryCast'])

def enabled():
    if os.getenv('MEMORYCAST_LIVE_ENABLED','false').lower()!='true':raise HTTPException(503,'New MemoryCast narration is disabled. Saved tours can still be replayed.')

def get_tour_provider(request:Request):return TourProvider(request.app.state.pipeline)

def public_tour(tour):
    return {key:value for key,value in tour.items() if key not in ('context','lease','lease_until','user_id')}

@router.get('/memories/{memory_id}')
async def load_tour(memory_id:UUID,language:str=None,tour_id:UUID=None,user=Depends(authenticated_user),store=Depends(get_tour_store),provider=Depends(get_tour_provider)):
    if language is not None and language not in ('en','ko'):raise HTTPException(422,'Choose en or ko narration.')
    memory=await store.journal(user,str(memory_id))
    result=await store.tour_rpc('mc_read',{'p_user':user,'p_memory':str(memory_id),'p_tour':str(tour_id) if tour_id else None})
    tour=result.get('tour')
    reason = 'memorycast_database_disabled' if not result.get('enabled') else 'memorycast_disabled' if os.getenv('MEMORYCAST_LIVE_ENABLED','false').lower()!='true' else 'memorycast_providers_unconfigured' if not provider.configured() else None
    readiness={'generation_enabled':reason is None,'generation_reason':reason}
    if not tour:return {'tour':None,'stale':False,**readiness}
    try:current=fingerprint(context_for(memory,user,language or tour['language']))
    except ValueError:raise HTTPException(422,'Saved memory metadata needs attention.') from None
    output=public_tour(tour);output['audio']=[]
    if tour['status']=='ready':
        paths=tour.get('audio_paths',[])
        prefix=user+'/'+str(memory_id)+'/'+tour['id']+'/'
        durations=tour.get('audio_durations',[])
        if len(paths)!=3 or len(durations)!=3 or any(isinstance(d,bool) or not isinstance(d,(int,float)) or not math.isfinite(d) or not 0<d<=180 for d in durations) or any(path!=prefix+str(i+1)+'.wav' for i,path in enumerate(paths)):raise HTTPException(503,'Saved narration references need owner review.')
        urls=await asyncio.gather(*(store.signed_audio(path) for path in paths))
        output['audio']=[{'order':i+1,'url':url,'expires_in':900,'duration_seconds':tour['audio_durations'][i]} for i,url in enumerate(urls)]
    return {'tour':output,'stale':current!=tour['input_hash'],'previous_ready_tour_id':result.get('previous_ready_tour_id'),**readiness}

@router.post('/memories/{memory_id}',status_code=202)
async def create_tour(memory_id:UUID,body:TourRequest,user=Depends(authenticated_user),store=Depends(get_tour_store),provider=Depends(get_tour_provider)):
    if not body.approved:raise HTTPException(403,'Explicitly approve generating narration for this memory.')
    enabled()
    if not provider.configured():raise HTTPException(503,'MemoryCast providers are not configured on the server.')
    memory=await store.journal(user,str(memory_id))
    try:context=context_for(memory,user,body.language)
    except ValueError:raise HTTPException(422,'Saved memory metadata needs attention.') from None
    result=await store.tour_rpc('mc_reserve',{'p_user':user,'p_memory':str(memory_id),'p_id':str(uuid4()),'p_hash':fingerprint(context),'p_context':context,'p_regenerate':body.regenerate})
    return {'tour':public_tour(result['tour']),'fresh':result['fresh']}

@router.post('/tours/{tour_id}/advance')
async def advance_tour(tour_id:UUID,user=Depends(authenticated_user),store=Depends(get_tour_store),provider=Depends(get_tour_provider)):
    enabled()
    if not provider.configured():raise HTTPException(503,'MemoryCast providers are not configured on the server.')
    lease=str(uuid4())
    claim=await store.tour_rpc('mc_claim',{'p_user':user,'p_id':str(tour_id),'p_lease':lease})
    if not claim['claimed']:return {'tour':public_tour(claim['tour']),'advanced':False}
    tour=claim['tour'];update={}
    try:
        update=await asyncio.wait_for(perform_step(tour,store,provider),30)
    except asyncio.TimeoutError:
        update={'status':'uncertain','message':'A provider timed out. This step will not be charged again automatically; owner review is required.'}
    except Exception:
        # Never echo private prose, images, keys or raw upstream/provider messages.
        update={'status':'failed','message':'MemoryCast could not finish this step. Saved audio is retained; no automatic paid retry.'}
    result=await store.tour_rpc('mc_finish',{'p_user':user,'p_id':str(tour_id),'p_lease':lease,'p_update':update})
    return {'tour':public_tour(result['tour']),'advanced':True}

async def perform_step(tour,store,provider):
    context=copy.deepcopy(tour['context']);step=tour['next_step'];photos=context['photos']
    if step<len(photos):
        from .main import validate_photo
        from starlette.concurrency import run_in_threadpool
        photo=photos[step];data=await store.photograph(photo['path'])
        mime=await run_in_threadpool(validate_photo,data,photo['type'])
        text=await asyncio.wait_for(provider.vision(data,mime),20)
        context['sources']['photo:'+str(step+1)]=text
        update={'context':context,'message':'Photograph observations saved.'}
    elif step==len(photos):
        script=await asyncio.wait_for(provider.script(context),20)
        update={'script':script,'message':'Personalized three-chapter script saved.'}
    else:
        index=step-len(photos)-1
        if not 0<=index<3:raise ValueError('Invalid audio step')
        chapter=tour['script']['chapters'][index]
        data,_duration=await asyncio.wait_for(provider.speech(chapter['narration'],context['language']),20)
        duration=audio_duration(data)
        path=tour['user_id']+'/'+tour['memory_id']+'/'+tour['id']+'/'+str(index+1)+'.wav'
        await store.upload(path,data)
        update={'audio_path':path,'duration':duration,'message':'Narration chapter '+str(index+1)+' saved.'}
    return update
