from typing import List, Literal, Optional, Tuple
from pydantic import BaseModel, Field

ObjectType = Literal[
    'desk',
    'chair',
    'window',
    'bed',
    'bookshelf',
    'lamp',
    'rug',
    'wardrobe',
    'plant',
    'photo-frame',
]

class DetectedObject(BaseModel):
    label: str
    approximate_position: str
    confidence: float = Field(ge=0.0, le=1.0)

class PhotoAnalysis(BaseModel):
    visible_objects: List[DetectedObject] = Field(default_factory=list)
    spatial_layout: str
    lighting_and_colors: str
    uncertainty_notes: str

class SceneObject(BaseModel):
    id: str
    type: ObjectType
    position: Tuple[float, float, float]
    scale: Tuple[float, float, float] = (1.0, 1.0, 1.0)
    memory: str = ''
    audioUrl: Optional[str] = None

class Scene(BaseModel):
    title: str
    environment: str = 'bedroom'
    mood: str = 'nostalgic'
    objects: List[SceneObject] = Field(default_factory=list)

class GenerateResponse(BaseModel):
    scene: Scene
    source: Literal['ai', 'mock']
    fallback: bool
    reason: Optional[str] = None