"""Backend contract proposal; renderer team must confirm before shared adoption."""
from typing import Annotated, List, Literal, Optional, Tuple
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

AssetType = Literal['desk', 'bed', 'chair', 'window', 'bookshelf', 'lamp', 'photo-frame']
Mood = Literal['nostalgic', 'joyful', 'melancholic']
Coordinate = Annotated[float, Field(ge=-10, le=10, allow_inf_nan=False, strict=True)]
Scale = Annotated[float, Field(gt=0, le=5, allow_inf_nan=False, strict=True)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]

class ContractModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

class SceneObject(ContractModel):
    id: Annotated[str, StringConstraints(pattern=r'^[A-Za-z0-9_-]{1,64}$')]
    type: AssetType
    position: Tuple[Coordinate, Coordinate, Coordinate]
    scale: Tuple[Scale, Scale, Scale]
    memory: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
    # No audio assets exist yet. Never render provider-supplied URLs.
    audioUrl: Optional[str]

    @model_validator(mode='after')
    def no_untrusted_audio(self):
        if self.audioUrl is not None:
            raise ValueError('audioUrl must be null until an audio catalog is coordinated')
        return self

class Scene(ContractModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    environment: Literal['bedroom']
    mood: Mood
    objects: List[SceneObject] = Field(min_length=1, max_length=7)

    @model_validator(mode='after')
    def unique_ids(self):
        if len({obj.id for obj in self.objects}) != len(self.objects):
            raise ValueError('Object IDs must be unique')
        return self

class VisibleObject(ContractModel):
    description: Text
    location: Text

class PhotoAnalysis(ContractModel):
    objects: List[VisibleObject] = Field(max_length=20)
    spatial_layout: Text
    lighting: Text
    colors: List[Annotated[str, StringConstraints(min_length=1, max_length=80)]] = Field(max_length=10)
    uncertainty: Text

class GenerateResponse(ContractModel):
    scene: Scene
    source: Literal['ai', 'mock']
    fallback: bool
    reason: Optional[Literal['demo_mode', 'missing_credentials', 'provider_timeout', 'provider_failure', 'invalid_model_output']]


    @model_validator(mode='after')
    def consistent_provenance(self):
        if self.source == 'ai' and (self.fallback or self.reason is not None):
            raise ValueError('AI success cannot carry fallback provenance')
        if self.source == 'mock' and (not self.fallback or self.reason is None):
            raise ValueError('Mock output requires fallback provenance')
        return self
