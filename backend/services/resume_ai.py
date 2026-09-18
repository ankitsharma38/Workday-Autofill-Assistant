"""LangChain + OpenAI chain that converts raw resume text into structured JSON."""

import json

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from config import OPENAI_API_KEY, OPENAI_MODEL
from schemas.resume_schema import ResumeData

SYSTEM_PROMPT = """You are a resume parsing engine. Convert the raw resume text into STRICT JSON \
matching this schema exactly, with no extra keys and no commentary:

{
  "name": "", "email": "", "phone": "", "location": "",
  "links": {"linkedin": "", "github": ""},
  "experience": [{"title": "", "company": "", "start": "", "end": "", "description": ""}],
  "education": [{"degree": "", "institution": "", "year": ""}],
  "skills": [],
  "certifications": []
}

Rules:
- Infer missing or implicit information where reasonably possible (e.g. normalize date formats \
to YYYY-MM, dedupe/normalize skill names like "React.js" -> "React").
- If a field is truly unavailable, use an empty string or empty list/object — never invent facts.
- Output ONLY the JSON object, nothing else, no markdown fences.
"""


def structure_resume(raw_text: str) -> ResumeData:
    llm = ChatOpenAI(
        api_key=OPENAI_API_KEY,
        model=OPENAI_MODEL,
        temperature=0,
        model_kwargs={"response_format": {"type": "json_object"}},
    )
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=f"Resume text:\n\n{raw_text}"),
    ]
    response = llm.invoke(messages)
    data = json.loads(response.content)
    return ResumeData(**data)
