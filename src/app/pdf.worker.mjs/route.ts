import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const workerPath = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs",
);
let workerSource: Promise<Buffer> | null = null;

export async function GET() {
  workerSource ??= readFile(workerPath);

  return new Response(Uint8Array.from(await workerSource), {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "text/javascript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
