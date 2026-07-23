# syntax=docker/dockerfile:1.7
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
RUN addgroup --system --gid 10001 app \
    && adduser --system --uid 10001 --ingroup app app
COPY --from=build --chown=10001:10001 /app/.next/standalone ./
COPY --from=build --chown=10001:10001 /app/.next/static ./.next/static
COPY --from=build --chown=10001:10001 /app/.tools/tesseract ./.tools/tesseract
COPY --from=build --chown=10001:10001 /app/content ./content
COPY --from=build --chown=10001:10001 /app/public ./public
USER 10001:10001
EXPOSE 3000
CMD ["node", "server.js"]
