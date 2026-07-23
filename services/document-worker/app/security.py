from __future__ import annotations

import io
import math
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from .config import (
    ALLOWED_CONTENT_TYPES,
    MAX_INPUT_PAGES,
    MAX_PAGE_EDGE_POINTS,
    MAX_UPLOAD_BYTES,
)
from .errors import DocumentError


@dataclass(frozen=True)
class PdfValidation:
    page_count: int


def safe_filename(filename: str | None) -> str:
    candidate = Path((filename or "resume.pdf").replace("\\", "/")).name
    cleaned = "".join(char for char in candidate if char.isprintable() and char not in "\r\n\x00")
    return (cleaned or "resume.pdf")[:180]


async def read_upload_limited(upload: UploadFile) -> bytes:
    if upload.content_type and upload.content_type.lower() not in ALLOWED_CONTENT_TYPES:
        raise DocumentError(
            "UNSUPPORTED_MEDIA_TYPE",
            "Only PDF uploads are accepted.",
            status_code=415,
        )

    chunks: list[bytes] = []
    size = 0
    while chunk := await upload.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_UPLOAD_BYTES:
            raise DocumentError(
                "FILE_TOO_LARGE",
                "The PDF exceeds the 10 MB upload limit.",
                status_code=413,
            )
        chunks.append(chunk)

    data = b"".join(chunks)
    if not data:
        raise DocumentError("EMPTY_FILE", "The uploaded file is empty.")
    return data


def validate_pdf_bytes(data: bytes) -> PdfValidation:
    if len(data) > MAX_UPLOAD_BYTES:
        raise DocumentError(
            "FILE_TOO_LARGE",
            "The PDF exceeds the 10 MB upload limit.",
            status_code=413,
        )
    if not data.startswith(b"%PDF-"):
        raise DocumentError(
            "INVALID_PDF_MAGIC",
            "The file does not have a valid PDF signature.",
            status_code=415,
        )

    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise DocumentError(
                "ENCRYPTED_PDF",
                "Password-protected PDFs are not supported.",
            )
        page_count = len(reader.pages)
        if page_count == 0:
            raise DocumentError("EMPTY_PDF", "The PDF does not contain any pages.")
        if page_count > MAX_INPUT_PAGES:
            raise DocumentError(
                "TOO_MANY_PAGES",
                f"The PDF contains {page_count} pages; the limit is {MAX_INPUT_PAGES}.",
                status_code=413,
            )

        for index, page in enumerate(reader.pages, start=1):
            user_unit = float(page.get("/UserUnit", 1) or 1)
            width = abs(float(page.mediabox.width)) * user_unit
            height = abs(float(page.mediabox.height)) * user_unit
            if not all(math.isfinite(value) and value > 0 for value in (width, height)):
                raise DocumentError(
                    "INVALID_PAGE_SIZE",
                    f"Page {index} has invalid dimensions.",
                )
            if max(width, height) > MAX_PAGE_EDGE_POINTS:
                raise DocumentError(
                    "PAGE_TOO_LARGE",
                    f"Page {index} exceeds the supported page dimensions.",
                    status_code=413,
                )
    except DocumentError:
        raise
    except (PdfReadError, ValueError, TypeError, OSError) as exc:
        raise DocumentError("MALFORMED_PDF", "The PDF is damaged or malformed.") from exc

    return PdfValidation(page_count=page_count)
