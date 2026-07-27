import { mkdtemp, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ResumeTemplateId } from "@/lib/domain";

export type { ResumeTemplateId };

export type RenderableResume = {
  profile: {
    name: string;
    headline?: string;
    email?: string;
    phone?: string;
    location?: string;
    summary?: string;
  };
  sections: Array<{
    title: string;
    items: Array<{
      title: string;
      subtitle?: string;
      date?: string;
      bullets: string[];
    }>;
  }>;
};

function typstBinary() {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.TYPST_BIN ?? ".tools/typst/typst",
  );
}

function templatePath(template: ResumeTemplateId) {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    "templates",
    "typst",
    `${template}.typ`,
  );
}

async function renderWithDocumentWorker(
  resume: RenderableResume,
  template: ResumeTemplateId,
): Promise<Buffer | null> {
  const workerUrl = process.env.DOCUMENT_WORKER_URL?.replace(/\/+$/, "");
  if (!workerUrl) return null;

  const response = await fetch(`${workerUrl}/render-preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ resume, template }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw new Error(`文档服务渲染失败: HTTP ${response.status}`);
  }
  const pdf = Buffer.from(await response.arrayBuffer());
  if (pdf.byteLength > 12 * 1_024 * 1_024) {
    throw new Error("文档服务返回的 PDF 超出 12 MB 限制。");
  }
  return pdf;
}

async function run(command: string, args: string[], cwd: string) {
  const environment: NodeJS.ProcessEnv = {
    LANG: "en_US.UTF-8",
    NODE_ENV: process.env.NODE_ENV ?? "production",
    PATH: `${path.dirname(command)}:/usr/bin:/bin`,
    SOURCE_DATE_EPOCH: "0",
  };
  if (process.env.TYPST_FONT_PATHS) {
    environment.TYPST_FONT_PATHS = process.env.TYPST_FONT_PATHS;
  }
  await new Promise<void>((resolve, reject) => {
    execFile(
      command,
      args,
      { cwd, env: environment, timeout: 12_000, maxBuffer: 4_000 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`Typst 编译失败: ${String(stderr).slice(0, 4_000)}`, { cause: error }));
          return;
        }
        resolve();
      },
    );
  });
}

async function renderLocally(resume: RenderableResume, template: ResumeTemplateId) {
  const work = await mkdtemp(path.join(tmpdir(), "resume-render-"));
  const input = path.join(work, "resume.json");
  const templateFile = path.join(work, "template.typ");
  const output = path.join(work, "resume.pdf");

  try {
    await writeFile(input, JSON.stringify(resume), { encoding: "utf8", mode: 0o600 });
    await copyFile(templatePath(template), templateFile);
    await run(typstBinary(), ["compile", "--root", work, templateFile, output], work);
    const pdf = await readFile(output);
    if (pdf.byteLength < 800 || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("Typst 未生成有效 PDF。 ");
    }
    return pdf;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function renderResumePdf(resume: RenderableResume, template: ResumeTemplateId) {
  let workerError: unknown;
  try {
    const rendered = await renderWithDocumentWorker(resume, template);
    if (rendered) {
      if (rendered.byteLength < 800 || rendered.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("文档服务未返回有效 PDF。");
      }
      return rendered;
    }
  } catch (error) {
    workerError = error;
  }

  try {
    return await renderLocally(resume, template);
  } catch (localError) {
    if (workerError) {
      throw new AggregateError([workerError, localError], "文档服务与本地 Typst 渲染均失败。");
    }
    throw localError;
  }
}
