# syntax=docker/dockerfile:1.7
FROM python:3.10.18-slim-bookworm

ARG FUNASR_VERSION=1.3.30
ARG TORCH_VERSION=2.7.1

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    MODELSCOPE_CACHE=/models/modelscope \
    TORCH_HOME=/models/torch

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        ffmpeg \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Keep the model inside the image so the runtime worker can stay on the
# internal Docker network and never download or upload user audio.
RUN python -m pip install --no-cache-dir --upgrade "pip==25.1.1" \
    && python -m pip install --no-cache-dir \
      "torch==${TORCH_VERSION}" \
      "torchaudio==${TORCH_VERSION}" \
      --index-url https://download.pytorch.org/whl/cpu \
    && python -m pip install --no-cache-dir \
      "funasr==${FUNASR_VERSION}" \
      "fastapi==0.116.1" \
      "uvicorn==0.35.0" \
      "python-multipart==0.0.20"

RUN mkdir -p /models/modelscope /models/torch \
    && python -c 'from funasr import AutoModel; AutoModel(model="iic/SenseVoiceSmall", vad_model="fsmn-vad", vad_kwargs={"max_single_segment_time": 30000}, device="cpu", disable_update=True)'

RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin app \
    && chown -R 10001:10001 /models /app

USER 10001:10001
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

CMD ["funasr-server", "--host", "0.0.0.0", "--port", "8000", "--device", "cpu", "--model-path", "/models/modelscope/models/iic--SenseVoiceSmall/snapshots/master"]
