"""MemoryCast's bounded, evidence-only tour contract."""
import hashlib
import json
import math
import re
import unicodedata
from typing import List,Literal,Optional
from pydantic import BaseModel,ConfigDict,Field,StringConstraints
from typing_extensions import Annotated

class StrictModel(BaseModel):
    model_config=ConfigDict(extra='forbid')

class Excerpt(StrictModel):
    source_id: Annotated[str,StringConstraints(min_length=1,max_length=100)]
    quote: Annotated[str,StringConstraints(strip_whitespace=True,min_length=1,max_length=1200)]

class DraftChapter(StrictModel):
    order: int=Field(ge=1,le=3,strict=True)
    narration: Annotated[str,StringConstraints(strip_whitespace=True,min_length=40,max_length=2400)]
    anchor_id: Optional[str]=None
    excerpts: List[Excerpt]=Field(min_length=0,max_length=6)
    ambience: Literal['quiet','gentle']='quiet'

class JournalReading(StrictModel):
    interpretation: Annotated[str,StringConstraints(strip_whitespace=True,min_length=1,max_length=500)]
    evidence_quote: Annotated[str,StringConstraints(max_length=1000)]

class TourDraft(StrictModel):
    journal_reading: JournalReading
    chapters: List[DraftChapter]=Field(min_length=3,max_length=3)

class PlanChapter(StrictModel):
    order: int=Field(ge=1,le=3,strict=True)
    narration: Annotated[str,StringConstraints(strip_whitespace=True,min_length=40,max_length=2400)]
    anchor_id: Optional[str]=None
    source_ids: List[str]=Field(min_length=1,max_length=6)
    ambience: Literal['quiet','gentle']='quiet'

class TourPlan(StrictModel):
    journal_reading: JournalReading
    chapters: List[PlanChapter]=Field(min_length=3,max_length=3)

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
    visualization=None
    if isinstance(scene,dict) and scene:
        scene_objects=scene.get('objects') or []
        if not isinstance(scene_objects,list):scene_objects=[]
        # AI scene planning is supporting artistic context, never memory evidence.
        visualization={'interpretation_only':True,'title':str(scene.get('title',''))[:160],'environment':str(scene.get('environment',''))[:80],'mood':str(scene.get('mood',''))[:80],'object_types':[str(o.get('type',''))[:80] for o in scene_objects[:30] if isinstance(o,dict)]}
    return {'version':4,'visualization':visualization,'memory_id':memory['id'],'mood':mood,'language':language,'sources':sources,'anchors':anchors,'photos':photos,'world_id':world_id}

def fingerprint(context):
    return hashlib.sha256(json.dumps(context,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()

TEXT={'en':{'titles':['Arrival','Rediscovery','Reflection']},'ko':{'titles':['도착','재발견','되돌아보기']}}

def copied_excerpt(quote,source):
    # Ignore typography/capitalization changes, never paraphrases or invented text.
    def canonical(value):
        value=unicodedata.normalize('NFKC',value).translate(str.maketrans({'“':'"','”':'"','‘':"'",'’':"'"}))
        return ' '.join(value.casefold().split())
    return bool(quote.strip()) and canonical(quote) in canonical(source)

def render_tour(draft,context):
    if [c.order for c in draft.chapters]!=[1,2,3]:raise ValueError('Invalid chapter order')
    story=context['sources'].get('journal:story','')
    if story and (not draft.journal_reading.evidence_quote or not copied_excerpt(draft.journal_reading.evidence_quote,story)):raise ValueError('Journal feeling interpretation needs written evidence')
    if not story and draft.journal_reading.evidence_quote:raise ValueError('Missing written evidence')
    anchors={a['id']:a for a in context['anchors']};sources=context['sources'];language=TEXT[context['language']];chapters=[]
    for i,c in enumerate(draft.chapters):
        if c.anchor_id is not None and c.anchor_id not in anchors:raise ValueError('Unknown memory anchor')
        if not c.excerpts:raise ValueError('Chapter evidence required')
        for e in c.excerpts:
            if not e.source_id.startswith(('journal:','anchor:','photo:')) or e.source_id not in sources or not copied_excerpt(e.quote,sources[e.source_id]):raise ValueError('Ungrounded content reference')
        if story and not any(e.source_id=='journal:story' for e in c.excerpts):raise ValueError('Every chapter must use the journal')
        if i<2 and any(k.startswith('photo:') for k in sources) and not any(e.source_id.startswith('photo:') for e in c.excerpts):raise ValueError('Opening chapters must use photograph details')
        text=c.narration
        if any(phrase in text.casefold() for phrase in ('take a breath','take a deep breath','there is no need to hurry','let your attention','stay with this moment')):raise ValueError('Generic meditation narration')
        # Quotes are audited evidence, not a semantic proof of every generated sentence.
        # Keep a safe central camera position; the frontend may collision-check
        # moves against its loaded collider. Never use provider-invented poses.
        position=[.25,.1,.45] if context.get('world_id') else [7.5,5.2,9.5]
        target=anchors[c.anchor_id]['position'] if c.anchor_id else ([0,0,-2] if context.get('world_id') else [0,1.2,0])
        chapters.append({'order':i+1,'title':language['titles'][i],'narration':text,'subtitles':text,'anchor_id':c.anchor_id,
          'camera':{'position':position,'target':target,'transition_seconds':2.5,'mode':'look-at'},
          'ambience':{'cue':c.ambience,'volume':.08 if c.ambience=='gentle' else 0},'evidence':[e.model_dump() for e in c.excerpts]})
    return {'version':4,'journal_reading':draft.journal_reading.model_dump(),'language':context['language'],'mood':context['mood'],'chapters':chapters,'voice_disclosure':'AI-generated narration'}
