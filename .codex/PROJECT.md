# 简历分析助手：项目约定

- 最后更新：2026-07-29
- 当前版本：MVP `0.1.0`
- Capability 契约：`1.0`；内置实现版本：`1.0.0`

## 产品底线

1. 主路径保持为“选择简历 → 可选 JD → 获取优化结果”。JD 输入必须可跳过；岗位分支直接进入简历版本切换，不恢复独立岗位工作区。
2. 文档解析始终优先读取 PDF 原生文字层；OCR 只补充 `scan` 或 `mixed` 页，不用全量 OCR 替代有效文字层。
3. AI 不得创造履历事实。`needs_proof` 与 `ask_user` 建议必须先由用户补充或确认，不能直接进入最终简历。
4. 简历质量分、JD 证据覆盖率和岗位解释相互独立，任何分数都不表示面试、录取或 offer 概率。
5. 新版简历必须通过自动导出质检，并由用户查看真实 PDF 后主动确认。系统不承诺无法验证的主观审美结果。
6. 原 PDF、Resume AST、证据关系和岗位版本分层管理；revision 修改不能覆盖原始材料。
7. 简历、JD、面试题和转写文字都是不可信输入，不得改变系统规则、扩大数据范围或触发未声明的网络访问。
8. MVP 不保存音频 Blob。活动会话和本机最近分析在 24 小时后到期；用户可删除单条记录或清空本机数据。
9. 工作台只支持宽度不少于 1024px 的电脑浏览器；窄屏只显示设备提示，不挂载产品工作流。
10. 返回首页、删除当前会话和清空本机记录是三个独立动作；破坏性动作必须明确确认。
11. 当前只交付本地桌面版。Vercel、Hosted 模式、账号、长期历史和云对象存储不属于 MVP 承诺。

## 参考项目边界

产品思路参考 [GresonKwan/JobOK](https://github.com/GresonKwan/JobOK) 提交 `c5da0c6a6c9936b640a202c78cdd6e64b2981ba6`（MIT）的证据链、JD 映射和面试一致性原则。

- 本项目代码、提示策略、题库和 Typst 模板均为独立实现。
- 不把 JobOK 的 PDF 或关键词方案当作本项目技术基线，也不暗示兼容、从属、联合开发或质量背书。
- 若未来复制或改编受版权保护的实现或文本，必须先完成许可证审查并补充第三方声明。

## 运行路径

### 本地 Node 路径

- Next.js Web/API 入口位于 `src/app`。
- 未配置 `DOCUMENT_WORKER_URL` 时，Node runtime 使用 PDF.js 提取原生文字和坐标，仅对 `scan`/`mixed` 页调用本地 Tesseract.js 模型。
- `scripts/bootstrap-tools.sh` 安装并校验 Typst `0.15.1` 与中英文 OCR 模型；运行时不从 CDN 下载模型。
- Typst 生成 `professional | minimal | compact` 三套真实、可搜索 PDF；`TYPST_BIN` 可覆盖默认二进制路径。
- 活动状态保存在标签页级 `sessionStorage`，最近分析和可选原 PDF 保存在 IndexedDB；两者执行 24 小时 TTL。
- 没有 AI Key 时应用和本地体验示例仍可运行，真实简历上传、AI 对话、岗位分析和面试推理不可用。

### 隔离文档路径

- 配置 `DOCUMENT_WORKER_URL` 后，`/api/analyze` 优先调用 `services/document-worker` 的 PDFium/pdfplumber/Tesseract 路径。
- worker 可恢复失败时回退同机 TypeScript 文档路径；摘要不一致、413 资源限制和用户取消不允许回退。
- Compose 默认只启动 Web、禁网 worker 和绑定 `127.0.0.1` 的 loopback proxy。PostgreSQL、Redis 和 MinIO 仅存在于 `future-infra` profile。
- worker 默认使用本地 Tesseract CLI `chi_sim+eng`。PaddleOCR 只有在显式构建、配置并预置模型后才启用，运行时禁止下载模型。
- Node 请求取消会停止等待和陈旧结果提交，但不能立即终止已经进入 Python 线程池的同步任务；残留计算继续受 deadline、子进程 timeout 和容器资源限制。

## Capability 边界

运行时唯一 ID 清单是 [`CAPABILITY_IDS`](../src/lib/capabilities/types.ts)，当前共 31 项。描述、版本和最大 data scope 由 [`catalog.ts`](../src/lib/capabilities/catalog.ts) 定义；不要在页面、提示词或临时文档中建立平行清单。

| 类别 | Capability | 用户流程策略 |
| --- | --- | --- |
| 严格 AI | `resume.score`、`resume.suggest`、`resume.chat`、`jd.parse`、`job.match`、`interview.plan`、`answer.evaluate`、`answer.coach` | 必须是匹配 ID 的 `@2.x+`、`usedFallback: false`；失败关闭 |
| 证据补写 | `copy.rewrite.zh`、`copy.rewrite.en` | Registry 保留通用兼容调用能力；当前 `/api/evidence-rewrite` 要求匹配 ID 的 `@2.x+`，不向用户返回 baseline |
| 确定性基础设施 | 其余 21 项 | 使用内置 baseline；不能冒充生成式 AI 结论 |

- Provider 白名单以 [`PROVIDER_GATEWAY_CAPABILITY_IDS`](../src/lib/capabilities/types.ts) 为准，共 10 项。
- Provider Base URL 只能命中 [`provider-gateway.ts`](../src/lib/server/ai/provider-gateway.ts) 的静态批准列表，不能由用户输入或额外环境变量扩张。
- 评分、建议、JD、岗位、面试和证据补写经过 [`invokeRequiredAiCapability`](../src/lib/server/capability-runtime.ts)，禁止 baseline fallback 并校验 v2+ 来源；`/api/resume-chat` 在发布响应前独立拒绝 fallback 或非 v2+ 来源。
- 上传和 revision 重分析必须在评分、建议同时成功后原子发布；不得泄漏部分成功结果。
- 提供 JD 时，上传请求在评分与建议后继续原子生成岗位匹配结果；岗位版本只能更新目标岗位 headline，并稳定重排有证据的 section、entry 和 bullet，不得创建缺失技能、经历或指标。
- 面试计划必须引用题库或简历故事；回答评估和教练反馈必须绑定同一问题、简历 ID/revision 与已接受评估。
- Provider 日志只保存 capability、trace、格式、状态、错误分类、字节数、耗时和用量，不保存业务正文、完整 prompt、模型名或密钥。

## 数据与导出

- 外部 AI 只接收 PII 脱敏后的最小 DTO，不接收原 PDF、页面图片或无关证据正文。
- 新本机记录只有在当前 revision 的评分与建议均具有有效 `@2.x+` 来源时才写入。旧 baseline 记录只保留为迁移数据，不能显示成当前 AI 结论。
- 体验示例使用 `analysisSource: demo-template`，不持久化，也不能进入岗位、面试或 AI 编辑链路。
- 导出以当前 revision 的 Resume AST 为内容真值。服务器审计、客户端首屏像素检查、预览 SHA 和用户确认全部通过后才允许下载。
- 原 PDF 只用于人工核对，不参与新版自动质量评分。当前 UI 在原版与新版之间切换，不提供并排模式。
- 顶栏只保留“简历优化 / 模拟面试”；岗位分支在简历优化区切换，旧 `module: job` 恢复后迁回 `resume`。

## 面试知识包

- [`content/interview/manifest.yaml`](../content/interview/manifest.yaml) 是 60 题清单与领域配额的唯一真值。
- 题目 front matter、双语章节、追问、1/3/5 锚点与风险项必须通过现有知识包测试。
- 文字输入与浏览器转写是等价回答路径。任何 trim 后非空的文字都可提交；短回答由评估与教练反馈处理。
- 应用不评价口音、性别、音色、情绪或人格，也不提供实时双向语音。

## Codex Development Skill Toolkit

`plugins/resume-assistant-toolkit/` 是开发、审查和评测本项目的 Codex 插件，不会被产品运行时加载。

- 总入口：[`resume-assistant-orchestrator`](../plugins/resume-assistant-toolkit/skills/resume-assistant-orchestrator/SKILL.md)。
- 31 项开发期归属映射：[`capability-map.md`](../plugins/resume-assistant-toolkit/skills/resume-assistant-orchestrator/references/capability-map.md)。
- 候选运行时扩展协议：[`extension-protocol.md`](../plugins/resume-assistant-toolkit/skills/resume-assistant-orchestrator/references/extension-protocol.md)。
- Codex Skill 只提供工程工作流和验收方法，不能获得产品密钥、提交 revision、签发导出或绕过运行时 Registry。

## 验证与文档同步

发布前运行：

```bash
pnpm typecheck
pnpm lint
pnpm docs:check
pnpm test
pnpm build
python3 -m pytest services/document-worker/tests
python3 -m pytest infra/tests
git diff --check
```

- 产品行为或用户承诺变化：更新 [`docs/PRD.md`](../docs/PRD.md)。
- 契约、运行路径、API 或数据流变化：更新 [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)。
- Capability ID、Provider 白名单或严格调用策略变化：同步本文件和开发期 Capability map。
- 面试知识包变化：更新 manifest，并按 [`content/interview/README.md`](../content/interview/README.md) 审核。
- 具体测试数量、临时端口、镜像 SHA 和单次 Provider 结果属于运行日志，不写入长期项目约定。

## 当前限制

- 生产级 OCR 指标仍需至少 40 份脱敏或合成样本验证。
- Safari、屏幕阅读器、真实操作系统拖放和外部 Provider 稳定性需要独立环境验收。
- 当前限流存储为进程内 Map；多实例部署前需要共享存储与可信代理配置。
- 数据库、队列、对象存储、服务端 ASR、云部署和跨设备账号均未接入。
