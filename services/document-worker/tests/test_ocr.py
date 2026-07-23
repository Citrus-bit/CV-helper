from __future__ import annotations

import subprocess

import pytest
from PIL import Image

from app.ocr import OCRTimeoutError, TesseractCLIProvider


def test_tesseract_provider_aggregates_words_into_positioned_lines(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    tsv = (
        "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"
        "5\t1\t1\t1\t1\t1\t10\t20\t30\t12\t92\t产品\n"
        "5\t1\t1\t1\t1\t2\t45\t20\t40\t12\t88\t经理\n"
    )
    calls: list[list[str]] = []

    monkeypatch.setattr("app.ocr.shutil.which", lambda _name: "/usr/bin/tesseract")

    def fake_run(command, **_kwargs):  # type: ignore[no-untyped-def]
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, stdout=tsv.encode(), stderr=b"")

    monkeypatch.setattr("app.ocr.subprocess.run", fake_run)
    provider = TesseractCLIProvider()
    image = Image.new("RGB", (120, 60), "white")
    try:
        fragments = provider.recognize(image)
    finally:
        image.close()

    assert calls[0][:4] == ["/usr/bin/tesseract", "stdin", "stdout", "-l"]
    assert fragments[0].text == "产品 经理"
    assert fragments[0].confidence == 0.9
    assert fragments[0].bbox == (10, 20, 85, 32)


def test_tesseract_provider_respects_the_remaining_document_budget(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    observed_timeouts: list[float] = []
    monkeypatch.setattr("app.ocr.shutil.which", lambda _name: "/usr/bin/tesseract")

    def fake_run(command, **kwargs):  # type: ignore[no-untyped-def]
        observed_timeouts.append(kwargs["timeout"])
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    monkeypatch.setattr("app.ocr.subprocess.run", fake_run)
    provider = TesseractCLIProvider()
    image = Image.new("RGB", (120, 60), "white")
    try:
        provider.recognize(image, timeout_seconds=0.25)
    finally:
        image.close()

    assert len(observed_timeouts) == 1
    assert 0 < observed_timeouts[0] <= 0.25


def test_tesseract_timeout_is_normalized_to_a_stable_exception(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr("app.ocr.shutil.which", lambda _name: "/usr/bin/tesseract")

    def fake_run(command, **kwargs):  # type: ignore[no-untyped-def]
        raise subprocess.TimeoutExpired(command, kwargs["timeout"])

    monkeypatch.setattr("app.ocr.subprocess.run", fake_run)
    provider = TesseractCLIProvider()
    image = Image.new("RGB", (120, 60), "white")
    try:
        with pytest.raises(OCRTimeoutError):
            provider.recognize(image, timeout_seconds=0.25)
    finally:
        image.close()
