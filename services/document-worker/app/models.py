from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


PageKind = Literal["digital", "scan", "mixed"]
TemplateName = Literal["professional", "minimal", "compact"]


class BoundingBox(BaseModel):
    x0: float
    top: float
    x1: float
    bottom: float


class Character(BaseModel):
    text: str
    bbox: BoundingBox
    font_name: str | None = Field(default=None, max_length=256)
    font_size: float | None = Field(default=None, gt=0, le=1_000)


class TextBlock(BaseModel):
    text: str
    bbox: BoundingBox
    source: Literal["native", "ocr"]
    confidence: float = Field(ge=0, le=1)
    font_name: str | None = Field(default=None, max_length=256)
    font_size: float | None = Field(default=None, gt=0, le=1_000)
    font_weight: int | None = Field(default=None, ge=100, le=900)
    font_style: Literal["normal", "italic"] | None = None


class PageMetrics(BaseModel):
    native_character_count: int
    unicode_valid_ratio: float = Field(ge=0, le=1)
    text_area_ratio: float = Field(ge=0, le=1)
    image_area_ratio: float = Field(ge=0, le=1)


class ParseWarning(BaseModel):
    code: str
    message: str
    page_number: int | None = None


class ParsedPage(BaseModel):
    page_number: int
    width: float
    height: float
    preview_width: int | None = None
    preview_height: int | None = None
    kind: PageKind
    metrics: PageMetrics
    characters: list[Character]
    blocks: list[TextBlock]
    preview_png_base64: str | None = None


class ParseResponse(BaseModel):
    filename: str
    sha256: str
    page_count: int
    pages: list[ParsedPage]
    warnings: list[ParseWarning]


class Profile(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)
    headline: str = Field(default="", max_length=240)
    email: str = Field(default="", max_length=254)
    phone: str = Field(default="", max_length=80)
    location: str = Field(default="", max_length=160)
    summary: str = Field(default="", max_length=2_000)


class ResumeItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(default="", max_length=240)
    subtitle: str = Field(default="", max_length=240)
    date: str = Field(default="", max_length=120)
    bullets: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("bullets")
    @classmethod
    def validate_bullets(cls, bullets: list[str]) -> list[str]:
        if any(len(bullet) > 1_000 for bullet in bullets):
            raise ValueError("Each bullet must be at most 1000 characters")
        return [bullet.strip() for bullet in bullets if bullet.strip()]


class ResumeSection(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(default="", max_length=120)
    items: list[ResumeItem] = Field(default_factory=list, max_length=30)


class ResumePayload(BaseModel):
    profile: Profile
    sections: list[ResumeSection] = Field(default_factory=list, max_length=20)


class RenderPreviewRequest(BaseModel):
    template: TemplateName = "professional"
    resume: ResumePayload


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["document-worker"] = "document-worker"
    version: str
    typst_available: bool
    ocr_provider: str
    ocr_available: bool
    ocr_warning: str | None = None
