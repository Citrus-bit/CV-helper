import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/analyze": ["./.tools/tesseract/*.traineddata.gz"],
    "/api/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
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
  serverExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
};

export default nextConfig;
