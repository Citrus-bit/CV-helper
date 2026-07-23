from __future__ import annotations

import os
from pathlib import Path


def _bounded_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return min(max(value, minimum), maximum)


MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_INPUT_PAGES = 5
MAX_PAGE_EDGE_POINTS = 2_000
MAX_PAGE_PIXELS = 20_000_000
MAX_CHARACTERS_PER_PAGE = 40_000
MAX_NATIVE_TEXT_CHARACTERS_PER_PAGE = 80_000
MAX_NATIVE_CHARACTER_TEXT_LENGTH = 32
MAX_FONT_NAME_LENGTH = 256
MAX_WORDS_PER_PAGE = 10_000
MAX_WORD_TEXT_LENGTH = 2_000
MAX_NATIVE_BLOCK_TEXT_CHARACTERS_PER_PAGE = 120_000
MAX_IMAGE_BOXES_PER_PAGE = 256

MAX_OCR_REGIONS_PER_PAGE = 4
MAX_OCR_REGIONS_PER_DOCUMENT = 8
MAX_OCR_REGION_PIXELS = 12_000_000
MAX_OCR_FRAGMENTS_PER_REGION = 2_000
MAX_OCR_BLOCKS_PER_PAGE = 4_000
MAX_OCR_FRAGMENT_TEXT_LENGTH = 2_000
MAX_OCR_TEXT_CHARACTERS_PER_PAGE = 120_000
MAX_OCR_TSV_ROWS_PER_REGION = 20_000
MAX_OCR_OUTPUT_BYTES = 8 * 1024 * 1024
MAX_OCR_CONCURRENCY = _bounded_int_env("MAX_OCR_CONCURRENCY", 2, 1, 4)
MAX_OCR_CALL_TIMEOUT_SECONDS = 20
TESSERACT_TIMEOUT_SECONDS = _bounded_int_env(
    "TESSERACT_TIMEOUT_SECONDS",
    12,
    1,
    MAX_OCR_CALL_TIMEOUT_SECONDS,
)
OCR_DOCUMENT_TIMEOUT_SECONDS = _bounded_int_env("OCR_DOCUMENT_TIMEOUT_SECONDS", 45, 5, 60)

RENDER_DPI = 144
RENDER_TIMEOUT_SECONDS = 20
ALLOWED_CONTENT_TYPES = {"application/pdf", "application/octet-stream"}
ALLOWED_TEMPLATES = {"professional", "minimal", "compact"}


def project_root() -> Path:
    module_path = Path(__file__).resolve()
    for parent in module_path.parents:
        if (parent / "templates" / "typst").is_dir():
            return parent
    return module_path.parent.parent


def template_directory() -> Path:
    configured = os.getenv("TYPST_TEMPLATE_DIR")
    return Path(configured).resolve() if configured else project_root() / "templates" / "typst"


def typst_binary() -> Path | None:
    configured = os.getenv("TYPST_BIN")
    candidates = []
    if configured:
        path = Path(configured)
        candidates.append(path if path.is_absolute() else project_root() / path)
    candidates.append(project_root() / ".tools" / "typst" / "typst")

    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate.resolve()
    return None
