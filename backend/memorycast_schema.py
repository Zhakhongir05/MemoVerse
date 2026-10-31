"""MemoryCast's bounded, evidence-only tour contract."""
import hashlib
import json
import math
import re
from typing import List,Literal,Optional
from pydantic import BaseModel,ConfigDict,Field,StringConstraints
from typing_extensions import Annotated

class StrictModel(BaseModel):
    model_config=ConfigDict(extra='forbid')

class Excerpt(StrictModel):
    source_id: Annotated[str,StringConstraints(min_length=1,max_length=100)]
    quote: Annotated[str,StringConstraints(strip_whitespace=True,min_length=1,max_length=480)]

class DraftChapter(StrictModel):
    order: int=Field(ge=1,le=3,strict=True)
    anchor_id: Optional[str]=None
    excerpts: List[Excerpt]=Field(min_length=0,max_length=2)
    ambience: Literal['quiet','gentle']='quiet'

class TourDraft(StrictModel):
    chapters: List[DraftChapter]=Field(min_length=3,max_length=3)

class TourRequest(StrictModel):
    language: Literal['en','ko']='en'
    approved: bool=False
    regenerate: bool=False

MOODS={'Nostalgic','Joyful','Peaceful','Grateful','Loved','Excited','Hopeful','Bittersweet','Melancholic'}

def vector(value):
    if not isinstance(value,(list,tuple)) or len(value)!=3:return None
    if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or abs(x)>20 for x in value):return None
    return [float(x) for x in value]

def context_for(memory,user_id,language):
    """Only saved, owned data enters a tour, never coordinates from a model."""
    sources={};anchors=[]
    for name in ['title','story']:
        value=memory.get(name,'')
        if isinstance(value,str) and value.strip():sources['journal:'+name]=value.strip()[:12000]
    world=memory.get('world') or {};scene=memory.get('scene') or {}
    raw=world.get('memoryAnchors',world.get('anchors',[])) if isinstance(world,dict) else []
    # Existing validated scene objects are also memory anchors, not new furniture.
    if not raw and isinstance(scene,dict):raw=scene.get('objects',[])
    if isinstance(raw,list):
        for item in raw[:30]:
            if not isinstance(item,dict):continue
            anchor_id=item.get('id');position=vector(item.get('position'))
            if not isinstance(anchor_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',anchor_id) or position is None or any(a['id']==anchor_id for a in anchors):continue
            label=str(item.get('label') or item.get('type') or 'Memory detail')[:100]
            text=item.get('memory','');text=text[:1000] if isinstance(text,str) else ''
            anchors.append({'id':anchor_id,'label':label,'position':position})
            if text.strip():sources['anchor:'+anchor_id]=text.strip()
    photos=[]
    for photo in (memory.get('photos') or [])[:6]:
        if not isinstance(photo,dict):continue
        path=photo.get('path','')
        if not isinstance(path,str) or len(path)>1024 or not path.startswith(user_id+'/'+memory['id']+'/') or any(p in ('.','..','') for p in path.split('/')):raise ValueError('Invalid saved photograph path')
        if photo.get('type') not in ('image/jpeg','image/png','image/webp'):raise ValueError('Unsupported saved photograph')
        photos.append({'path':path,'type':photo['type']})
    mood=memory.get('mood','Nostalgic')
    if mood not in MOODS:raise ValueError('Invalid mood')
    world_id=world.get('id') if isinstance(world,dict) else None
    if not isinstance(world_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',world_id):world_id=None
    return {'version':1,'memory_id':memory['id'],'mood':mood,'language':language,'sources':sources,'anchors':anchors,'photos':photos,'world_id':world_id}

def fingerprint(context):
    return hashlib.sha256(json.dumps(context,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

TEXT={
 'en':{
  'titles':['Arrival','Rediscovery','Reflection'],
  'intro':['Take a breath. Let your attention settle into this place.','Let your attention return to a detail you chose to keep.','Stay with this moment for a little longer.'],
  'mood':{'Nostalgic':'There is no need to hurry.','Joyful':'Leave a little room for lightness.','Peaceful':'Give yourself a quiet pause.','Grateful':'Notice what you want to appreciate.','Loved':'Let care guide your attention.','Excited':'Let curiosity guide your attention.','Hopeful':'Make space for possibility.','Bittersweet':'There is room for more than one feeling.','Melancholic':'Take this gently, at your own pace.'},
  'quote':'You wrote: “{}”',
  'observation':'In the photograph: {}',
  'closing':'Take what feels meaningful from this visit. You can return whenever you choose.'},
 'ko':{
  'titles':['도착','재발견','되돌아보기'],
  'intro':['천천히 숨을 고르며 이 공간에 시선을 머물러 보세요.','간직하고 싶었던 작은 부분에 다시 주의를 기울여 보세요.','이 순간에 조금 더 머물러 보세요.'],
  'mood':{'Nostalgic':'서두르지 않아도 괜찮습니다.','Joyful':'가벼운 마음으로 둘러보세요.','Peaceful':'조용한 쉼을 가져 보세요.','Grateful':'고마움을 느끼고 싶은 부분을 살펴보세요.','Loved':'다정한 마음으로 바라보세요.','Excited':'호기심을 따라가 보세요.','Hopeful':'가능성을 위한 여유를 가져 보세요.','Bittersweet':'서로 다른 감정이 함께 있어도 괜찮습니다.','Melancholic':'자신의 속도로 천천히 바라보세요.'},
  'quote':'당신은 이렇게 기록했습니다. “{}”',
  'observation':'사진에서 보이는 모습입니다. {}',
  'closing':'이 방문에서 의미 있게 느껴진 것을 간직하세요. 원할 때 언제든 다시 돌아올 수 있습니다.'}}

def render_tour(draft,context):
    if [c.order for c in draft.chapters]!=[1,2,3]:raise ValueError('Invalid chapter order')
    anchors={a['id']:a for a in context['anchors']};sources=context['sources'];language=TEXT[context['language']];chapters=[]
    for i,c in enumerate(draft.chapters):
        if c.anchor_id is not None and c.anchor_id not in anchors:raise ValueError('Unknown memory anchor')
        parts=[language['intro'][i],language['mood'][context['mood']]]
        for e in c.excerpts:
            if not e.source_id.startswith(('journal:','anchor:')) or e.source_id not in sources or e.quote not in sources[e.source_id]:raise ValueError('Ungrounded personal content')
            parts.append(language['quote'].format(e.quote))
        if i==2:parts.append(language['closing'])
        text=' '.join(parts)
        if len(text)>1300:raise ValueError('Narration too long')
        # Keep a safe central camera position; the frontend may collision-check
        # moves against its loaded collider. Never use provider-invented poses.
        position=[.25,.1,.45] if context.get('world_id') else [7.5,5.2,9.5]
        target=anchors[c.anchor_id]['position'] if c.anchor_id else ([0,0,-2] if context.get('world_id') else [0,1.2,0])
        chapters.append({'order':i+1,'title':language['titles'][i],'narration':text,'subtitles':text,'anchor_id':c.anchor_id,
          'camera':{'position':position,'target':target,'transition_seconds':2.5,'mode':'look-at'},
          'ambience':{'cue':c.ambience,'volume':.08 if c.ambience=='gentle' else 0},'evidence':[e.model_dump() for e in c.excerpts]})
    return {'version':1,'language':context['language'],'mood':context['mood'],'chapters':chapters,'voice_disclosure':'AI-generated narration'}
