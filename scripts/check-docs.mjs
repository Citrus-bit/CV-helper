import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const markdownFiles = execFileSync("git", ["ls-files", "*.md", "*.mdx"], {
  cwd: projectDirectory,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter((path) => path && !path.startsWith(".tools/"));

const errors = [];
const requiredQuestionHeadings = [
  "# ",
  "## 问题 / Question",
  "## 追问 / Follow-ups",
  "## 优秀信号 / Strong signals",
  "## 评分锚点 / Scoring anchors",
  "## 风险项 / Risks",
];
const requiredQuestionMetadata = [
  "id",
  "industry",
  "role_family",
  "levels",
  "difficulty",
  "type",
  "skills",
  "source",
  "license",
  "status",
  "version",
  "reviewed_at",
];

function report(path, line, message) {
  errors.push(`${path}:${line}: ${message}`);
}

function checkLocalLinks(path, lines) {
  const linkPattern = /!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^)]*["'])?\)/g;
  lines.forEach((line, index) => {
    for (const match of line.matchAll(linkPattern)) {
      const rawTarget = match[1].replace(/^<|>$/g, "");
      if (/^(?:[a-z]+:|#)/i.test(rawTarget)) continue;
      const fileTarget = rawTarget.split(/[?#]/, 1)[0];
      if (!fileTarget) continue;
      let decodedTarget;
      try {
        decodedTarget = decodeURIComponent(fileTarget);
      } catch {
        report(path, index + 1, `链接包含无效转义：${rawTarget}`);
        continue;
      }
      if (!existsSync(resolve(projectDirectory, dirname(path), decodedTarget))) {
        report(path, index + 1, `本地链接不存在：${rawTarget}`);
      }
    }
  });
}

function checkQuestion(path, content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatterMatch) {
    report(path, 1, "面试题缺少 YAML front matter");
    return;
  }
  for (const key of requiredQuestionMetadata) {
    if (!new RegExp(`^${key}:`, "m").test(frontmatterMatch[1])) {
      report(path, 1, `front matter 缺少 ${key}`);
    }
  }
  for (const heading of requiredQuestionHeadings) {
    const present = heading === "# "
      ? /^# (?!#)/m.test(content)
      : content.includes(`\n${heading}\n`);
    if (!present) report(path, 1, `缺少章节：${heading.trim()}`);
  }
}

for (const path of markdownFiles) {
  const absolutePath = resolve(projectDirectory, path);
  const content = readFileSync(absolutePath, "utf8");
  const lines = content.split("\n");

  if (!content.endsWith("\n")) report(path, lines.length, "文件末尾缺少换行");
  if (content.endsWith("\n\n")) report(path, lines.length - 1, "文件末尾存在多余空行");
  if (/\n{3,}/.test(content)) report(path, 1, "存在连续两个以上空白行");

  let fence = null;
  let h1Count = 0;
  lines.forEach((line, index) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === marker ? null : fence ?? marker;
      return;
    }
    if (fence) return;
    if (line.includes("\t")) report(path, index + 1, "包含制表符");
    if (/^# (?!#)/.test(line)) h1Count += 1;
    if (/^#{1,6} /.test(line)) {
      if (index > 0 && lines[index - 1] !== "") {
        report(path, index + 1, "标题上方缺少空行");
      }
      if (index + 1 < lines.length && lines[index + 1] !== "") {
        report(path, index + 1, "标题下方缺少空行");
      }
    }
    if (/^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(line)) {
      if (!line.startsWith("| ") || !line.endsWith(" |")) {
        report(path, index + 1, "表格分隔行的管道两侧应保留空格");
      }
    }
  });
  if (fence) report(path, lines.length, "代码块未闭合");
  if (h1Count !== 1) report(path, 1, `应恰好包含一个一级标题，实际为 ${h1Count}`);

  checkLocalLinks(path, lines);
  if (path.startsWith("content/interview/questions/")) checkQuestion(path, content);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Checked ${markdownFiles.length} Markdown files.`);
}
