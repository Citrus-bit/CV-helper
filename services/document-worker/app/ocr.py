from __future__ import annotations

import csv
import io
import math
import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from functools import lru_cache
from itertools import islice
from typing import Any, Protocol

from .config import (
    MAX_OCR_FRAGMENT_TEXT_LENGTH,
    MAX_OCR_FRAGMENTS_PER_REGION,
    MAX_OCR_OUTPUT_BYTES,
    MAX_OCR_TEXT_CHARACTERS_PER_PAGE,
    MAX_OCR_TSV_ROWS_PER_REGION,
    TESSERACT_TIMEOUT_SECONDS,
)


@dataclass(frozen=True)
class OcrFragment:
    text: str
    confidence: float
    bbox: tuple[float, float, float, float]


class OCRTimeoutError(RuntimeError):
    """Raised when a bounded OCR call reaches its deadline."""


class OCRInputLimitError(RuntimeError):
    """Raised when an OCR engine returns more data than can be safely expanded."""


class OCRProvider(Protocol):
    provider_id: str
    available: bool
    warning: str | None

    def recognize(
        self,
        image: Any,
        *,
        timeout_seconds: float | None = None,
    ) -> list[OcrFragment]: ...


class UnavailableOCRProvider:
    provider_id = "none"
    available = False

    def __init__(self, warning: str) -> None:
        self.warning = warning

    def recognize(
        self,
        image: Any,
        *,
        timeout_seconds: float | None = None,
    ) -> list[OcrFragment]:
        return []


class TesseractCLIProvider:
    provider_id = "tesseract"
    available = True
    warning = None

    def __init__(self) -> None:
        executable = shutil.which("tesseract")
        if not executable:
            raise RuntimeError("The local tesseract executable is not installed.")
        self._executable = executable
        self._language = os.getenv("TESSERACT_LANGUAGE", "chi_sim+eng")
        self._timeout = TESSERACT_TIMEOUT_SECONDS

    def recognize(
        self,
        image: Any,
        *,
        timeout_seconds: float | None = None,
    ) -> list[OcrFragment]:
        started_at = time.monotonic()
        call_budget = self._timeout
        if timeout_seconds is not None:
            if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
                raise OCRTimeoutError("The OCR call deadline was reached.")
            call_budget = min(call_budget, timeout_seconds)

        payload = io.BytesIO()
        image.convert("RGB").save(payload, format="PNG")
        subprocess_budget = call_budget - (time.monotonic() - started_at)
        if subprocess_budget <= 0:
            raise OCRTimeoutError("The OCR call deadline was reached while preparing the image.")
        try:
            completed = subprocess.run(
                [
                    self._executable,
                    "stdin",
                    "stdout",
                    "-l",
                    self._language,
                    "--psm",
                    "6",
                    "tsv",
                ],
                input=payload.getvalue(),
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                check=False,
                timeout=subprocess_budget,
            )
        except subprocess.TimeoutExpired as exc:
            raise OCRTimeoutError("Local Tesseract OCR reached its per-call timeout.") from exc
        if completed.returncode != 0:
            raise RuntimeError("Local Tesseract OCR failed.")
        if len(completed.stdout) > MAX_OCR_OUTPUT_BYTES:
            raise OCRInputLimitError("Local Tesseract OCR output exceeded the safe byte limit.")

        lines: dict[tuple[str, str, str, str], dict[str, Any]] = {}
        reader = csv.DictReader(io.StringIO(completed.stdout.decode("utf-8", errors="replace")), delimiter="\t")
        total_text_characters = 0
        for row_index, row in enumerate(reader):
            if row_index % 256 == 0 and time.monotonic() - started_at >= call_budget:
                raise OCRTimeoutError("Local Tesseract OCR reached its per-call timeout.")
            if row_index >= MAX_OCR_TSV_ROWS_PER_REGION:
                raise OCRInputLimitError("Local Tesseract OCR returned too many TSV rows.")
            text = (row.get("text") or "").strip()
            if len(text) > MAX_OCR_FRAGMENT_TEXT_LENGTH:
                raise OCRInputLimitError("Local Tesseract OCR returned an oversized word.")
            try:
                confidence = float(row.get("conf") or "-1")
                left = int(row.get("left") or "0")
                top = int(row.get("top") or "0")
                width = int(row.get("width") or "0")
                height = int(row.get("height") or "0")
            except ValueError:
                continue
            if not text or confidence < 0 or width <= 0 or height <= 0:
                continue
            key = (
                row.get("page_num") or "0",
                row.get("block_num") or "0",
                row.get("par_num") or "0",
                row.get("line_num") or "0",
            )
            if key not in lines and len(lines) >= MAX_OCR_FRAGMENTS_PER_REGION:
                raise OCRInputLimitError("Local Tesseract OCR returned too many text lines.")
            line = lines.setdefault(
                key,
                {
                    "words": [],
                    "confidences": [],
                    "x0": left,
                    "top": top,
                    "x1": left + width,
                    "bottom": top + height,
                    "text_length": 0,
                },
            )
            additional_length = len(text) + (1 if line["words"] else 0)
            if line["text_length"] + additional_length > MAX_OCR_FRAGMENT_TEXT_LENGTH:
                raise OCRInputLimitError("Local Tesseract OCR returned an oversized text line.")
            total_text_characters += additional_length
            if total_text_characters > MAX_OCR_TEXT_CHARACTERS_PER_PAGE:
                raise OCRInputLimitError("Local Tesseract OCR returned too much text.")
            line["words"].append(text)
            line["confidences"].append(confidence)
            line["text_length"] += additional_length
            line["x0"] = min(line["x0"], left)
            line["top"] = min(line["top"], top)
            line["x1"] = max(line["x1"], left + width)
            line["bottom"] = max(line["bottom"], top + height)

        fragments: list[OcrFragment] = []
        for line in lines.values():
            if time.monotonic() - started_at >= call_budget:
                raise OCRTimeoutError("Local Tesseract OCR reached its per-call timeout.")
            confidences = line["confidences"]
            fragments.append(
                OcrFragment(
                    " ".join(line["words"]),
                    sum(confidences) / len(confidences) / 100,
                    (line["x0"], line["top"], line["x1"], line["bottom"]),
                )
            )
        return fragments


class PaddleOCRProvider:
    provider_id = "paddleocr"
    available = True
    warning = None

    def __init__(self) -> None:
        from paddleocr import PaddleOCR  # type: ignore[import-not-found]

        detector = os.getenv("PADDLEOCR_DET_MODEL_DIR")
        recognizer = os.getenv("PADDLEOCR_REC_MODEL_DIR")
        allow_download = os.getenv("PADDLEOCR_ALLOW_MODEL_DOWNLOAD", "false").lower() == "true"
        if not allow_download and (not detector or not recognizer):
            raise RuntimeError(
                "PaddleOCR is installed but local detection and recognition model directories are not configured."
            )

        language = os.getenv("PADDLEOCR_LANGUAGE", "ch")
        kwargs: dict[str, Any] = {"lang": language, "use_doc_orientation_classify": True}
        if detector and recognizer:
            kwargs.update(
                {
                    "text_detection_model_dir": detector,
                    "text_recognition_model_dir": recognizer,
                }
            )
        try:
            self._engine = PaddleOCR(**kwargs)
        except TypeError:
            legacy_kwargs: dict[str, Any] = {"lang": language, "use_angle_cls": True, "show_log": False}
            if detector and recognizer:
                legacy_kwargs.update({"det_model_dir": detector, "rec_model_dir": recognizer})
            self._engine = PaddleOCR(**legacy_kwargs)

    def recognize(
        self,
        image: Any,
        *,
        timeout_seconds: float | None = None,
    ) -> list[OcrFragment]:
        import numpy as np

        if timeout_seconds is not None and (not math.isfinite(timeout_seconds) or timeout_seconds <= 0):
            raise OCRTimeoutError("The OCR call deadline was reached.")
        started_at = time.monotonic()
        array = np.asarray(image.convert("RGB"))
        if hasattr(self._engine, "predict"):
            fragments = self._from_predict(self._engine.predict(array))
        else:
            fragments = self._from_legacy(self._engine.ocr(array, cls=True))
        if timeout_seconds is not None and time.monotonic() - started_at > timeout_seconds:
            raise OCRTimeoutError("PaddleOCR exceeded the remaining document OCR budget.")
        return fragments

    @staticmethod
    def _from_legacy(result: Any) -> list[OcrFragment]:
        fragments: list[OcrFragment] = []
        pages = result or []
        total_text_characters = 0
        for page_index, page in enumerate(pages):
            if page_index >= 2:
                raise OCRInputLimitError("PaddleOCR returned too many result pages for one region.")
            for line_index, line in enumerate(page or []):
                if line_index >= MAX_OCR_FRAGMENTS_PER_REGION:
                    raise OCRInputLimitError("PaddleOCR returned too many text fragments.")
                if not isinstance(line, (list, tuple)) or len(line) < 2:
                    continue
                polygon, recognition = line[0], line[1]
                if not isinstance(recognition, (list, tuple)) or len(recognition) < 2:
                    continue
                text, confidence = str(recognition[0]).strip(), float(recognition[1])
                if not text or polygon is None:
                    continue
                if len(text) > MAX_OCR_FRAGMENT_TEXT_LENGTH:
                    raise OCRInputLimitError("PaddleOCR returned an oversized text fragment.")
                total_text_characters += len(text)
                if total_text_characters > MAX_OCR_TEXT_CHARACTERS_PER_PAGE:
                    raise OCRInputLimitError("PaddleOCR returned too much text.")
                points = list(islice(polygon, 33))
                if not points or len(points) > 32:
                    raise OCRInputLimitError("PaddleOCR returned an invalid text polygon.")
                xs = [float(point[0]) for point in points]
                ys = [float(point[1]) for point in points]
                fragments.append(OcrFragment(text, confidence, (min(xs), min(ys), max(xs), max(ys))))
        return fragments

    @staticmethod
    def _from_predict(result: Any) -> list[OcrFragment]:
        fragments: list[OcrFragment] = []
        total_text_characters = 0
        for page_index, page in enumerate(result or []):
            if page_index >= 2:
                raise OCRInputLimitError("PaddleOCR returned too many result pages for one region.")
            payload = getattr(page, "json", page)
            if callable(payload):
                payload = payload()
            if isinstance(payload, dict) and "res" in payload:
                payload = payload["res"]
            if not isinstance(payload, dict):
                continue
            texts = payload.get("rec_texts", [])
            scores = payload.get("rec_scores", [])
            polygons = payload.get("rec_polys", payload.get("dt_polys", []))
            entries = zip(texts, scores, polygons)
            for entry_index, (text, score, polygon) in enumerate(entries):
                if entry_index >= MAX_OCR_FRAGMENTS_PER_REGION:
                    raise OCRInputLimitError("PaddleOCR returned too many text fragments.")
                clean_text = str(text).strip()
                if not clean_text or polygon is None:
                    continue
                if len(clean_text) > MAX_OCR_FRAGMENT_TEXT_LENGTH:
                    raise OCRInputLimitError("PaddleOCR returned an oversized text fragment.")
                total_text_characters += len(clean_text)
                if total_text_characters > MAX_OCR_TEXT_CHARACTERS_PER_PAGE:
                    raise OCRInputLimitError("PaddleOCR returned too much text.")
                points = list(islice(polygon, 33))
                if not points or len(points) > 32:
                    raise OCRInputLimitError("PaddleOCR returned an invalid text polygon.")
                xs = [float(point[0]) for point in points]
                ys = [float(point[1]) for point in points]
                fragments.append(
                    OcrFragment(clean_text, float(score), (min(xs), min(ys), max(xs), max(ys)))
                )
        return fragments


@lru_cache(maxsize=1)
def get_ocr_provider() -> OCRProvider:
    requested = os.getenv("OCR_PROVIDER", "tesseract").lower()
    if requested in {"none", "disabled"}:
        return UnavailableOCRProvider("OCR is disabled by configuration.")
    if requested == "tesseract":
        try:
            return TesseractCLIProvider()
        except (RuntimeError, OSError, ValueError) as exc:
            return UnavailableOCRProvider(f"Local Tesseract OCR is unavailable. Details: {exc}")
    if requested != "paddleocr":
        return UnavailableOCRProvider(f"Unknown OCR provider '{requested}'.")
    try:
        return PaddleOCRProvider()
    except (ImportError, RuntimeError, OSError) as exc:
        return UnavailableOCRProvider(
            "PaddleOCR is unavailable; native PDF text was retained and scanned regions were skipped. "
            f"Details: {exc}"
        )
