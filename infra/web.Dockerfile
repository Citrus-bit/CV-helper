# syntax=docker/dockerfile:1.7
FROM node:22.17.1-alpine AS typst-runtime
ARG TARGETARCH
ARG TYPST_VERSION=0.15.1
RUN apk add --no-cache curl xz \
    && runtime_arch="${TARGETARCH:-$(apk --print-arch)}" \
    && case "${runtime_arch}" in \
      amd64|x86_64) \
        typst_target="x86_64-unknown-linux-musl"; \
        typst_sha256="a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c" \
        ;; \
      arm64|aarch64) \
        typst_target="aarch64-unknown-linux-musl"; \
        typst_sha256="5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee" \
        ;; \
      *) \
        echo "Unsupported Typst architecture: ${runtime_arch}" >&2; \
        exit 1 \
        ;; \
    esac \
    && typst_archive="/tmp/typst.tar.xz" \
    && curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
      "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${typst_target}.tar.xz" \
      --output "${typst_archive}" \
    && echo "${typst_sha256}  ${typst_archive}" | sha256sum -c - \
    && mkdir -p /app/.tools/typst /tmp/typst \
    && tar -xJf "${typst_archive}" --strip-components=1 -C /tmp/typst \
    && install -m 0755 /tmp/typst/typst /app/.tools/typst/typst \
    && /app/.tools/typst/typst --version

FROM node:22.17.1-alpine AS dependencies
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

ARG TESSERACT_DATA_VERSION=4.0.0_best_int
RUN apk add --no-cache curl \
    && mkdir -p /app/.tools/tesseract \
    && curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
      "https://cdn.jsdelivr.net/npm/@tesseract.js-data/chi_sim/${TESSERACT_DATA_VERSION}/chi_sim.traineddata.gz" \
      --output /app/.tools/tesseract/chi_sim.traineddata.gz \
    && curl --proto '=https' --tlsv1.2 --fail --location --retry 3 \
      "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/${TESSERACT_DATA_VERSION}/eng.traineddata.gz" \
      --output /app/.tools/tesseract/eng.traineddata.gz \
    && echo "b8a23f10c7de500891eb458a8adc9cc58ab7f242f08b7d149f5e9aea4ad5db7c  /app/.tools/tesseract/chi_sim.traineddata.gz" | sha256sum -c \
    && echo "45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91  /app/.tools/tesseract/eng.traineddata.gz" | sha256sum -c

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p public && pnpm build

FROM node:22.17.1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN apk add --no-cache font-noto-cjk \
    && addgroup --system --gid 10001 app \
    && adduser --system --uid 10001 --ingroup app app
COPY --from=typst-runtime --chown=10001:10001 /app/.tools/typst ./.tools/typst
COPY --from=build --chown=10001:10001 /app/.next/standalone ./
COPY --from=build --chown=10001:10001 /app/.next/static ./.next/static
COPY --from=build --chown=10001:10001 /app/.tools/tesseract ./.tools/tesseract
COPY --from=build --chown=10001:10001 /app/content ./content
COPY --from=build --chown=10001:10001 /app/public ./public
COPY --from=build --chown=10001:10001 /app/templates/typst ./templates/typst
USER 10001:10001
EXPOSE 3000
CMD ["node", "server.js"]
