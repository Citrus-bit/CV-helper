import type { CapabilityDescriptor, CapabilityId, DataScope } from "./types";
import { CAPABILITY_IDS, CapabilityDescriptorSchema } from "./types";

type CatalogSeed = {
  name: string;
  description: string;
  dataScopes: DataScope[];
  networkPolicy?: CapabilityDescriptor["networkPolicy"];
  timeoutMs?: number;
};

export const AI_CAPABILITY_TIMEOUT_MS = 7 * 60_000;

const seeds: Record<CapabilityId, CatalogSeed> = {
  "document.parse": { name: "PDF 原生解析", description: "提取 PDF 原生文字层及坐标。", dataScopes: ["original_pdf"] },
  "document.ocr": { name: "局部 OCR", description: "仅识别缺失或不可用的文字区域。", dataScopes: ["page_image"], timeoutMs: 180_000 },
  "document.segment": { name: "文档分块", description: "恢复页面阅读顺序并构建语义块。", dataScopes: ["source_blocks"] },
  "evidence.mine": { name: "证据挖掘", description: "从简历中提取可追溯声明及证据。", dataScopes: ["resume_ast", "source_blocks"] },
  "claim.assess": { name: "声明评估", description: "评估声明的证据支持程度。", dataScopes: ["evidence_graph"] },
  "claim.conflict": { name: "声明冲突", description: "识别声明之间的事实冲突。", dataScopes: ["evidence_graph"] },
  "resume.score": { name: "简历评分", description: "按六维标准生成可解释质量分。", dataScopes: ["resume_ast", "evidence_graph"], timeoutMs: AI_CAPABILITY_TIMEOUT_MS },
  "resume.suggest": { name: "简历建议", description: "生成受事实证据约束的分块修改建议。", dataScopes: ["resume_ast", "evidence_graph"], timeoutMs: AI_CAPABILITY_TIMEOUT_MS },
  "resume.chat": { name: "AI 编辑对话", description: "基于本地会话上下文持续讨论并修改当前简历。", dataScopes: ["resume_ast", "evidence_graph", "interview_content"], timeoutMs: AI_CAPABILITY_TIMEOUT_MS },
  "resume.atsAudit": { name: "ATS 审计", description: "检查机器读取和内容结构风险。", dataScopes: ["resume_ast", "source_blocks"] },
  "jd.parse": { name: "岗位解析", description: "把岗位描述拆解为可解释要求。", dataScopes: ["job_description"], timeoutMs: AI_CAPABILITY_TIMEOUT_MS },
  "job.match": { name: "岗位匹配", description: "将岗位要求映射到简历证据。", dataScopes: ["job_description", "evidence_graph"], timeoutMs: AI_CAPABILITY_TIMEOUT_MS },
  "job.riskDetect": { name: "岗位风险", description: "识别岗位描述中的招聘风险信号。", dataScopes: ["job_description"] },
  "copy.rewrite.zh": { name: "中文改写", description: "在不增加事实的前提下改善中文表达。", dataScopes: ["resume_ast"], timeoutMs: AI_CAPABILITY_TIMEOUT_MS },
  "copy.rewrite.en": { name: "英文改写", description: "在不增加事实的前提下改善英文表达。", dataScopes: ["resume_ast"], timeoutMs: AI_CAPABILITY_TIMEOUT_MS },
  "copy.consistency": { name: "文案一致性", description: "检查时态、标点和术语一致性。", dataScopes: ["resume_ast"] },
  "layout.recommend": { name: "模板推荐", description: "根据内容密度推荐排版模板。", dataScopes: ["resume_ast"] },
  "resume.render": { name: "简历渲染", description: "将 Resume AST 编译为可预览文档。", dataScopes: ["resume_ast"] },
  "export.audit": { name: "导出质检", description: "独立检查最终文档版面与可读取性。", dataScopes: ["rendered_document", "resume_ast"] },
  "question.retrieve": { name: "面试题检索", description: "从受控题库检索相关面试题。", dataScopes: ["anonymous_metadata"] },
  "interview.plan": { name: "面试规划", description: "生成有时长和追问约束的训练计划。", dataScopes: ["anonymous_metadata"], timeoutMs: AI_CAPABILITY_TIMEOUT_MS },
  "story.build": { name: "故事卡", description: "将真实经历组织为可练习的 STAR 故事。", dataScopes: ["resume_ast", "evidence_graph"] },
  "speech.transcribe": { name: "语音转写", description: "接收浏览器完成的语音识别文本并标准化。", dataScopes: ["selected_text"] },
  "answer.evaluate": { name: "回答评估", description: "按五维标准评估面试回答。", dataScopes: ["interview_content", "evidence_graph"], timeoutMs: AI_CAPABILITY_TIMEOUT_MS },
  "answer.coach": { name: "回答教练", description: "提供基于原回答的具体改进动作。", dataScopes: ["interview_content", "evidence_graph"], timeoutMs: AI_CAPABILITY_TIMEOUT_MS },
  "resumeInterview.check": { name: "口径一致性", description: "核对回答与简历声明是否一致。", dataScopes: ["interview_content", "evidence_graph"] },
  "pii.redact": { name: "个人信息脱敏", description: "在外部处理前隐藏无关个人信息。", dataScopes: ["selected_text"] },
  "prompt.guard": { name: "提示安全", description: "将文档中的提示注入内容标记为不可信数据。", dataScopes: ["selected_text"] },
  "accessibility.audit": { name: "无障碍审计", description: "检查关键 WCAG 交互要求。", dataScopes: ["ui_render_tree"] },
  "security.audit": { name: "安全审计", description: "检查运行时安全控制是否完整。", dataScopes: ["system_metadata"] },
  "llm.eval": { name: "模型评测", description: "在脱敏固定样本上评估能力质量。", dataScopes: ["eval_fixtures"] },
};

export const CAPABILITY_CATALOG: ReadonlyMap<CapabilityId, CapabilityDescriptor> = new Map(
  CAPABILITY_IDS.map((id) => {
    const seed = seeds[id];
    const descriptor = CapabilityDescriptorSchema.parse({
      id,
      name: seed.name,
      description: seed.description,
      version: "1.0.0",
      contractVersion: "1.0",
      locales: ["zh-CN", "en-US", "mixed"],
      license: "Proprietary",
      provenance: "builtin",
      dataScopes: seed.dataScopes,
      networkPolicy: seed.networkPolicy ?? "none",
      timeoutMs: seed.timeoutMs ?? 15_000,
      fallbackImplementation: `builtin.${id}@1.0.0`,
    });
    return [id, descriptor] as const;
  }),
);

export function getCapabilityDescriptor(id: CapabilityId): CapabilityDescriptor {
  const descriptor = CAPABILITY_CATALOG.get(id);
  if (!descriptor) throw new Error(`Unknown capability: ${id}`);
  return descriptor;
}
