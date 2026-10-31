"""Sensory cues copied from the listener's own words; no provider calls.

A cue never invents a smell, a sound or a temperature. Each one carries the
sentence it was read from, so the interface can show the evidence beside the
sensation. Extraction is deterministic, which keeps the demo fast and free.
"""
import re
from typing import List, Literal, Optional
from fastapi import APIRouter
from pydantic import Field, StringConstraints
from typing_extensions import Annotated
from .schemas import ContractModel

Identifier = Annotated[str, StringConstraints(pattern=r'^[A-Za-z0-9_-]{1,64}$')]
Engine = Literal['rain', 'fire', 'wind', 'birds', 'waves', 'hum', 'music', 'none']
SensoryKind = Literal['sound', 'scent', 'temperature', 'texture', 'light']


class SensoryAnchor(ContractModel):
    id: Identifier
    memory: str = Field(default='', max_length=2000)


class SensoryRequest(ContractModel):
    story: str = Field(default='', max_length=12000)
    anchors: List[SensoryAnchor] = Field(default_factory=list, max_length=40)
    # Journal entries use nine moods; the endpoint does not depend on the value.
    mood: str = Field(default='Nostalgic', max_length=40)


class SensoryCue(ContractModel):
    id: Identifier
    kind: SensoryKind
    engine: Engine
    label: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    detail: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    # Verbatim from the submitted story or anchor memory (whitespace normalized).
    quote: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
    source: Literal['story', 'anchor']
    anchorId: Optional[Identifier] = None
    intensity: float = Field(ge=0, le=1)


class SensoryResponse(ContractModel):
    version: Literal[1] = 1
    source: Literal['lexicon'] = 'lexicon'
    cues: List[SensoryCue] = Field(max_length=12)


# (kind, engine, keywords, label, detail). Sounds carry a synthesizer engine;
# every other kind is described in the interface and never claims to be emitted.
LEXICON = (
    ('sound', 'rain', ('rain', 'raining', 'rained', 'downpour', 'drizzle'),
     'Rain against the glass', 'A steady rain on the window.'),
    ('sound', 'fire', ('fire', 'fireplace', 'hearth', 'crackling', 'woodstove', 'bonfire', 'campfire'),
     'A fire settling', 'Small crackles from a fire.'),
    ('sound', 'waves', ('waves', 'wave', 'sea', 'ocean', 'surf', 'shore', 'tide'),
     'Waves', 'Water moving at the shore.'),
    ('sound', 'birds', ('birds', 'bird', 'birdsong', 'sparrows', 'gulls', 'crows'),
     'Birds outside', 'Birds somewhere beyond the room.'),
    ('sound', 'wind', ('wind', 'breeze', 'gust', 'draft', 'draught'),
     'Wind at the window', 'A low wind moving past.'),
    ('sound', 'music', ('music', 'song', 'radio', 'piano', 'vinyl', 'record', 'guitar'),
     'Music in the room', 'Music playing somewhere near.'),
    ('sound', 'hum', ('hum', 'fridge', 'refrigerator', 'fan', 'engine', 'traffic'),
     'A low hum', 'Something mechanical, quietly running.'),
    ('scent', 'none', ('woodsmoke', 'smoke', 'chimney', 'bonfire', 'campfire'),
     'Woodsmoke', 'Smoke drifting in from outside.'),
    ('scent', 'none', ('lavender', 'jasmine', 'roses', 'rose', 'flowers', 'blossom'),
     'Flowers', 'A soft floral scent.'),
    ('scent', 'none', ('coffee', 'bread', 'baking', 'cinnamon', 'vanilla', 'cake', 'soup'),
     'Something warm in the kitchen', 'Coffee and something baking.'),
    ('scent', 'none', ('salt air', 'saltwater', 'brine', 'salt'),
     'Salt air', 'Salt carried on the wind.'),
    ('scent', 'none', ('petrichor', 'wet earth', 'damp earth', 'after the rain'),
     'Wet earth', 'The smell of rain on dry ground.'),
    ('scent', 'none', ('pine', 'fir', 'forest', 'moss'),
     'Pine and moss', 'Green, resinous air.'),
    ('scent', 'none', ('soap', 'linen', 'laundry', 'fresh sheets'),
     'Clean linen', 'Soap and fresh sheets.'),
    ('temperature', 'none', ('cold', 'freezing', 'frost', 'winter', 'snow', 'chilly', 'ice'),
     'Cold air', 'A chill that reaches the hands.'),
    ('temperature', 'none', ('warm', 'cosy', 'cozy', 'sunlight', 'summer', 'heat', 'humid'),
     'Warmth', 'Warm air resting on the skin.'),
    ('texture', 'none', ('wool', 'blanket', 'knit', 'knitted', 'sweater', 'carpet', 'rug'),
     'Soft wool', 'The give of wool under a hand.'),
    ('texture', 'none', ('wood', 'floorboards', 'oak', 'pine floor', 'wooden'),
     'Bare floorboards', 'Cool, smooth boards underfoot.'),
    ('texture', 'none', ('metal', 'brass', 'iron', 'steel', 'doorknob'),
     'Cold metal', 'Metal warming under a hand.'),
    ('texture', 'none', ('sand', 'gravel', 'soil', 'dirt'),
     'Grit underfoot', 'Loose ground shifting underfoot.'),
    ('light', 'none', ('sunlight', 'sunshine', 'sunny', 'sunbeam', 'golden light'),
     'Afternoon light', 'Low sun across the room.'),
    ('light', 'none', ('candle', 'lamplight', 'lamp', 'dusk', 'twilight', 'glow', 'neon', 'firelight'),
     'Lamplight', 'A small pool of warm light.'),
)

PATTERNS = tuple(
    (kind, engine, re.compile(r'\b(?:' + '|'.join(re.escape(word) for word in words) + r')\b', re.IGNORECASE), label, detail)
    for kind, engine, words, label, detail in LEXICON
)
MAX_PER_KIND = 4
MAX_CUES = 12


def _quote(sentence, start):
    """The sentence around a hit, windowed if the sentence is long."""
    sentence = sentence.strip()
    if len(sentence) <= 240:
        return sentence
    begin = max(0, min(start - 80, len(sentence) - 240))
    return sentence[begin:begin + 240].strip()


def _hits(text, anchor_id):
    """All lexicon matches in narrative order; quote is a verbatim slice."""
    normalized = re.sub(r'\s+', ' ', text).strip()
    if not normalized:
        return []
    sentences = [(match.start(), match.group(0)) for match in re.finditer(r'[^.!?]+[.!?]*', normalized)]
    found = []
    for kind, engine, pattern, label, detail in PATTERNS:
        for start, sentence in sentences:
            match = pattern.search(sentence)
            if not match:
                continue
            found.append({
                'kind': kind,
                'engine': engine,
                'label': label,
                'detail': detail,
                'quote': _quote(sentence, match.start()),
                'source': 'anchor' if anchor_id else 'story',
                'anchorId': anchor_id,
                'position': start + match.start(),
            })
    found.sort(key=lambda hit: hit['position'])
    return found


def build_response(request):
    cues = []
    counts = {}
    seen = set()
    sources = [(request.story, None)]
    sources.extend((anchor.memory, anchor.id) for anchor in request.anchors)
    for text, anchor_id in sources:
        for hit in _hits(text, anchor_id):
            key = (hit['kind'], hit['engine'], anchor_id)
            counts[key] = counts.get(key, 0) + 1
            if key in seen:
                continue
            seen.add(key)
            cues.append(hit)
    per_kind = {}
    kept = []
    for hit in cues:
        if len(kept) >= MAX_CUES or per_kind.get(hit['kind'], 0) >= MAX_PER_KIND:
            continue
        per_kind[hit['kind']] = per_kind.get(hit['kind'], 0) + 1
        key = (hit['kind'], hit['engine'], hit['anchorId'])
        kept.append(SensoryCue(
            id='sense-' + str(len(kept) + 1),
            kind=hit['kind'],
            engine=hit['engine'],
            label=hit['label'],
            detail=hit['detail'],
            quote=hit['quote'],
            source=hit['source'],
            anchorId=hit['anchorId'],
            intensity=0.7 if counts[key] > 1 else 0.5,
        ))
    return SensoryResponse(cues=kept)


router = APIRouter()


@router.post('/api/sensory-cues', response_model=SensoryResponse, response_model_exclude_none=True)
async def sensory_cues(request: SensoryRequest):
    return build_response(request)
