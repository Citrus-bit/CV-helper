from __future__ import annotations

from fastapi import FastAPI, File, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool

from . import __version__
from .config import typst_binary
from .errors import DocumentError
from .models import HealthResponse, ParseResponse, RenderPreviewRequest
from .ocr import get_ocr_provider
from .parser import parse_document
from .rendering import render_resume
from .security import read_upload_limited


app = FastAPI(
    title="Resume Document Worker",
    version=__version__,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.exception_handler(DocumentError)
async def handle_document_error(_request: Request, exc: DocumentError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
        headers={"Cache-Control": "no-store"},
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_request: Request, _exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "INVALID_REQUEST", "message": "The request payload is invalid."}},
        headers={"Cache-Control": "no-store"},
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > 12 * 1024 * 1024:
        return JSONResponse(
            status_code=413,
            content={"error": {"code": "REQUEST_TOO_LARGE", "message": "The request is too large."}},
            headers={
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
            },
        )
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    provider = get_ocr_provider()
    return HealthResponse(
        version=__version__,
        typst_available=typst_binary() is not None,
        ocr_provider=provider.provider_id,
        ocr_available=provider.available,
        ocr_warning=provider.warning,
    )


@app.post("/parse", response_model=ParseResponse)
async def parse_pdf(
    file: UploadFile = File(...),
    include_previews: bool = Query(default=True),
) -> ParseResponse:
    try:
        data = await read_upload_limited(file)
        return await run_in_threadpool(
            parse_document,
            data,
            file.filename,
            include_previews=include_previews,
        )
    finally:
        await file.close()


@app.post("/render-preview")
async def render_preview(request: RenderPreviewRequest) -> Response:
    rendered = await run_in_threadpool(render_resume, request.template, request.resume)
    return Response(
        content=rendered.pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="resume-{request.template}.pdf"',
            "X-Resume-Template": request.template,
            "X-Resume-Pages": str(rendered.page_count),
            "X-Resume-Searchable": str(rendered.searchable).lower(),
        },
    )
