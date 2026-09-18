from pydantic import BaseModel, Field
from typing import List, Optional


class Link(BaseModel):
    linkedin: Optional[str] = ""
    github: Optional[str] = ""


class Experience(BaseModel):
    title: str = ""
    company: str = ""
    start: str = ""
    end: str = ""
    description: str = ""


class Education(BaseModel):
    degree: str = ""
    institution: str = ""
    year: str = ""


class ResumeData(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    links: Link = Field(default_factory=Link)
    experience: List[Experience] = Field(default_factory=list)
    education: List[Education] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    certifications: List[str] = Field(default_factory=list)
