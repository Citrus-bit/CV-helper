import { z } from "zod";

import {
  getCapabilityDescriptor,
  type Capability,
  type CapabilityContext,
  type CapabilityExecution,
  type CapabilityId,
} from "@/lib/capabilities";

import {
  AccessibilityAuditInputSchema,
  AccessibilityAuditOutputSchema,
  LlmEvalInputSchema,
  LlmEvalOutputSchema,
  SecurityAuditInputSchema,
  SecurityAuditOutputSchema,
  SpeechTranscribeInputSchema,
  SpeechTranscribeOutputSchema,
  type AccessibilityAuditInput,
  type LlmEvalInput,
  type SecurityAuditInput,
  type SpeechTranscribeInput,
} from "./contracts";
import { clamp, normalizeText, round } from "./utils";

function defineCapability<I, O>(
  id: CapabilityId,
  inputSchema: z.ZodType<I>,
  outputSchema: z.ZodType<O>,
  execute: (input: I, context: CapabilityContext) => CapabilityExecution<O> | Promise<CapabilityExecution<O>>,
): Capability<I, O> {
  return { descriptor: getCapabilityDescriptor(id), inputSchema, outputSchema, execute };
}

export const speechTranscribeCapability = defineCapability(
  "speech.transcribe",
  SpeechTranscribeInputSchema,
  SpeechTranscribeOutputSchema,
  (input: SpeechTranscribeInput) => {
    const transcript = normalizeText(input.browserTranscript);
    return {
      data: {
        transcript,
        locale: input.locale,
        isFinal: input.isFinal,
        source: "browser-speech-recognition" as const,
        audioProcessed: false as const,
      },
      confidence: input.browserConfidence ?? (transcript ? 0.65 : 0.2),
      evidenceReferences: [],
      warnings: [
        {
          code: "BROWSER_TRANSCRIPT_ONLY",
          message: "内置基线仅接收并标准化浏览器已识别的文字，没有读取或离线识别音频；请在提交评审前核对转写内容。",
        },
        ...(!input.isFinal ? [{ code: "INTERIM_TRANSCRIPT", message: "当前为浏览器临时识别结果，后续文字仍可能变化。" }] : []),
      ],
      usage: { inputUnits: input.browserTranscript.length, outputUnits: transcript.length },
    };
  },
);

export const accessibilityAuditCapability = defineCapability(
  "accessibility.audit",
  AccessibilityAuditInputSchema,
  AccessibilityAuditOutputSchema,
  (input: AccessibilityAuditInput) => {
    const findings: z.infer<typeof AccessibilityAuditOutputSchema>["findings"] = [];
    const seenIds = new Set<string>();
    let previousHeadingLevel: number | undefined;
    for (const node of input.nodes) {
      if (seenIds.has(node.id)) {
        findings.push({ nodeId: node.id, ruleId: "unique-id", severity: "error", message: "同一渲染树中存在重复节点 ID。" });
      }
      seenIds.add(node.id);
      if (!node.visible) continue;
      const accessibleName = normalizeText(node.accessibleName ?? node.text ?? "");
      if (node.interactive && !accessibleName) {
        findings.push({ nodeId: node.id, ruleId: "accessible-name", severity: "error", message: "可交互控件缺少可访问名称。" });
      }
      if (node.interactive && !node.focusable) {
        findings.push({ nodeId: node.id, ruleId: "keyboard-focusable", severity: "error", message: "可交互控件无法通过键盘聚焦。" });
      }
      if (node.focusable && node.hasVisibleFocus === false) {
        findings.push({ nodeId: node.id, ruleId: "focus-visible", severity: "error", message: "键盘焦点没有可见指示。" });
      }
      if (node.contrastRatio !== undefined) {
        const minimum = node.largeText ? 3 : 4.5;
        if (node.contrastRatio < minimum) {
          findings.push({ nodeId: node.id, ruleId: "text-contrast", severity: "error", message: `文字对比度 ${node.contrastRatio}:1 低于 ${minimum}:1。` });
        }
      }
      if (
        node.interactive &&
        node.targetWidth !== undefined &&
        node.targetHeight !== undefined &&
        (node.targetWidth < 24 || node.targetHeight < 24)
      ) {
        findings.push({ nodeId: node.id, ruleId: "target-size", severity: "warning", message: "交互目标小于 WCAG 2.2 的 24 x 24 CSS px 最低尺寸。" });
      }
      if (node.headingLevel !== undefined) {
        if (previousHeadingLevel !== undefined && node.headingLevel > previousHeadingLevel + 1) {
          findings.push({ nodeId: node.id, ruleId: "heading-order", severity: "warning", message: `标题层级从 H${previousHeadingLevel} 跳到 H${node.headingLevel}。` });
        }
        previousHeadingLevel = node.headingLevel;
      }
    }
    const score = clamp(100 - findings.reduce((total, finding) => total + (finding.severity === "error" ? 18 : 6), 0), 0, 100);
    return {
      data: { fixtureId: input.fixtureId, passed: !findings.some((finding) => finding.severity === "error") && score >= 80, score, findings },
      confidence: 0.92,
      evidenceReferences: input.nodes.map((node) => node.id),
      warnings: input.nodes.length ? [] : [{ code: "EMPTY_UI_FIXTURE", message: "渲染树为空，只能确认没有提供可审计节点。" }],
      usage: { inputUnits: input.nodes.length, outputUnits: findings.length },
    };
  },
);

export const securityAuditCapability = defineCapability(
  "security.audit",
  SecurityAuditInputSchema,
  SecurityAuditOutputSchema,
  (input: SecurityAuditInput) => {
    const findings: z.infer<typeof SecurityAuditOutputSchema>["findings"] = [];
    const add = (condition: boolean, controlId: string, severity: "warning" | "error", message: string) => {
      if (condition) findings.push({ controlId, severity, message });
    };
    add(input.documentWorker.networkPolicy !== "none", "document-worker-no-network", "error", "文档处理进程必须禁用网络访问。 ");
    add(input.documentWorker.runsAsRoot, "document-worker-non-root", "error", "文档处理进程不能以 root 身份运行。 ");
    add(!input.documentWorker.readOnlyFilesystem, "document-worker-read-only", "error", "文档处理进程缺少只读文件系统约束。 ");
    add(!input.documentWorker.resourceLimits, "document-worker-resource-limits", "error", "文档处理进程缺少 CPU、内存或执行时限。 ");
    add(input.privacy.retentionHours > 24, "retention-24h", "error", "匿名简历、JD 和派生数据保留时间超过 24 小时。 ");
    add(input.privacy.logsRawContent, "metadata-only-logs", "error", "运行日志包含简历、JD、录音或完整提示内容。 ");
    if (input.privacy.audio.mode === "transient") {
      add(!input.privacy.audio.deletedAfterTranscription, "audio-delete", "error", "临时音频未在转写完成后立即删除。 ");
    }
    add(!input.privacy.piiRedactedBeforeExternalProcessing, "pii-redaction", "error", "外部处理前未执行最小化个人信息脱敏。 ");
    add(!input.skillRuntime.staticAllowlist, "skill-static-allowlist", "error", "运行时 Skill 未通过服务器静态白名单注册。 ");
    add(input.skillRuntime.secretsExposed, "skill-secret-isolation", "error", "Capability 上下文暴露了数据库或供应商密钥。 ");
    add(input.skillRuntime.untrustedInputCanGrantPermissions, "prompt-permission-boundary", "error", "不可信简历或 JD 内容能够扩大工具、数据或网络权限。 ");
    const score = clamp(100 - findings.reduce((total, finding) => total + (finding.severity === "error" ? 14 : 5), 0), 0, 100);
    return {
      data: { fixtureId: input.fixtureId, passed: findings.length === 0 && score >= 90, score, findings },
      confidence: 0.98,
      evidenceReferences: [input.fixtureId],
      usage: { inputUnits: 11, outputUnits: findings.length },
    };
  },
);

type JsonValue = z.infer<ReturnType<typeof z.json>>;

function resolveJsonPointer(document: JsonValue, pointer: string): { exists: boolean; value?: JsonValue } {
  const tokens = pointer.slice(1).split("/").map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: JsonValue = document;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return { exists: false };
      current = current[index];
      continue;
    }
    if (current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, token)) {
      current = current[token];
      continue;
    }
    return { exists: false };
  }
  return { exists: true, value: current };
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function includesJson(actual: JsonValue | undefined, expected: JsonValue | undefined): boolean {
  if (typeof actual === "string" && typeof expected === "string") return actual.includes(expected);
  if (Array.isArray(actual) && expected !== undefined) return actual.some((item) => canonicalJson(item) === canonicalJson(expected));
  return false;
}

export const llmEvalCapability = defineCapability(
  "llm.eval",
  LlmEvalInputSchema,
  LlmEvalOutputSchema,
  (input: LlmEvalInput) => {
    const fixtureResults = input.fixtures.map((fixture) => {
      const assertions = fixture.assertions.map((assertion) => {
        const resolved = resolveJsonPointer(fixture.actual, assertion.path);
        let passed = false;
        if (assertion.operator === "exists") passed = resolved.exists;
        if (assertion.operator === "equals") passed = resolved.exists && assertion.expected !== undefined && canonicalJson(resolved.value!) === canonicalJson(assertion.expected);
        if (assertion.operator === "contains") passed = resolved.exists && includesJson(resolved.value, assertion.expected);
        if (assertion.operator === "not_contains") passed = resolved.exists && !includesJson(resolved.value, assertion.expected);
        if (assertion.operator === "gte") passed = typeof resolved.value === "number" && typeof assertion.expected === "number" && resolved.value >= assertion.expected;
        if (assertion.operator === "lte") passed = typeof resolved.value === "number" && typeof assertion.expected === "number" && resolved.value <= assertion.expected;
        return {
          path: assertion.path,
          operator: assertion.operator,
          passed,
          message: passed ? "断言通过。" : `断言未通过：${assertion.operator} ${assertion.path}`,
        };
      });
      return { fixtureId: fixture.id, passed: assertions.every((assertion) => assertion.passed), assertions };
    });
    const totalAssertions = fixtureResults.reduce((total, fixture) => total + fixture.assertions.length, 0);
    const passedAssertions = fixtureResults.reduce((total, fixture) => total + fixture.assertions.filter((assertion) => assertion.passed).length, 0);
    const passedFixtures = fixtureResults.filter((fixture) => fixture.passed).length;
    const passRate = round((passedAssertions / totalAssertions) * 100, 1);
    return {
      data: {
        suiteId: input.suiteId,
        passed: passedFixtures === input.fixtures.length,
        totalFixtures: input.fixtures.length,
        passedFixtures,
        totalAssertions,
        passedAssertions,
        passRate,
        fixtureResults,
      },
      confidence: 1,
      evidenceReferences: input.fixtures.map((fixture) => fixture.id),
      usage: { inputUnits: totalAssertions, outputUnits: fixtureResults.length },
    };
  },
);

export const PLATFORM_BASELINE_CAPABILITIES = [
  speechTranscribeCapability,
  accessibilityAuditCapability,
  securityAuditCapability,
  llmEvalCapability,
] as const;
