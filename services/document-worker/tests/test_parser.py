from __future__ import annotations

import io

from PIL import Image
from pypdf import PdfWriter
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.config import (
    MAX_FONT_NAME_LENGTH,
    MAX_IMAGE_BOXES_PER_PAGE,
    MAX_NATIVE_TEXT_CHARACTERS_PER_PAGE,
    MAX_OCR_REGIONS_PER_PAGE,
)
from app.models import BoundingBox
from app.ocr import OcrFragment, UnavailableOCRProvider
from app.parser import (
    PageSignals,
    _native_content,
    _select_ocr_regions,
    classify_page,
    parse_document,
)


class RecordingOCRProvider:
    provider_id = "recording"
    available = True
    warning = None

    def __init__(self) -> None:
        self.timeouts: list[float | None] = []

    def recognize(self, _image, *, timeout_seconds=None):  # type: ignore[no-untyped-def]
        self.timeouts.append(timeout_seconds)
        return [OcrFragment("OCR result", 0.92, (10, 10, 100, 30))]


def test_page_classification_prefers_native_text() -> None:
    assert classify_page(PageSignals(120, 1.0, 0.08, 0.02)) == "digital"
    assert classify_page(PageSignals(120, 1.0, 0.08, 0.45)) == "mixed"
    assert classify_page(PageSignals(3, 1.0, 0.001, 0.90)) == "scan"
    assert classify_page(PageSignals(120, 0.2, 0.08, 0.10)) == "scan"


def test_extracts_native_characters_and_bounding_boxes(digital_pdf: bytes) -> None:
    result = parse_document(
        digital_pdf,
        "candidate.pdf",
        include_previews=False,
        ocr_provider=UnavailableOCRProvider("OCR intentionally unavailable in test."),
    )

    assert result.page_count == 1
    assert result.pages[0].kind == "digital"
    assert result.pages[0].preview_png_base64 is None
    assert "Taylor" in "".join(character.text for character in result.pages[0].characters)
    assert any(block.text == "Taylor" for block in result.pages[0].blocks)
    title_block = next(block for block in result.pages[0].blocks if block.text == "Taylor")
    assert title_block.font_name is not None and "Helvetica-Bold" in title_block.font_name
    assert title_block.font_size == 18
    assert title_block.font_weight == 700
    assert title_block.font_style == "normal"
    assert all(character.bbox.x1 >= character.bbox.x0 for character in result.pages[0].characters)
    assert all(character.bbox.bottom >= character.bbox.top for character in result.pages[0].characters)
    assert not any(warning.code == "OCR_UNAVAILABLE" for warning in result.warnings)


def test_native_block_font_metadata_is_styled_and_bounded() -> None:
    output = io.BytesIO()
    document = canvas.Canvas(output, pagesize=(595, 842), pageCompression=1)
    document.setFont("Helvetica-BoldOblique", 14)
    document.drawString(54, 780, "Styled heading")
    document.save()

    result = parse_document(
        output.getvalue(),
        "styled.pdf",
        include_previews=False,
        ocr_provider=UnavailableOCRProvider("OCR intentionally unavailable in test."),
    )

    block = next(block for block in result.pages[0].blocks if block.text == "Styled")
    assert block.font_name is not None
    assert len(block.font_name) <= MAX_FONT_NAME_LENGTH
    assert "Helvetica-BoldOblique" in block.font_name
    assert block.font_size == 14
    assert block.font_weight == 700
    assert block.font_style == "italic"


def test_native_word_extraction_falls_back_when_font_metadata_is_missing() -> None:
    class MissingFontMetadataPage:
        width = 100
        height = 100
        chars = [
            {
                "text": "Fallback",
                "x0": 10,
                "x1": 50,
                "top": 10,
                "bottom": 20,
            }
        ]
        images: list[object] = []

        @staticmethod
        def extract_words(**kwargs):  # type: ignore[no-untyped-def]
            if kwargs.get("extra_attrs"):
                raise KeyError("fontname")
            return [
                {
                    "text": "Fallback",
                    "x0": 10,
                    "x1": 50,
                    "top": 10,
                    "bottom": 20,
                }
            ]

    _characters, blocks, _signals, _images, limits = _native_content(
        MissingFontMetadataPage()
    )

    assert [block.text for block in blocks] == ["Fallback"]
    assert blocks[0].font_name is None
    assert blocks[0].font_size is None
    assert blocks[0].font_weight is None
    assert blocks[0].font_style is None
    assert limits.words_truncated is False


def test_digital_parse_can_include_a_png_preview(digital_pdf: bytes) -> None:
    result = parse_document(
        digital_pdf,
        "candidate.pdf",
        include_previews=True,
        ocr_provider=UnavailableOCRProvider("OCR intentionally unavailable in test."),
    )
    preview = result.pages[0].preview_png_base64
    assert preview is not None
    assert preview.startswith("iVBOR")
    assert result.pages[0].preview_width is not None
    assert result.pages[0].preview_height is not None
    assert result.pages[0].preview_width > result.pages[0].width


def test_scan_without_ocr_returns_a_warning_instead_of_failing() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    output = io.BytesIO()
    writer.write(output)

    result = parse_document(
        output.getvalue(),
        "scan.pdf",
        include_previews=False,
        ocr_provider=UnavailableOCRProvider("Install or configure PaddleOCR."),
    )

    assert result.pages[0].kind == "scan"
    assert any(warning.code == "OCR_UNAVAILABLE" for warning in result.warnings)


def test_overlapping_ocr_regions_are_deduplicated_before_the_page_limit() -> None:
    image_boxes = [
        BoundingBox(
            x0=5 + (index % 3) * 0.1,
            top=5 + (index % 5) * 0.1,
            x1=95 - (index % 3) * 0.1,
            bottom=95 - (index % 5) * 0.1,
        )
        for index in range(100)
    ]

    selection = _select_ocr_regions("mixed", 100, 100, image_boxes, [])

    assert len(selection.regions) == 1
    assert len(selection.regions) <= MAX_OCR_REGIONS_PER_PAGE
    assert selection.limit_reached is False


def test_native_character_and_image_metadata_bombs_are_bounded_before_expansion() -> None:
    oversized_text = "x" * (MAX_NATIVE_TEXT_CHARACTERS_PER_PAGE + 1)
    character = {
        "text": oversized_text,
        "x0": 10,
        "x1": 11,
        "top": 10,
        "bottom": 20,
        "fontname": "Helvetica",
        "size": 10,
    }
    image = {"x0": 0, "x1": 100, "top": 0, "bottom": 100}

    class BombPage:
        width = 100
        height = 100
        chars = [character] * 100
        images = [image] * (MAX_IMAGE_BOXES_PER_PAGE + 100)

        @staticmethod
        def extract_words(**_kwargs):  # type: ignore[no-untyped-def]
            raise AssertionError("word extraction must be skipped after a character complexity limit")

    characters, blocks, _signals, image_boxes, limits = _native_content(BombPage())

    assert sum(len(item.text) for item in characters) <= MAX_NATIVE_TEXT_CHARACTERS_PER_PAGE
    assert blocks == []
    assert len(image_boxes) == MAX_IMAGE_BOXES_PER_PAGE
    assert limits.characters_truncated is True
    assert limits.words_truncated is True
    assert limits.image_boxes_truncated is True


def test_zero_document_ocr_budget_returns_a_stable_warning_without_calling_provider() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    output = io.BytesIO()
    writer.write(output)
    provider = RecordingOCRProvider()

    result = parse_document(
        output.getvalue(),
        "scan.pdf",
        include_previews=False,
        ocr_provider=provider,
        ocr_budget_seconds=0,
    )

    assert provider.timeouts == []
    assert any(warning.code == "OCR_BUDGET_EXCEEDED" for warning in result.warnings)


def test_scan_ocr_still_returns_positioned_text_within_a_bounded_call() -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    output = io.BytesIO()
    writer.write(output)
    provider = RecordingOCRProvider()

    result = parse_document(
        output.getvalue(),
        "scan.pdf",
        include_previews=False,
        ocr_provider=provider,
    )

    assert len(provider.timeouts) == 1
    assert provider.timeouts[0] is not None and provider.timeouts[0] > 0
    block = next(block for block in result.pages[0].blocks if block.text == "OCR result")
    assert block.font_name is None
    assert block.font_size is None
    assert block.font_weight is None
    assert block.font_style is None


def test_mixed_page_ocr_still_targets_the_image_region() -> None:
    output = io.BytesIO()
    document = canvas.Canvas(output, pagesize=(595, 842), pageCompression=1)
    document.setFont("Helvetica", 12)
    document.drawString(54, 790, "A native text layer remains available for this mixed page.")
    source_image = Image.new("RGB", (20, 20), "white")
    try:
        document.drawImage(ImageReader(source_image), 50, 180, width=495, height=500)
        document.save()
    finally:
        source_image.close()
    provider = RecordingOCRProvider()

    result = parse_document(
        output.getvalue(),
        "mixed.pdf",
        include_previews=False,
        ocr_provider=provider,
    )

    assert result.pages[0].kind == "mixed"
    assert len(provider.timeouts) == 1
    assert any(block.source == "ocr" and block.text == "OCR result" for block in result.pages[0].blocks)
