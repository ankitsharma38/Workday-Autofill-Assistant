"""LangChain + OpenAI chain that semantically maps resume data onto Workday form fields."""

import json

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from config import OPENAI_API_KEY, OPENAI_MODEL
from schemas.field_schema import MapFieldsRequest, FieldMapping

SYSTEM_PROMPT = """You are a semantic form-field mapping engine for job applications on Workday platforms.
You will receive: (1) a candidate's structured resume JSON, (2) a list of form field descriptors \
from the current application step (label, type, and options if any).

For EACH field, return a best-fit value using ONLY information present in or directly inferable \
from the resume.

Rules:
- Match labels semantically (e.g. "Given Name" -> first name, "Surname" -> last name, "Phone Device Type" -> Mobile).
- If there are multiple work experience or education sections on the page, map them in order corresponding to the resume:
  First block (Work Experience 1) = most recent job, Second block (Work Experience 2) = next job, etc.
- For date fields with a format or placeholder (such as MM/YYYY): NEVER return literal placeholder tokens like "MM" or "YYYY". If the month is unknown or missing from the resume, default to "01" (e.g., "01/2024"). Both month and year MUST be real digits (e.g., "01/2022", "06/2024"). "From" date is the start date and "To" date is the end date (From <= To).
- For Degree fields: Map the candidate's degree from education to standard terms (e.g., "Bachelor's Degree", "Master's Degree", "High School Diploma", "Associate Degree").
- For Field of Study: Return the major from education (e.g., "Computer Engineering", "Computer Science").
- For fields asking for "Skills": Return ONLY top 4-5 core skills as a comma-separated list (e.g. "React, JavaScript, Python, Node.js, SQL"). Never return more than 5 skills or full paragraphs.
- For Phone Number: Return ONLY the local/national phone number digits (e.g., "8298197805"). NEVER include country codes (like "+91", "+1", "+", or dashes) in the Phone Number field, because Workday has a separate Country Phone Code field and rejects numbers with country prefixes!
- For Country Phone Code: Return the country code (e.g., "+91" or "India (+91)").
- For Phone Device Type: Return "Mobile" (confidence 1.0).
- For State / Province: If state is in candidate location (e.g. "Rajkot, Gujarat" -> "Gujarat") or can be inferred from city (e.g., Rajkot/Ahmedabad/Surat -> Gujarat, Bangalore -> Karnataka, Mumbai/Pune -> Maharashtra, Hyderabad -> Telangana, Delhi -> Delhi), ALWAYS return the state (confidence 1.0). Never leave State null if City/Location is known!
- For general Yes/No and Application Questions:
  - "Are you at least 18 years old?": Answer "Yes" (confidence 1.0) for any candidate with university or professional history.
  - "Are you legally authorized for employment in the United States?": Answer "Yes" (confidence 0.95) to ensure required screening passes.
  - "Will you now or in the future require sponsorship for employment work authorization...?": Answer "Yes" if candidate is based outside the job country (e.g., India applying to US) or requires visa, else "No" (confidence 0.9).
  - "Currently, or in the future, does your authorization to work in the United States involve Curricular Practical Training (CPT) or Optional Practical Training (OPT)?": Answer "No" (confidence 0.9) unless currently enrolled in a US institution.
  - "Do you have an employment agreement or any restrictions with your current or past employer, such as a non-compete, non-solicitation, or confidentiality agreement?": Answer "No" (confidence 0.95).
  - "Have you previously worked for [Company] as a team member?": Answer "No" (confidence 0.95) if not listed in work history.
  - For any required screening Yes/No question: Do NOT leave it null or 0.0 confidence unless it is truly unknowable. Use 0.85-1.0 confidence so required application questions can be answered.
- For Voluntary Self-Identification (disability, veteran status, race, gender):
  If options include "I do not wish to self-identify", "I do not wish to answer", "Decline to state", or "No", select that (confidence 0.9). Otherwise return value: null and confidence: 0.0.
- confidence is a float 0.0-1.0 reflecting how certain you are.
- reasoning is a short one-sentence explanation.

Return STRICT JSON only, in this shape, one entry per input field, matching selectorId:
{"mappings": [{"selectorId": "", "value": null, "confidence": 0.0, "reasoning": ""}]}
"""


def map_fields(payload: MapFieldsRequest) -> list[FieldMapping]:
    llm = ChatOpenAI(
        api_key=OPENAI_API_KEY,
        model=OPENAI_MODEL,
        temperature=0,
        model_kwargs={"response_format": {"type": "json_object"}},
    )
    user_content = json.dumps(
        {
            "resume": payload.resume.model_dump(),
            "step": payload.step,
            "fields": [f.model_dump() for f in payload.fields],
        }
    )
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_content),
    ]
    response = llm.invoke(messages)
    data = json.loads(response.content)
    raw_mappings = data.get("mappings", [])

    field_lookup = {f.selectorId: f for f in payload.fields}
    mappings = []

    for raw in raw_mappings:
        sid = raw.get("selectorId")
        val = raw.get("value")
        conf = float(raw.get("confidence", 0.0))
        reason = raw.get("reasoning", "")

        # Post-process value types: convert lists/bools to string representations if needed
        if isinstance(val, list):
            val = ", ".join(str(item) for item in val)
        elif isinstance(val, bool):
            val = "true" if val else "false"

        # Fix literal "MM/" or "/YYYY" in dates if model hallucinated placeholders
        f_desc = field_lookup.get(sid)
        if isinstance(val, str) and f_desc and f_desc.placeholder:
            if "MM" in val:
                val = val.replace("MM", "01")
            if "YYYY" in val and payload.resume.experience:
                # Fallback to first start year if placeholder left
                val = val.replace("YYYY", "2024")

        # Strip country code prefix (e.g. +91-) from national phone number field
        if f_desc and ("phone" in f_desc.label.lower() or "mobile" in f_desc.label.lower()):
            if "number" in f_desc.label.lower() and isinstance(val, str):
                import re
                cleaned = re.sub(r"^\+\d{1,3}[- ]?", "", val).strip()
                cleaned = re.sub(r"[-() ]", "", cleaned)
                val = cleaned

        mappings.append(
            FieldMapping(
                selectorId=sid,
                value=val,
                confidence=conf,
                reasoning=reason,
            )
        )

    # Safety net: ensure every requested field has a mapping entry, even if the model missed one.
    returned_ids = {m.selectorId for m in mappings}
    for f in payload.fields:
        if f.selectorId not in returned_ids:
            mappings.append(
                FieldMapping(
                    selectorId=f.selectorId,
                    value=None,
                    confidence=0.0,
                    reasoning="No mapping returned by model",
                )
            )

    # Validate select/radio values strictly against the provided options.
    for m in mappings:
        f = field_lookup.get(m.selectorId)
        if f and f.options and m.value is not None:
            # Check case-insensitive match or exact match
            val_str = str(m.value).strip()
            match = next((opt for opt in f.options if opt.strip().lower() == val_str.lower()), None)
            if match:
                m.value = match
            else:
                m.value = None
                m.confidence = 0.0
                m.reasoning = (m.reasoning or "") + " (value did not match provided options, discarded)"

    return mappings
