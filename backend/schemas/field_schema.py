from typing import List, Optional, Union
from pydantic import BaseModel

from schemas.resume_schema import ResumeData


class FieldDescriptor(BaseModel):
    selectorId: str
    label: str
    type: str
    placeholder: Optional[str] = None
    options: Optional[List[str]] = None


class MapFieldsRequest(BaseModel):
    resume: ResumeData
    step: Optional[str] = ""
    fields: List[FieldDescriptor]


class FieldMapping(BaseModel):
    selectorId: str
    value: Optional[Union[str, List[str], bool, int, float]] = None
    confidence: float = 0.0
    reasoning: str = ""


class MapFieldsResponse(BaseModel):
    mappings: List[FieldMapping]
