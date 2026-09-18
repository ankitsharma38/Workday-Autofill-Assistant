from fastapi import APIRouter, UploadFile, File, HTTPException

from services.parser import extract_resume_text
from services.resume_ai import structure_resume
from schemas.resume_schema import ResumeData

router = APIRouter()


@router.post("/parse-resume", response_model=ResumeData)
async def parse_resume(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".pdf", ".docx")):
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload a .pdf or .docx file.")

    file_bytes = await file.read()

    try:
        raw_text = extract_resume_text(file.filename, file_bytes)
        if not raw_text.strip():
            raise ValueError("No extractable text found in file.")
        resume_data = structure_resume(raw_text)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Resume parsing failed: {str(e)}")

    return resume_data
