# syntax=docker/dockerfile:1.7
FROM python:3.12.11-slim-bookworm AS runtime

ARG TARGETARCH
ARG TYPST_VERSION=0.15.1
ARG INSTALL_PADDLE_OCR=false

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TYPST_BIN=/usr/local/bin/typst \
    TYPST_TEMPLATE_DIR=/app/templates/typst \
    OCR_PROVIDER=tesseract

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        curl \
        fonts-noto-cjk \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
        tesseract-ocr \
        tesseract-ocr-chi-sim \
        tesseract-ocr-eng \
        xz-utils \
    && detected_arch="${TARGETARCH:-$(dpkg --print-architecture)}" \
    && case "${detected_arch}" in \
        amd64) typst_target="x86_64-unknown-linux-musl"; typst_sha256="a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c" ;; \
        arm64) typst_target="aarch64-unknown-linux-musl"; typst_sha256="5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee" ;; \
        *) echo "Unsupported architecture: ${detected_arch}" >&2; exit 1 ;; \
    esac \
    && curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
        "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${typst_target}.tar.xz" \
        --output /tmp/typst.tar.xz \
    && echo "${typst_sha256}  /tmp/typst.tar.xz" | sha256sum --check --strict \
    && tar --extract --xz --file /tmp/typst.tar.xz --strip-components=1 \
        --directory /usr/local/bin "typst-${typst_target}/typst" \
    && chmod 0755 /usr/local/bin/typst \
    && rm /tmp/typst.tar.xz \
    && apt-get purge --yes --auto-remove curl xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/document-worker/requirements.lock /tmp/requirements.lock
COPY services/document-worker/requirements-ocr.lock /tmp/requirements-ocr.lock
RUN python -m pip install --no-cache-dir --requirement /tmp/requirements.lock \
    && if [ "${INSTALL_PADDLE_OCR}" = "true" ]; then \
        python -m pip install --no-cache-dir --requirement /tmp/requirements-ocr.lock; \
    fi \
    && rm /tmp/requirements.lock /tmp/requirements-ocr.lock

RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin app

COPY --chown=10001:10001 services/document-worker/app /app/app
COPY --chown=10001:10001 templates/typst /app/templates/typst

USER 10001:10001
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
