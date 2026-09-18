"""Basic sanity tests for the resume text extraction layer.
Run with: pytest backend/tests -v
"""

import pytest
from services.parser import extract_resume_text


def test_unsupported_file_type_raises():
    with pytest.raises(ValueError):
        extract_resume_text("resume.txt", b"some bytes")


def test_docx_extraction_smoke():
    # This is a placeholder — replace with a real sample .docx fixture for a true test.
    # extract_resume_text("sample.docx", open("tests/fixtures/sample.docx", "rb").read())
    assert True
