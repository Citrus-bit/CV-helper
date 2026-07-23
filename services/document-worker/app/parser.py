from __future__ import annotations

import base64
import hashlib
import io
import math
import threading
import time
import unicodedata
from dataclasses import dataclass
from itertools import islice
from typing import Any, Iterable

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image

from .config import (
    MAX_CHARACTERS_PER_PAGE,
    MAX_FONT_NAME_LENGTH,
    MAX_IMAGE_BOXES_PER_PAGE,
    MAX_NATIVE_BLOCK_TEXT_CHARACTERS_PER_PAGE,
    MAX_NATIVE_CHARACTER_TEXT_LENGTH,
    MAX_NATIVE_TEXT_CHARACTERS_PER_PAGE,
    MAX_OCR_BLOCKS_PER_PAGE,
    MAX_OCR_CALL_TIMEOUT_SECONDS,
    MAX_OCR_CONCURRENCY,
    MAX_OCR_FRAGMENT_TEXT_LENGTH,
    MAX_OCR_FRAGMENTS_PER_REGION,
    MAX_OCR_REGION_PIXELS,
    MAX_OCR_REGIONS_PER_DOCUMENT,
    MAX_OCR_REGIONS_PER_PAGE,
    MAX_OCR_TEXT_CHARACTERS_PER_PAGE,
    MAX_PAGE_PIXELS,
    MAX_WORDS_PER_PAGE,
    MAX_WORD_TEXT_LENGTH,
    OCR_DOCUMENT_TIMEOUT_SECONDS,
    RENDER_DPI,
)
from .errors import DocumentError
from .models import (
    BoundingBox,
    Character,
    PageMetrics,
    ParsedPage,
    ParseResponse,
    ParseWarning,
    TextBlock,
)
from .ocr import OCRInputLimitError, OCRProvider, OCRTimeoutError, get_ocr_provider
from .security import safe_filename, validate_pdf_bytes


@dataclass(frozen=True)
class PageSignals:
    native_character_count: int
    unicode_valid_ratio: float
    text_area_ratio: float
    image_area_ratio: float


@dataclass(frozen=True)
class NativeContentLimits:
    characters_truncated: bool
    words_truncated: bool
    image_boxes_truncated: bool


@dataclass(frozen=True)
class OcrRegionSelection:
    regions: list[BoundingBox]
    limit_reached: bool


@dataclass(frozen=True)
class OcrRunResult:
    blocks: list[TextBlock]
    processed_regions: int
    budget_exhausted: bool = False
    timed_out: bool = False
    output_limit_reached: bool = False
    oversized_regions: int = 0


_OCR_CAPACITY = threading.BoundedSemaphore(MAX_OCR_CONCURRENCY)


def classify_page(signals: PageSignals) -> str:
    has_usable_text = signals.native_character_count >= 20 and signals.unicode_valid_ratio >= 0.85
    if not has_usable_text:
        return "scan"
    if signals.image_area_ratio >= 0.30:
        return "mixed"
    return "digital"


def _number(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if math.isfinite(result) else default


def _bbox(item: dict[str, Any], page_width: float, page_height: float) -> BoundingBox:
    x0 = min(max(_number(item.get("x0")), 0), page_width)
    x1 = min(max(_number(item.get("x1")), x0), page_width)
    top_value = item.get("top")
    bottom_value = item.get("bottom")
    if top_value is None or bottom_value is None:
        y0 = _number(item.get("y0"))
        y1 = _number(item.get("y1"))
        top_value = page_height - max(y0, y1)
        bottom_value = page_height - min(y0, y1)
    top = min(max(_number(top_value), 0), page_height)
    bottom = min(max(_number(bottom_value), top), page_height)
    return BoundingBox(x0=x0, top=top, x1=x1, bottom=bottom)


def _unicode_valid_ratio(texts: Iterable[str]) -> float:
    character_count = 0
    valid = 0
    for text in texts:
        for char in text:
            if char.isspace():
                continue
            character_count += 1
            category = unicodedata.category(char)
            if char != "\ufffd" and not category.startswith("C"):
                valid += 1
    return valid / character_count if character_count else 0.0


def _area_ratio(boxes: Iterable[BoundingBox], page_area: float) -> float:
    if page_area <= 0:
        return 0.0
    area = sum(max(box.x1 - box.x0, 0) * max(box.bottom - box.top, 0) for box in boxes)
    return min(max(area / page_area, 0.0), 1.0)


def _native_content(
    page: Any,
) -> tuple[
    list[Character],
    list[TextBlock],
    PageSignals,
    list[BoundingBox],
    NativeContentLimits,
]:
    width, height = float(page.width), float(page.height)
    raw_chars = page.chars or []
    characters_truncated = len(raw_chars) > MAX_CHARACTERS_PER_PAGE
    native_text_characters = 0
    all_texts: list[str] = []
    char_boxes: list[BoundingBox] = []
    characters: list[Character] = []
    for raw_character in islice(raw_chars, MAX_CHARACTERS_PER_PAGE):
        if not isinstance(raw_character, dict):
            characters_truncated = True
            continue
        raw_text_value = raw_character.get("text", "")
        raw_text = raw_text_value if isinstance(raw_text_value, str) else str(raw_text_value)
        remaining_text = MAX_NATIVE_TEXT_CHARACTERS_PER_PAGE - native_text_characters
        if remaining_text <= 0:
            characters_truncated = True
            break
        text_limit = min(MAX_NATIVE_CHARACTER_TEXT_LENGTH, remaining_text)
        text = raw_text[:text_limit]
        if len(raw_text) > len(text):
            characters_truncated = True
        native_text_characters += len(text)
        box = _bbox(raw_character, width, height)
        all_texts.append(text)
        char_boxes.append(box)
        characters.append(
            Character(
                text=text,
                bbox=box,
                font_name=(
                    str(raw_character.get("fontname"))[:MAX_FONT_NAME_LENGTH]
                    if raw_character.get("fontname")
                    else None
                ),
                font_size=_number(raw_character.get("size")) or None,
            )
        )

    blocks: list[TextBlock] = []
    words_truncated = characters_truncated
    words: list[Any] = []
    if not characters_truncated:
        try:
            words = page.extract_words(x_tolerance=3, y_tolerance=3, keep_blank_chars=False) or []
        except (KeyError, TypeError, ValueError):
            words = []
    if len(words) > MAX_WORDS_PER_PAGE:
        words_truncated = True
    block_text_characters = 0
    for word in islice(words, MAX_WORDS_PER_PAGE):
        if not isinstance(word, dict):
            words_truncated = True
            continue
        raw_word_value = word.get("text", "")
        raw_word = raw_word_value if isinstance(raw_word_value, str) else str(raw_word_value)
        remaining_text = MAX_NATIVE_BLOCK_TEXT_CHARACTERS_PER_PAGE - block_text_characters
        if remaining_text <= 0:
            words_truncated = True
            break
        text_limit = min(MAX_WORD_TEXT_LENGTH, remaining_text)
        text = raw_word[:text_limit].strip()
        if len(raw_word) > text_limit:
            words_truncated = True
        if not text:
            continue
        block_text_characters += len(text)
        blocks.append(
            TextBlock(
                text=text,
                bbox=_bbox(word, width, height),
                source="native",
                confidence=1.0,
            )
        )

    raw_images = page.images or []
    image_boxes_truncated = len(raw_images) > MAX_IMAGE_BOXES_PER_PAGE
    image_boxes = [
        _bbox(image, width, height)
        for image in islice(raw_images, MAX_IMAGE_BOXES_PER_PAGE)
        if isinstance(image, dict)
    ]
    page_area = width * height
    signals = PageSignals(
        native_character_count=sum(len(text.strip()) for text in all_texts),
        unicode_valid_ratio=_unicode_valid_ratio(all_texts),
        text_area_ratio=_area_ratio(char_boxes, page_area),
        image_area_ratio=_area_ratio(image_boxes, page_area),
    )
    return (
        characters,
        blocks,
        signals,
        image_boxes,
        NativeContentLimits(
            characters_truncated=characters_truncated,
            words_truncated=words_truncated,
            image_boxes_truncated=image_boxes_truncated,
        ),
    )


def _render_page(page: Any, width: float, height: float) -> Image.Image:
    scale = RENDER_DPI / 72
    pixel_width = max(round(width * scale), 1)
    pixel_height = max(round(height * scale), 1)
    if pixel_width * pixel_height > MAX_PAGE_PIXELS:
        raise DocumentError(
            "RENDER_TOO_LARGE",
            "The rendered page would exceed the safe pixel limit.",
            status_code=413,
        )
    bitmap = page.render(scale=scale)
    try:
        return bitmap.to_pil().convert("RGB")
    finally:
        bitmap.close()


def _png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _region_has_native_text(region: BoundingBox, characters: list[Character]) -> bool:
    region_area = max(region.x1 - region.x0, 0) * max(region.bottom - region.top, 0)
    if region_area <= 0:
        return True
    overlap = 0.0
    for character in characters:
        box = character.bbox
        width = max(min(region.x1, box.x1) - max(region.x0, box.x0), 0)
        height = max(min(region.bottom, box.bottom) - max(region.top, box.top), 0)
        overlap += width * height
    return overlap / region_area >= 0.01


def _box_area(box: BoundingBox) -> float:
    return max(box.x1 - box.x0, 0) * max(box.bottom - box.top, 0)


def _is_obvious_region_duplicate(candidate: BoundingBox, accepted: BoundingBox) -> bool:
    intersection_width = max(min(candidate.x1, accepted.x1) - max(candidate.x0, accepted.x0), 0)
    intersection_height = max(
        min(candidate.bottom, accepted.bottom) - max(candidate.top, accepted.top),
        0,
    )
    intersection = intersection_width * intersection_height
    smaller_area = min(_box_area(candidate), _box_area(accepted))
    return smaller_area > 0 and intersection / smaller_area >= 0.85


def _select_ocr_regions(
    kind: str,
    width: float,
    height: float,
    image_boxes: list[BoundingBox],
    characters: list[Character],
) -> OcrRegionSelection:
    if kind == "scan":
        return OcrRegionSelection(
            regions=[BoundingBox(x0=0, top=0, x1=width, bottom=height)],
            limit_reached=False,
        )
    page_area = width * height
    candidates = [
        region
        for region in image_boxes
        if page_area > 0
        and _box_area(region) / page_area >= 0.03
        and not _region_has_native_text(region, characters)
    ]
    candidates.sort(key=_box_area, reverse=True)

    unique_regions: list[BoundingBox] = []
    for candidate in candidates:
        if any(_is_obvious_region_duplicate(candidate, accepted) for accepted in unique_regions):
            continue
        unique_regions.append(candidate)
        if len(unique_regions) > MAX_OCR_REGIONS_PER_PAGE:
            return OcrRegionSelection(
                regions=unique_regions[:MAX_OCR_REGIONS_PER_PAGE],
                limit_reached=True,
            )
    return OcrRegionSelection(regions=unique_regions, limit_reached=False)


def _run_ocr(
    image: Image.Image,
    regions: list[BoundingBox],
    provider: OCRProvider,
    *,
    deadline: float,
) -> OcrRunResult:
    scale = RENDER_DPI / 72
    blocks: list[TextBlock] = []
    processed_regions = 0
    oversized_regions = 0
    output_limit_reached = False
    total_text_characters = 0
    for region in regions:
        remaining_seconds = deadline - time.monotonic()
        if remaining_seconds <= 0:
            return OcrRunResult(
                blocks=blocks,
                processed_regions=processed_regions,
                budget_exhausted=True,
                output_limit_reached=output_limit_reached,
                oversized_regions=oversized_regions,
            )
        pixel_box = (
            max(round(region.x0 * scale), 0),
            max(round(region.top * scale), 0),
            min(round(region.x1 * scale), image.width),
            min(round(region.bottom * scale), image.height),
        )
        if pixel_box[2] <= pixel_box[0] or pixel_box[3] <= pixel_box[1]:
            continue
        pixel_count = (pixel_box[2] - pixel_box[0]) * (pixel_box[3] - pixel_box[1])
        if pixel_count > MAX_OCR_REGION_PIXELS:
            oversized_regions += 1
            continue

        acquired = _OCR_CAPACITY.acquire(timeout=remaining_seconds)
        if not acquired:
            return OcrRunResult(
                blocks=blocks,
                processed_regions=processed_regions,
                budget_exhausted=True,
                output_limit_reached=output_limit_reached,
                oversized_regions=oversized_regions,
            )
        crop: Image.Image | None = None
        try:
            crop = image.crop(pixel_box)
            remaining_seconds = deadline - time.monotonic()
            if remaining_seconds <= 0:
                return OcrRunResult(
                    blocks=blocks,
                    processed_regions=processed_regions,
                    budget_exhausted=True,
                    output_limit_reached=output_limit_reached,
                    oversized_regions=oversized_regions,
                )
            processed_regions += 1
            try:
                fragments = provider.recognize(
                    crop,
                    timeout_seconds=min(remaining_seconds, MAX_OCR_CALL_TIMEOUT_SECONDS),
                )
            except OCRTimeoutError:
                return OcrRunResult(
                    blocks=blocks,
                    processed_regions=processed_regions,
                    timed_out=True,
                    output_limit_reached=output_limit_reached,
                    oversized_regions=oversized_regions,
                )
            except OCRInputLimitError:
                return OcrRunResult(
                    blocks=blocks,
                    processed_regions=processed_regions,
                    output_limit_reached=True,
                    oversized_regions=oversized_regions,
                )
        finally:
            if crop is not None:
                crop.close()
            _OCR_CAPACITY.release()
        for fragment_index, fragment in enumerate(fragments):
            if fragment_index % 128 == 0 and time.monotonic() >= deadline:
                return OcrRunResult(
                    blocks=blocks,
                    processed_regions=processed_regions,
                    budget_exhausted=True,
                    output_limit_reached=output_limit_reached,
                    oversized_regions=oversized_regions,
                )
            if fragment_index >= MAX_OCR_FRAGMENTS_PER_REGION:
                output_limit_reached = True
                break
            raw_text = fragment.text if isinstance(fragment.text, str) else str(fragment.text)
            if len(raw_text) > MAX_OCR_FRAGMENT_TEXT_LENGTH:
                output_limit_reached = True
                break
            text = raw_text.strip()
            confidence = _number(fragment.confidence, -1)
            if confidence < 0.35 or not text:
                continue
            if len(blocks) >= MAX_OCR_BLOCKS_PER_PAGE:
                output_limit_reached = True
                break
            if total_text_characters + len(text) > MAX_OCR_TEXT_CHARACTERS_PER_PAGE:
                output_limit_reached = True
                break
            try:
                raw_x0, raw_top, raw_x1, raw_bottom = fragment.bbox
            except (TypeError, ValueError):
                continue
            coordinates = tuple(
                _number(value, float("nan")) for value in (raw_x0, raw_top, raw_x1, raw_bottom)
            )
            if not all(math.isfinite(value) for value in coordinates):
                continue
            x0, top, x1, bottom = coordinates
            x0, x1 = sorted((x0, x1))
            top, bottom = sorted((top, bottom))
            total_text_characters += len(text)
            blocks.append(
                TextBlock(
                    text=text,
                    bbox=BoundingBox(
                        x0=min(max(region.x0 + x0 / scale, region.x0), region.x1),
                        top=min(max(region.top + top / scale, region.top), region.bottom),
                        x1=min(max(region.x0 + x1 / scale, region.x0), region.x1),
                        bottom=min(max(region.top + bottom / scale, region.top), region.bottom),
                    ),
                    source="ocr",
                    confidence=min(max(confidence, 0), 1),
                )
            )
        if output_limit_reached:
            break
    return OcrRunResult(
        blocks=blocks,
        processed_regions=processed_regions,
        output_limit_reached=output_limit_reached,
        oversized_regions=oversized_regions,
    )


def parse_document(
    data: bytes,
    filename: str | None,
    *,
    include_previews: bool = True,
    ocr_provider: OCRProvider | None = None,
    ocr_budget_seconds: float | None = None,
) -> ParseResponse:
    validation = validate_pdf_bytes(data)
    provider = ocr_provider or get_ocr_provider()
    warnings: list[ParseWarning] = []
    pages: list[ParsedPage] = []
    requested_budget = (
        OCR_DOCUMENT_TIMEOUT_SECONDS
        if ocr_budget_seconds is None
        else max(min(_number(ocr_budget_seconds), OCR_DOCUMENT_TIMEOUT_SECONDS), 0.0)
    )
    ocr_deadline: float | None = None
    ocr_regions_reserved = 0
    ocr_stopped = False

    native_document = None
    render_document = None
    try:
        native_document = pdfplumber.open(io.BytesIO(data))
        render_document = pdfium.PdfDocument(data)
    except Exception as exc:
        if native_document is not None:
            native_document.close()
        if render_document is not None:
            render_document.close()
        raise DocumentError("PDF_PARSE_FAILED", "The PDF could not be opened safely.") from exc

    assert native_document is not None and render_document is not None
    try:
        if len(native_document.pages) != validation.page_count or len(render_document) != validation.page_count:
            raise DocumentError("PAGE_COUNT_MISMATCH", "PDF parsers disagreed on the page count.")

        for page_index, native_page in enumerate(native_document.pages):
            page_number = page_index + 1
            width, height = float(native_page.width), float(native_page.height)
            characters, blocks, signals, image_boxes, native_limits = _native_content(native_page)
            kind = classify_page(signals)
            region_selection = _select_ocr_regions(kind, width, height, image_boxes, characters)
            regions = region_selection.regions
            ocr_requested = bool(regions)
            rendered: Image.Image | None = None

            if native_limits.characters_truncated:
                warnings.append(
                    ParseWarning(
                        code="CHARACTER_LIMIT_REACHED",
                        message="Native character output was truncated for this unusually dense page.",
                        page_number=page_number,
                    )
                )
            if native_limits.words_truncated:
                warnings.append(
                    ParseWarning(
                        code="WORD_LIMIT_REACHED",
                        message="Native word extraction was skipped or truncated for this unusually dense page.",
                        page_number=page_number,
                    )
                )
            if native_limits.image_boxes_truncated:
                warnings.append(
                    ParseWarning(
                        code="IMAGE_BOX_LIMIT_REACHED",
                        message="Image metadata was truncated before OCR region selection.",
                        page_number=page_number,
                    )
                )
            if region_selection.limit_reached:
                warnings.append(
                    ParseWarning(
                        code="OCR_REGION_LIMIT_REACHED",
                        message=(
                            f"OCR was limited to {MAX_OCR_REGIONS_PER_PAGE} distinct regions on this page."
                        ),
                        page_number=page_number,
                    )
                )

            if regions and provider.available and not ocr_stopped:
                remaining_regions = max(MAX_OCR_REGIONS_PER_DOCUMENT - ocr_regions_reserved, 0)
                if len(regions) > remaining_regions:
                    regions = regions[:remaining_regions]
                    warnings.append(
                        ParseWarning(
                            code="OCR_DOCUMENT_REGION_LIMIT_REACHED",
                            message=(
                                f"OCR was limited to {MAX_OCR_REGIONS_PER_DOCUMENT} regions for this document."
                            ),
                            page_number=page_number,
                        )
                    )
                if regions:
                    if ocr_deadline is None:
                        ocr_deadline = time.monotonic() + requested_budget
                    if time.monotonic() >= ocr_deadline:
                        regions = []
                        ocr_stopped = True
                        warnings.append(
                            ParseWarning(
                                code="OCR_BUDGET_EXCEEDED",
                                message="The document OCR time budget was exhausted; remaining regions were skipped.",
                                page_number=page_number,
                            )
                        )
                    else:
                        ocr_regions_reserved += len(regions)
            elif ocr_stopped:
                regions = []

            if include_previews or (regions and provider.available and not ocr_stopped):
                pdfium_page = render_document.get_page(page_index)
                try:
                    rendered = _render_page(pdfium_page, width, height)
                finally:
                    pdfium_page.close()

            try:
                if ocr_requested:
                    if not provider.available:
                        warnings.append(
                            ParseWarning(
                                code="OCR_UNAVAILABLE",
                                message=provider.warning or "OCR is unavailable.",
                                page_number=page_number,
                            )
                        )
                    elif regions and rendered is not None and ocr_deadline is not None:
                        try:
                            ocr_result = _run_ocr(
                                rendered,
                                regions,
                                provider,
                                deadline=ocr_deadline,
                            )
                        except Exception:
                            warnings.append(
                                ParseWarning(
                                    code="OCR_FAILED",
                                    message="OCR failed for this page; native text and the page preview were retained.",
                                    page_number=page_number,
                                )
                            )
                        else:
                            blocks.extend(ocr_result.blocks)
                            if ocr_result.timed_out:
                                ocr_stopped = True
                                warnings.append(
                                    ParseWarning(
                                        code="OCR_TIMEOUT",
                                        message=(
                                            "OCR reached its per-call timeout; remaining document regions were skipped."
                                        ),
                                        page_number=page_number,
                                    )
                                )
                            if ocr_result.budget_exhausted:
                                ocr_stopped = True
                                warnings.append(
                                    ParseWarning(
                                        code="OCR_BUDGET_EXCEEDED",
                                        message=(
                                            "The document OCR time budget was exhausted; remaining regions were skipped."
                                        ),
                                        page_number=page_number,
                                    )
                                )
                            if ocr_result.output_limit_reached:
                                ocr_stopped = True
                                warnings.append(
                                    ParseWarning(
                                        code="OCR_OUTPUT_LIMIT_REACHED",
                                        message=(
                                            "OCR output exceeded the safe expansion limit; remaining regions were skipped."
                                        ),
                                        page_number=page_number,
                                    )
                                )
                            if ocr_result.oversized_regions:
                                warnings.append(
                                    ParseWarning(
                                        code="OCR_REGION_TOO_LARGE",
                                        message="An OCR region exceeded the safe pixel limit and was skipped.",
                                        page_number=page_number,
                                    )
                                )
                            if (
                                not ocr_result.blocks
                                and not ocr_result.timed_out
                                and not ocr_result.budget_exhausted
                                and not ocr_result.output_limit_reached
                                and not ocr_result.oversized_regions
                            ):
                                warnings.append(
                                    ParseWarning(
                                        code="OCR_NO_TEXT",
                                        message="OCR did not detect text in a region without a usable native text layer.",
                                        page_number=page_number,
                                    )
                                )

                blocks.sort(key=lambda block: (round(block.bbox.top, 1), block.bbox.x0))
                preview = (
                    base64.b64encode(_png_bytes(rendered)).decode("ascii")
                    if include_previews and rendered
                    else None
                )
                pages.append(
                    ParsedPage(
                        page_number=page_number,
                        width=width,
                        height=height,
                        preview_width=rendered.width if rendered is not None else None,
                        preview_height=rendered.height if rendered is not None else None,
                        kind=kind,
                        metrics=PageMetrics(
                            native_character_count=signals.native_character_count,
                            unicode_valid_ratio=signals.unicode_valid_ratio,
                            text_area_ratio=signals.text_area_ratio,
                            image_area_ratio=signals.image_area_ratio,
                        ),
                        characters=characters,
                        blocks=blocks,
                        preview_png_base64=preview,
                    )
                )
            finally:
                if rendered is not None:
                    rendered.close()
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError("PDF_PARSE_FAILED", "The PDF could not be parsed safely.") from exc
    finally:
        native_document.close()
        render_document.close()

    return ParseResponse(
        filename=safe_filename(filename),
        sha256=hashlib.sha256(data).hexdigest(),
        page_count=validation.page_count,
        pages=pages,
        warnings=warnings,
    )
