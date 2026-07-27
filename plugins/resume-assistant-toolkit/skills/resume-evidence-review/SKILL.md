---
name: resume-evidence-review
description: 基于 Resume AST、SourceBlock 和 EvidenceGraph 分析、实现或评审简历证据链、声明支持状态、事实冲突、六维评分、持续 AI 编辑对话、安全修改建议与 ATS 机器可读性审计。处理证据挖掘、数字或经历真实性、可追溯扣分、对话上下文、needs_proof/ask_user 流程、JSON Patch/revision 安全，或修改 evidence.mine、claim.assess、claim.conflict、resume.score、resume.suggest、resume.chat、resume.atsAudit Capability 时使用。
---

# 简历证据评审

把“写得更好”约束为“只重组、澄清或压缩已有事实”。先证明每个结论来自哪里，再评分或建议；不要把简历原文、模型推断或用户沉默当作独立事实证明。

## 先读取统一入口

1. 先读取[能力映射](../resume-assistant-orchestrator/references/capability-map.md)，确认 Capability 归属、数据范围、fallback 和相邻 Skill。
2. 在新增规则包、提示策略或代码适配器前读取[扩展协议](../resume-assistant-orchestrator/references/extension-protocol.md)，执行来源、许可、权限、Schema、评测与回滚审查。
3. 在校准评分、审核建议或比较候选实现时读取[本 Skill 量表](references/rubric.md)。
4. 以 canonical TypeScript/Zod Schema 和当前分析流水线为权威；不要创建第二套 Claim、Suggestion 或 ATS 数据模型。

## 明确任务边界

- 把 `evidence.mine`、`claim.assess`、`claim.conflict`、`resume.score`、`resume.suggest`、`resume.chat`、`resume.atsAudit` 作为本 Skill 的主能力。
- 需要重新解析 PDF、修复阅读顺序或 OCR 时转交 `resume-document-intelligence`。
- 需要解析 JD、岗位匹配或中英文专项写作时转交 `resume-job-writing`。
- 需要 Typst 排版、真实 PDF 预览或导出硬门时转交 `resume-layout-export`。
- 将简历质量分与岗位匹配、录取概率、背景调查结果严格分开。

## 按固定顺序执行评审

1. 要求输入包含当前 revision 的 `ResumeDocument`、Resume AST 和可追溯 SourceBlocks。
2. 调用 `evidence.mine` 抽取原子声明与证据资产。
3. 对每条声明分别调用 `claim.assess`，先确定支持状态。
4. 对已评估声明调用 `claim.conflict`，再把冲突状态叠加到涉及声明；不要让冲突检查覆盖其他声明的正常支持状态。
5. 使用同一批已评估声明调用 `resume.score` 和 `resume.suggest`。
6. 持续编辑时，以长期摘要、已确认事实、最近修改、最近消息和当前 Resume revision 组装有界上下文，再调用 `resume.chat`；模型建议仍必须通过相同的事实、引用和 patch 校验。
7. 独立调用确定性的 `resume.atsAudit`；不要让生成式模型接管 ATS 或事实安全底线。
8. 将所有结果绑定输入 `resumeRevision`，拒绝陈旧结果覆盖新 revision。

## 构建可追溯证据链

### 1. 挖掘原子声明

- 将每个可核对陈述拆为主体、动作、方法、结果和缺失信息；不要把多个不相关成果合成一条 Claim。
- 为 Claim 保存 `sourceBlockIds`，为 EvidenceAsset 保存其来源块，并通过 `evidenceAssetIds` 建立逻辑 EvidenceGraph。
- 把简历原文登记为 `resume_text`；它只证明“原简历包含该表述”，不证明成果已被外部验证。
- 把用户补充内容登记为 `user_statement`，仅在用户明确确认后设置 `verifiedByUser`。
- 保留稳定 ID、原文和来源，不要在抽取阶段润色或补全事实。

### 2. 判定支持状态

严格使用以下 Claim 状态：

| 状态 | 使用条件 | 禁止推断 |
| --- | --- | --- |
| `supported` | 存在与声明关联、非简历原文/非单纯用户陈述且已验证的独立证据 | 不因措辞自信或模型高置信度而设置 |
| `user_confirmed` | 存在用户明确确认的 `user_statement` | 不等同于外部核验 |
| `resume_only` | 只有简历原文或 SourceBlock 支持 | 不得称为“已证实” |
| `needs_evidence` | 没有可追溯来源或关键事实缺失 | 不得直接写入新增事实 |
| `conflicting` | 至少两条相关声明在数字、日期、角色、实体或范围上冲突 | 不得自动选一个为真 |

- 保持 `needs_proof` 是 Suggestion 类型，不是 Claim 状态。
- 让置信度描述证据判断可靠性，不让它替代支持状态。
- 对冲突同时保留两侧 Claim、来源和原因，并提出一个可回答的核对问题。

## 生成可解释评分

按照固定 100 分六维 rubric 评分：成果与影响力 25、信息完整性 15、清晰与精炼 15、结构与版式 15、ATS 可解析性 15、语言规范性 15。

- 让每个维度的证据和扣分可定位到 SourceBlock、Claim 或确定性文档信号。
- 保证维度分在各自上限内、总分等于六维之和，并绑定当前简历 revision。
- 对 OCR 低置信度或解析 warning 降低评分置信度，而不是武断评价候选人能力。
- 不把行业偏好伪装成通用规则；新增行业/职级标定时使用独立规则包和评测集。
- 不输出 offer、录取、薪资或“超过多少候选人”的概率性承诺。

## 生成事实安全建议

严格使用以下 Suggestion 类型：

| 类型 | 行为 |
| --- | --- |
| `use_as_is` | 保留已有事实和表达，不创建无意义 patch |
| `rewrite` | 只调整已有事实的措辞、选择和顺序，不增加实体、职责、技能、数字或结果 |
| `needs_proof` | 标记高风险成果，要求排名、报告、奖项或其他依据；确认前禁止接受 |
| `remove` | 删除重复、无关或明确有风险的内容，并说明依据 |
| `ask_user` | 提出一个具体事实问题；用户回答前保持 no-op 或阻塞状态 |

对每条建议执行以下检查：

1. 引用存在的 `sourceBlockIds` 和相关 `claimIds`。
2. 保存 `resumeRevision`、`beforeHash`、原文、新文本、理由、受影响维度、事实风险和面试风险。
3. 只生成 canonical JSON Pointer；限制 patch 到允许的 Resume AST 字段。
4. 比较改写前后数字、日期、百分比、货币、公司、职级、工具、学历、证书和专有名词。
5. 发现新增或改变的高风险事实时，将建议降为 `needs_proof` 或 `ask_user`，不要用更自然的措辞掩盖新增事实。
6. 在应用 patch 前验证 revision 与 `beforeHash`；不匹配时标记陈旧并重新分析。
7. 用户接受、拒绝或手改后创建新 revision；不要静默覆盖原稿。

## 审计 ATS 机器可读性

- 检查联系方式识别、标准板块、原生/可搜索文字、SourceBlock 顺序、表格角色、低置信度文字和异常阅读顺序。
- 为每条 finding 返回稳定 code、严重度、说明和可用的 `sourceBlockIds`。
- 把 ATS 分数解释为机器读取风险提示，不声称兼容任一 ATS 厂商或保证通过筛选。
- 不把关键词堆砌、岗位匹配或主观视觉审美混入 `resume.atsAudit`。
- 遇到复杂版面信号时要求对照真实 PDF，并把解析问题转交文档 Skill。

## 遵守 Capability 与安全边界

| Capability | 数据范围 | Eval suite | 关键边界 |
| --- | --- | --- | --- |
| `evidence.mine` | `resume_ast,source_blocks` | `eval.evidence.mine.v1` | 不改写原文，不补造事实 |
| `claim.assess` | `evidence_graph` | `eval.claim.assess.v1` | 支持状态由证据类型决定 |
| `claim.conflict` | `evidence_graph` | `eval.claim.conflict.v1` | 只提示冲突，不自动裁决 |
| `resume.score` | `resume_ast,evidence_graph` | `eval.resume.score.v1` | 质量分不是岗位或录取概率 |
| `resume.suggest` | `resume_ast,evidence_graph` | `eval.resume.suggest.v1` | 引用、patch、数字与事实必须校验 |
| `resume.chat` | `resume_ast,evidence_graph,interview_content` | `eval.resume.chat.v1` | 上下文有界、绑定 revision；无真实 AI 时显式失败 |
| `resume.atsAudit` | `resume_ast,source_blocks` | `eval.resume.ats.v1` | 仅做机器可读性风险审计 |

- 让证据、冲突和 ATS 能力保持确定性 baseline；只允许静态白名单网关增强 `resume.score`、`resume.suggest` 与 `resume.chat`。
- 在任何外部增强前执行 PII 最小化和 prompt guard；不发送姓名、电话、邮箱、链接、原 PDF 或无关证据正文。
- 通过 canonical Zod Schema 校验输入输出；非法输出、超时、429/5xx 或事实检查失败时回退对应内置实现。
- `resume.chat` 是用户可见失败语义的例外：provider 未配置或增强调用失败时，API 必须返回明确错误，不得把固定 baseline 话术伪装成 AI 回复；本地历史和未应用修改保持不变，以便重试。
- 直接传播用户取消；不要用 fallback 覆盖取消。
- 保留每项 `builtin.<capabilityId>@1.0.0` 作为可验证回滚目标，并记录 `usedFallback`。

## 验证实现

1. 先为缺陷添加会失败的最小 fixture，再修改规则、提示或 adapter。
2. 覆盖中文、英文、混合语言、无数字、已有数字、绝对化表述、用户确认、独立证据、无来源、互相冲突和低置信解析。
3. 断言 Claim 来源覆盖、状态语义、冲突双向引用、六维总分、Suggestion 引用和 patch 可应用性。
4. 断言 `needs_proof` 与 `ask_user` 不能绕过确认，陈旧 revision 不能应用，数字和专有名词不能被暗改。
5. 断言 ATS findings 来自文档信号，并包含“不代表 ATS 厂商兼容或录取概率”的边界。
6. 运行相关测试，例如：

   ```bash
   pnpm vitest run tests/capabilities/baseline.test.ts tests/capabilities/domain-behavior.test.ts src/lib/server/analysis.test.ts src/app/api/routes.test.ts tests/client/resume.test.ts
   ```

7. 再运行 `pnpm typecheck`、`pnpm lint` 和受影响的完整测试集。
8. 对候选 Skill 使用固定、脱敏或合成 fixture 做影子比较；同时比较质量、延迟、成本、稳定性和 fallback，不用单个漂亮示例作结论。

## 交付结果

- 列出每个评审结论的证据引用、支持状态和不确定性。
- 列出评分扣分、建议类型、patch 安全检查、冲突和 ATS findings。
- 报告事实新增率、引用覆盖率、patch 成功率、陈旧 revision 拒绝率和 fixture 结果。
- 明确区分“简历原文”“用户确认”“独立支持”“待补证据”和“冲突”。
- 把未验证行业判断、ATS 厂商差异和生产准确率留为评测缺口，不把它们包装成已完成能力。
