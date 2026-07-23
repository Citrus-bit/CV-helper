from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader

from .config import (
    ALLOWED_TEMPLATES,
    RENDER_TIMEOUT_SECONDS,
    template_directory,
    typst_binary,
)
from .errors import DocumentError
from .models import ResumePayload, TemplateName


MAX_RENDER_INPUT_BYTES = 2 * 1024 * 1024
MAX_RENDER_OUTPUT_BYTES = 10 * 1024 * 1024


@dataclass(frozen=True)
class RenderedResume:
    pdf: bytes
    page_count: int
    searchable: bool


def _template_path(template: str) -> Path:
    if template not in ALLOWED_TEMPLATES:
        raise DocumentError("UNKNOWN_TEMPLATE", "The requested resume template is not available.", 404)
    directory = template_directory()
    candidate = directory / f"{template}.typ"
    if candidate.is_symlink() or not candidate.is_file():
        raise DocumentError("TEMPLATE_UNAVAILABLE", "The requested resume template is unavailable.", 503)
    if candidate.resolve().parent != directory.resolve():
        raise DocumentError("INVALID_TEMPLATE_PATH", "The resume template path is not allowed.", 400)
    return candidate


def _audit_pdf(data: bytes) -> tuple[int, bool]:
    if not data.startswith(b"%PDF-") or len(data) > MAX_RENDER_OUTPUT_BYTES:
        raise DocumentError("INVALID_RENDER_OUTPUT", "The renderer produced an invalid PDF.", 502)
    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        page_count = len(reader.pages)
        searchable = any((page.extract_text() or "").strip() for page in reader.pages)
    except Exception as exc:
        raise DocumentError("INVALID_RENDER_OUTPUT", "The renderer produced an unreadable PDF.", 502) from exc
    if page_count == 0:
        raise DocumentError("INVALID_RENDER_OUTPUT", "The renderer produced an empty PDF.", 502)
    if not searchable:
        raise DocumentError("NON_SEARCHABLE_OUTPUT", "The rendered PDF does not contain searchable text.", 502)
    return page_count, searchable


def render_resume(template: TemplateName, resume: ResumePayload) -> RenderedResume:
    binary = typst_binary()
    if binary is None:
        raise DocumentError(
            "TYPST_UNAVAILABLE",
            "Typst is not installed. Run scripts/bootstrap-tools.sh before rendering.",
            503,
        )
    source_template = _template_path(template)
    json_bytes = json.dumps(
        resume.model_dump(mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    if len(json_bytes) > MAX_RENDER_INPUT_BYTES:
        raise DocumentError("RENDER_INPUT_TOO_LARGE", "The structured resume exceeds the render limit.", 413)

    with tempfile.TemporaryDirectory(prefix="resume-render-") as temporary_directory:
        workdir = Path(temporary_directory)
        shutil.copyfile(source_template, workdir / "main.typ")
        (workdir / "resume.json").write_bytes(json_bytes)
        output = workdir / "preview.pdf"
        environment = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "LANG": os.environ.get("LANG", "C.UTF-8"),
            "SOURCE_DATE_EPOCH": "0",
        }
        try:
            completed = subprocess.run(
                [
                    str(binary),
                    "compile",
                    "--root",
                    str(workdir),
                    "--diagnostic-format",
                    "short",
                    "main.typ",
                    "preview.pdf",
                ],
                cwd=workdir,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=RENDER_TIMEOUT_SECONDS,
                check=False,
                shell=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise DocumentError("RENDER_TIMEOUT", "Resume rendering timed out.", 504) from exc
        except OSError as exc:
            raise DocumentError("RENDER_UNAVAILABLE", "The resume renderer could not be started.", 503) from exc
        if completed.returncode != 0 or not output.is_file():
            raise DocumentError("RENDER_FAILED", "The resume template could not be rendered.", 422)
        pdf = output.read_bytes()

    page_count, searchable = _audit_pdf(pdf)
    return RenderedResume(pdf=pdf, page_count=page_count, searchable=searchable)
