from __future__ import annotations

import io

import pytest
from pypdf import PdfReader, PdfWriter

from app.config import MAX_UPLOAD_BYTES
from app.errors import DocumentError
from app.security import safe_filename, validate_pdf_bytes


def test_accepts_valid_digital_pdf(digital_pdf: bytes) -> None:
    validation = validate_pdf_bytes(digital_pdf)
    assert validation.page_count == 1


@pytest.mark.parametrize(
    ("payload", "expected_code"),
    [
        (b"not a pdf", "INVALID_PDF_MAGIC"),
        (b"", "INVALID_PDF_MAGIC"),
        (b"%PDF-broken", "MALFORMED_PDF"),
    ],
)
def test_rejects_non_pdf_and_malformed_content(payload: bytes, expected_code: str) -> None:
    with pytest.raises(DocumentError) as captured:
        validate_pdf_bytes(payload)
    assert captured.value.code == expected_code


def test_rejects_oversized_file_before_parsing() -> None:
    with pytest.raises(DocumentError) as captured:
        validate_pdf_bytes(b"%PDF-" + b"0" * MAX_UPLOAD_BYTES)
    assert captured.value.code == "FILE_TOO_LARGE"
    assert captured.value.status_code == 413


def test_rejects_more_than_five_pages() -> None:
    writer = PdfWriter()
    for _ in range(6):
        writer.add_blank_page(width=595, height=842)
    output = io.BytesIO()
    writer.write(output)

    with pytest.raises(DocumentError) as captured:
        validate_pdf_bytes(output.getvalue())
    assert captured.value.code == "TOO_MANY_PAGES"


def test_rejects_encrypted_pdf(digital_pdf: bytes) -> None:
    reader = PdfReader(io.BytesIO(digital_pdf))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.encrypt("secret")
    output = io.BytesIO()
    writer.write(output)

    with pytest.raises(DocumentError) as captured:
        validate_pdf_bytes(output.getvalue())
    assert captured.value.code == "ENCRYPTED_PDF"


def test_rejects_unbounded_page_dimensions() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=5000, height=5000)
    output = io.BytesIO()
    writer.write(output)

    with pytest.raises(DocumentError) as captured:
        validate_pdf_bytes(output.getvalue())
    assert captured.value.code == "PAGE_TOO_LARGE"


def test_filename_is_reduced_to_a_safe_basename() -> None:
    assert safe_filename("../../private/resume\n.pdf") == "resume.pdf"
    assert safe_filename("..\\..\\private\\resume.pdf") == "resume.pdf"
