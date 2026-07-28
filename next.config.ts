import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/analyze": [
      "./.tools/tesseract/*.traineddata.gz",
      "./node_modules/.pnpm/tesseract.js@*/node_modules/tesseract.js/**/*",
      "./node_modules/.pnpm/tesseract.js-core@*/node_modules/tesseract.js-core/**/*",
      "./node_modules/.pnpm/node_modules/bmp-js/**/*",
      "./node_modules/.pnpm/node_modules/idb-keyval/**/*",
      "./node_modules/.pnpm/node_modules/is-url/**/*",
      "./node_modules/.pnpm/node_modules/node-fetch/**/*",
      "./node_modules/.pnpm/node_modules/regenerator-runtime/**/*",
      "./node_modules/.pnpm/node_modules/tesseract.js-core/**/*",
      "./node_modules/.pnpm/node_modules/wasm-feature-detect/**/*",
      "./node_modules/.pnpm/node_modules/zlibjs/**/*",
    ],
    "/api/interview/plan": ["./content/interview/**/*"],
    "/pdf.worker.mjs": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist", "tesseract.js"],
};

export default nextConfig;
