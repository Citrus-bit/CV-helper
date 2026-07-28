# 简历分析助手：项目约定

最后更新：2026-07-24
当前版本：MVP `0.1.0`  
Capability 契约：`1.0`；内置实现版本：`1.0.0`

## 产品底线

1. MVP 在没有外部模型、OCR/ASR 服务、数据库或队列服务时仍可完成演示流程；增强 Skill 不能成为核心路径的单点依赖。
2. 所有文档 adapter 始终优先读取 PDF 原生文字层，OCR 只补充 `scan`/`mixed` 页。隔离 Python worker 对 `scan` 整页识别、对 `mixed` 仅识别无原生文字覆盖的图片区域；无 `DOCUMENT_WORKER_URL` 时的 TypeScript baseline 对 `scan`/`mixed` 整页识别，并在 `mixed` 页过滤覆盖和重复块。
3. AI 不得创造履历事实。`needs_proof` 与 `ask_user` 建议必须先由用户补充或确认，不能直接写入最终简历。
4. 简历质量分、JD 证据覆盖率和岗位适配解释相互独立；任何分数都不表示录取概率。
5. 新版简历必须通过自动导出质检，并由用户查看真实 PDF 预览后主动确认。系统不以无法验证的方式承诺“审美一定更好”。
6. 原 PDF、简历 AST、证据图和岗位版本分层保存；修改不能覆盖原始材料。
7. 简历、JD 和转写文字都是不可信输入，不得改变系统指令、扩大 Skill 权限或触发未声明的网络访问。
8. MVP 使用浏览器语音识别且应用不采集音频 Blob；浏览器供应商边界必须披露。匿名工作状态与本机最近分析在 24 小时后到期，应用运行期间或下次打开时清理；用户可删除单条或立即清空全部。
9. 产品工作台只支持宽度不少于 1024px 的电脑浏览器；窄屏仅显示设备提示，不能挂载或运行上传、分析、工作区或录音界面。
10. “返回首页”只保存并离开当前分析；“删除当前会话”和“清空本机记录”是独立、需明确确认的破坏性动作。
11. 本轮只交付本地桌面版；Vercel、Private Blob、Hosted 模式和其他云部署路径均已推迟，不属于当前实现或验收承诺。

## 参考项目边界

本项目参考 JobOK 的“证据 → 能力 → 岗位 → 简历 → 面试”工作思路，以及证据不足时主动追问的产品原则。参考对象固定为 [GresonKwan/JobOK](https://github.com/GresonKwan/JobOK) 提交 `c5da0c6a6c9936b640a202c78cdd6e64b2981ba6`，其许可证为 MIT。

- 当前实现为独立设计与独立代码，不复制 JobOK 的提示词、题库、模板或具体实现文本。
- JobOK 的 PDF/关键词方案不作为本项目技术基线；本项目采用 SourceBlocks、Resume AST、按页 OCR 与混合页去重合并，以及可追溯证据图。
- 若未来复制或改编任何具有著作权意义的代码或文本，必须先做许可证审查，并在 `THIRD_PARTY_NOTICES.md` 中保留 MIT 许可和版权声明。
- “受某项目启发”不等于兼容、从属、联合开发或质量背书；产品文案不得暗示此类关系。

## 运行路径

### 无 Docker 的 TypeScript baseline

- Web 与 API：Next.js/TypeScript，入口为 `src/app`。
- Capability：服务器端静态白名单，内置确定性规则、模板和浏览器能力；无密钥时确定性能力可运行，八项严格 AI 用户流程必须明确不可用。
- PDF 输入：未配置 `DOCUMENT_WORKER_URL` 时，Next.js Node runtime 使用 `pdfjs-dist` 原生读取文字层与归一化坐标；`scan` 和 `mixed` 页才调用服务器端 Tesseract.js 本地中英文模型。OCR 以整页 PNG 为输入，混合页在识别后按空间覆盖率和邻近文本去重；运行时不访问 CDN。
- PDF 输出：项目内 Typst CLI `.tools/typst/typst`（`0.15.1`）编译三套真实、可搜索 PDF；预览与下载复用同一二进制产物。路径可由 `TYPST_BIN` 覆盖。
- 状态：当前活动会话保存在标签页级 `sessionStorage`；最近分析以 IndexedDB 保存结构快照和可选本地 PDF Blob。两者都执行 24 小时 TTL，并在应用运行期间或下次打开时清理；不要求 PostgreSQL、Redis、MinIO、Python 或 Docker 才能启动。

本地直接运行使用 `pnpm dev`，Next.js 自动读取被 Git 忽略的 `.env.local`。简历分析、持续编辑、岗位分析和面试推理要求在该私有文件中配置轮换后的 `AI_API_KEY`，并把 `AI_PROVIDER` 设为 `provider_gateway`；没有 Key 时应用可以启动，但这些流程不能返回分析结果。不得把密钥写入 `.env.example`、代码或文档。

### 已接通的隔离文档路径与本地容器

- 文档解析：配置 `DOCUMENT_WORKER_URL` 后，`/api/analyze` 把 PDF 发送到 `services/document-worker`，由 PDFium/pdfplumber 完成原生提取、页面分类、必要 OCR 和页面预览；返回值经 Zod 转换为同一 `DocumentParseOutput`。未配置时使用上一节的 TypeScript baseline；配置后若 worker 网络不可用、超时、解析失败或响应结构非法，会降级到同机 TypeScript baseline，并把降级 warning 展示给用户。文件摘要不一致、413 资源硬门和用户取消必须失败关闭，不能通过 fallback 绕过。
- OCR：worker、镜像和 Compose 均默认使用本地 Tesseract CLI，语言为 `chi_sim+eng`；PaddleOCR 仅是通过构建参数、显式 `OCR_PROVIDER=paddleocr` 和预置本地模型启用的可选增强，禁止运行时下载模型。
- OCR 资源门：worker 每页最多处理 4 个去重区域、每份文档最多 8 个区域，并限制并发、字符、单词、图片框、像素、TSV/文本输出和 block 展开；文档预算默认 45 秒（最大 60 秒），单次 Tesseract 默认 12 秒（最大 20 秒）。超限返回稳定 warning，不丢弃已取得的原生结果。
- AI：允许的十项生成式能力已接入服务端 OpenAI-compatible provider gateway。`resume.score`、`resume.suggest`、`resume.chat`、`jd.parse`、`job.match`、`interview.plan`、`answer.evaluate`、`answer.coach` 八项用户能力使用 `fallbackPolicy: "forbid"`，必须返回各自 `@2.x+`；未配置、超时、限流、5xx、非法结构或事实安全失败时对应操作整体失败，不返回 baseline 或部分 AI 结果。两项 copy 能力保留受事实校验约束的兼容策略。建议 Provider 只返回精简候选，系统字段和 patch 由服务端生成，全部无效时只纠错重试一次。
- 渲染：配置 worker 时，Web 优先调用 `/render-preview`；失败时可回退 Web 本地 Typst。Web 运行镜像固定携带校验过的 Typst `0.15.1`、`font-noto-cjk` 和 `templates/typst` 下三套模板；worker 内 `/usr/local/bin/typst` 读取只读 `/app/templates/typst` 与同类 CJK 字体。两条路径使用同一三模板和质量硬门。
- 容器边界：Compose 中 Web/worker 均为非 root、只读根文件系统、移除 Linux capabilities 并使用独立临时目录；worker 位于 internal backend 网络且无外网出口，并设置 CPU、内存、进程、文件大小和执行时限。
- 取消边界：Node 的请求取消会停止等待并阻止陈旧结果提交，但 Python 已进入 `run_in_threadpool` 的同步 OCR/渲染任务不能被该 `AbortSignal` 立即终止；遗留计算仍由 worker deadline、子进程 timeout、并发和资源限额约束。
- 本地启动：`docker-compose -f infra/docker-compose.yml up --build` 默认只启动 Web、worker 和只绑定 `127.0.0.1` 的受限 loopback proxy。proxy 默认限制 5 秒上游连接、240 秒整体空闲和 32 个并发连接。Compose 自动读取被 Git 忽略的 `.env`；AI Secret 只能放在该文件或进程环境中。
- 本地健康检查：`GET /api/health` 只返回抽象状态，不含 URL、供应商、模型、密钥或错误正文。`ai: baseline/ready` 不代表严格 AI 流程可用；上传页只在 `enhanced/ready` 时开放提交，每次简历、岗位和面试响应仍独立验证所需来源均为 `@2.x+`。
- 未来基础设施：PostgreSQL、Redis 和 MinIO 仅保留在 `future-infra` Compose profile，当前业务不依赖也不连接这些服务。
- 切换方式：文档服务和 AI 通过 adapter + 环境配置切换，不改变领域模型或客户端协议。

隔离文档解析、OCR、渲染 adapter 与十项 AI provider gateway 均已接入服务端 Capability 路径。没有有效 Provider 时简历、岗位和面试的严格 AI 流程都会明确不可用；不能把 baseline 描述为已完成真实 AI 分析。PostgreSQL、Redis/BullMQ、MinIO/S3、服务端 ASR、Vercel/Private Blob/Hosted 模式与任何其他云部署仍是后续目标。

## Skill Extension Registry

### 登记规则

- `status` 仅允许 `baseline | candidate | evaluating | enabled | rejected | deprecated`。
- 当前所有条目均为 `baseline`；外部 Skill 未经许可证、安全和回归评测不得设为 `enabled`。
- 生产默认 Registry 的任意扩展执行模式为 `disabled`；`trusted_local` 只用于受控评测且禁止网络、要求 canonical Schema 和已注册 baseline。`provider_gateway` 只允许静态名单内的十项能力通过服务端受控网关执行，包含经过额外事实安全校验的 `resume.chat` 与 `copy.rewrite.zh/en`。该模式不能用于用户上传代码或扩大数据范围。
- `data scope` 是最大授权，不代表每次调用都会传入全部数据；调用方仍必须执行最小化和 PII 脱敏。
- `network` 的 `none` 表示 baseline 不需要联网；候选 Skill 若需联网，必须重新审批 manifest。
- provider gateway 只接受代码内静态批准的供应商 Base URL；不存在可由 `AI_API_ALLOWLIST` 或用户输入扩张的运行时白名单。
- 所有 baseline 目标固定为对应的 `builtin.<capabilityId>@1.0.0`。默认 `allow` 调用可回退；上传/示例/revision 中的 `resume.score`、`resume.suggest` 固定 `forbid`，失败时不得执行这些目标。
- extension 回退结果使用 `CapabilityResult.usedFallback: true`；当前字段不叫 `degraded`。取消调用直接传播，不以 baseline 覆盖用户取消。

| Capability ID           | Baseline 实现                                                                                                                                                                           | 主要质量缺口 / 期待 Skill                                          | Data scope / Network                      | Eval suite                      | 状态 / 回滚                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ------------------------------- | ------------------------------------------------ |
| `document.parse`        | 配置 worker 时由 PDFium/pdfplumber 原生提取并返回必要 OCR 块；未配置或 worker 可恢复失败时回退 PDF.js 原生文字层、页数与坐标提取，并保留降级 warning                                    | 复杂字体映射、表格、异常编码；摘要不一致、413 和取消不允许回退     | `original_pdf` / none                     | `eval.document.parse.v1`        | baseline / `builtin.document.parse@1.0.0`        |
| `document.ocr`          | worker 默认本地 Tesseract CLI `chi_sim+eng`：scan 整页、mixed 无原生文字图片区域，并具备区域/像素/字符/并发/截止时间硬上限；TypeScript fallback 使用本地 Tesseract.js 并执行 mixed 去重 | 低清、旋转、手写、复杂混合版面；PaddleOCR 可选增强仍需独立质量评测 | `page_image` / none                       | `eval.document.ocr.v1`          | baseline / `builtin.document.ocr@1.0.0`          |
| `document.segment`      | 坐标排序与标题词典分段                                                                                                                                                                  | 双栏交错、浮动侧栏、复杂表格                                       | `source_blocks` / none                    | `eval.document.segment.v1`      | baseline / `builtin.document.segment@1.0.0`      |
| `evidence.mine`         | 从 AST 抽取动作、方法、结果与来源块                                                                                                                                                     | 隐含证据、附件联动、追问质量                                       | `resume_ast,source_blocks` / none         | `eval.evidence.mine.v1`         | baseline / `builtin.evidence.mine@1.0.0`         |
| `claim.assess`          | 规则判定支持、待补证据和用户确认                                                                                                                                                        | 行业事实边界、数字可信度                                           | `evidence_graph` / none                   | `eval.claim.assess.v1`          | baseline / `builtin.claim.assess@1.0.0`          |
| `claim.conflict`        | 相似声明间数值不一致启发式                                                                                                                                                              | 日期、角色、实体、语义冲突与跨附件核对                             | `evidence_graph` / none                   | `eval.claim.conflict.v1`        | baseline / `builtin.claim.conflict@1.0.0`        |
| `resume.score`          | 六维 rubric baseline 仅供评测/非用户兼容；上传用户流禁止调用                                                                                                                             | 用户流要求真实 AI `@2.x+` 与可追溯评分依据                         | `resume_ast,evidence_graph` / provider_only in user flow | `eval.resume.score.v1` | baseline retained；user flow no fallback |
| `resume.suggest`        | 规则建议 baseline 仅供评测/非用户兼容；上传用户流禁止调用                                                                                                                               | 用户流要求真实 AI `@2.x+`、editableTargets 和事实硬门              | `resume_ast,evidence_graph` / provider_only in user flow | `eval.resume.suggest.v1` | baseline retained；user flow no fallback |
| `resume.chat`           | 固定、不可冒充真实 AI 的契约占位输出                                                                                                                                                    | 有界多轮上下文、revision 绑定、证据约束的持续编辑                  | `resume_ast,evidence_graph,interview_content` / none | `eval.resume.chat.v1` | baseline / `builtin.resume.chat@1.0.0` |
| `resume.atsAudit`       | 联系方式、标准板块、表格角色与低置信文字规则                                                                                                                                            | 主流 ATS 差异、真实文件阅读顺序/搜索性与图标识别                   | `resume_ast,source_blocks` / none         | `eval.resume.ats.v1`            | baseline / `builtin.resume.atsAudit@1.0.0`       |
| `jd.parse`              | 标题、职责、技能、硬条件词典解析                                                                                                                                                        | 行业本体、隐含要求、中文长句                                       | `job_description` / none                  | `eval.jd.parse.v1`              | baseline / `builtin.jd.parse@1.0.0`              |
| `job.match`             | JD 要求到声明的关键词 overlap 映射                                                                                                                                                      | 同义/语义能力、职级权重与校准                                      | `job_description,evidence_graph` / none   | `eval.job.match.v1`             | baseline / `builtin.job.match@1.0.0`             |
| `job.riskDetect`        | 违法、歧视、地点与硬条件规则                                                                                                                                                            | 国内招聘风险库、法规更新                                           | `job_description` / none                  | `eval.job.risk.v1`              | baseline / `builtin.job.riskDetect@1.0.0`        |
| `copy.rewrite.zh`       | 中文动作-方法-结果句式模板                                                                                                                                                              | 行业语体、去模板感、术语准确性                                     | `resume_ast` / none                       | `eval.copy.zh.v1`               | baseline / `builtin.copy.rewrite.zh@1.0.0`       |
| `copy.rewrite.en`       | 英文 action-impact 模板与基础语法规则                                                                                                                                                   | 地道表达、时态与地区惯例                                           | `resume_ast` / none                       | `eval.copy.en.v1`               | baseline / `builtin.copy.rewrite.en@1.0.0`       |
| `copy.consistency`      | 同级要点结尾标点一致性                                                                                                                                                                  | 日期、大小写、术语与跨语言风格                                     | `resume_ast` / none                       | `eval.copy.consistency.v1`      | baseline / `builtin.copy.consistency@1.0.0`      |
| `layout.recommend`      | 依内容长度推荐三模板与密度                                                                                                                                                              | 视觉审美、职位场景和分页优化                                       | `resume_ast` / none                       | `eval.layout.recommend.v1`      | baseline / `builtin.layout.recommend@1.0.0`      |
| `resume.render`         | 项目内 Typst 编译三套模板                                                                                                                                                               | CJK 字体覆盖、孤行控制、复杂内容适配                               | `resume_ast` / none                       | `eval.resume.render.v1`         | baseline / `builtin.resume.render@1.0.0`         |
| `export.audit`          | 文本完整性/可搜索性、逐页像素内容、full/no-text/text-mask 三渲染差分、局部字形墨迹带、文本 bbox、替代字符、字体嵌入信号、ATS 顺序、SHA 和资源预算硬门                                   | 复杂非文本图形碰撞、字体观感、主观审美与 ATS 交叉验证              | `rendered_document,resume_ast` / none     | `eval.export.audit.v1`          | baseline / `builtin.export.audit@1.0.0`          |
| `question.retrieve`     | 本地 60 题元数据过滤和词项排序                                                                                                                                                          | 向量召回、更多行业及难度校准                                       | `anonymous_metadata` / none               | `eval.question.retrieve.v1`     | baseline / `builtin.question.retrieve@1.0.0`     |
| `interview.plan`        | 20 分钟、6 主问题、每题至多 2 追问                                                                                                                                                      | 动态节奏、岗位深度和压力梯度                                       | `anonymous_metadata` / none               | `eval.interview.plan.v1`        | baseline / `builtin.interview.plan@1.0.0`        |
| `story.build`           | 从已确认经历生成 STAR 故事草稿                                                                                                                                                          | 追问补全、真实性与表达质量                                         | `resume_ast,evidence_graph` / none        | `eval.story.build.v1`           | baseline / `builtin.story.build@1.0.0`           |
| `speech.transcribe`     | 浏览器语音识别文本标准化，始终提供文字输入                                                                                                                                              | 方言、中英混说、Safari 编码和离线 ASR                              | `selected_text` / none                    | `eval.speech.transcribe.v1`     | baseline / `builtin.speech.transcribe@1.0.0`     |
| `answer.evaluate`       | rubric 关键词、结构和证据规则评分                                                                                                                                                       | 技术正确性、语义相关性和校准                                       | `interview_content,evidence_graph` / none | `eval.answer.evaluate.v1`       | baseline / `builtin.answer.evaluate@1.0.0`       |
| `answer.coach`          | 基于评分缺口的模板化改进建议                                                                                                                                                            | 个性化追问、行业教练策略                                           | `interview_content,evidence_graph` / none | `eval.answer.coach.v1`          | baseline / `builtin.answer.coach@1.0.0`          |
| `resumeInterview.check` | 相关声明的新增数值与待核对状态提示                                                                                                                                                      | 日期、角色、实体、语义口径与误报控制                               | `interview_content,evidence_graph` / none | `eval.consistency.interview.v1` | baseline / `builtin.resumeInterview.check@1.0.0` |
| `pii.redact`            | 按 canonical detection type 对邮箱、电话、证件号、地址和 URL 执行规则脱敏                                                                                                                | 姓名和其他上下文 PII 仍由 provider projection 外围控制；复杂实体歧义、跨语言与误脱敏控制 | `selected_text` / none                    | `eval.security.pii.v1`          | baseline / `builtin.pii.redact@1.0.0`            |
| `prompt.guard`          | 指令注入模式、数据/指令边界封装                                                                                                                                                         | 变体攻击、多语言和编码绕过                                         | `selected_text` / none                    | `eval.security.prompt.v1`       | baseline / `builtin.prompt.guard@1.0.0`          |
| `accessibility.audit`   | 结构化 UI fixture 的名称、焦点、对比度、目标尺寸与标题层级规则                                                                                                                          | 真实 DOM axe、屏幕阅读器人工审计、PDF/UA                           | `ui_render_tree` / none                   | `eval.quality.a11y.v1`          | baseline / `builtin.accessibility.audit@1.0.0`   |
| `security.audit`        | 结构化 fixture 的 worker、隐私与 Skill 边界规则                                                                                                                                         | 实际沙箱逃逸、供应链与渗透测试                                     | `system_metadata` / none                  | `eval.quality.security.v1`      | baseline / `builtin.security.audit@1.0.0`        |
| `llm.eval`              | 固定 fixture、Schema 合规和结果对比                                                                                                                                                     | 专家标注集、偏差/漂移统计                                          | `eval_fixtures` / none                    | `eval.quality.llm.v1`           | baseline / `builtin.llm.eval@1.0.0`              |

### Registry companion metadata

Registry 运行时按 `Capability ID` 保存一个 baseline 和最多一个 extension；实现版本属于 descriptor/manifest 元数据，不作为 Map 的第二层 key。下表逐项记录当前 baseline 的验收入口。除特别说明外，来源均为本仓库独立实现，许可证字段为 `Proprietary`，网络策略为 `none`；JobOK 仅是固定提交 `c5da0c6a6c9936b640a202c78cdd6e64b2981ba6`（MIT）的产品思路参考，不是这些 baseline 的代码、提示词、模板或题库来源。

| Capability ID           | Fixture / 验收样本                                                                                                                                                                                                           | 来源 / 许可            | 供应商限制                                                        | 最近评测                                                                               | 接入结论 / 日期            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------- |
| `document.parse`        | `src/lib/server/document-worker.test.ts`、`src/lib/server/pdf.test.ts`、`services/document-worker/tests/test_parser.py`、`services/document-worker/tests/test_security.py`                                                   | builtin / Proprietary  | worker 与 PDF.js fallback 均本地执行；无外部 provider             | adapter 映射、原生优先、坏文件和隔离 worker smoke 通过                                 | baseline 保留 / 2026-07-23 |
| `document.ocr`          | `tests/capabilities/infrastructure-baseline.test.ts`、`src/lib/server/ocr-merge.test.ts`、`src/app/api/analyze/route.test.ts`、`services/document-worker/tests/test_ocr.py`、`services/document-worker/tests/test_parser.py` | builtin / Proprietary  | 默认本地 Tesseract；禁 CDN/外网；PaddleOCR 必须显式启用并预置模型 | scan/mixed、区域去重、字符/像素/输出上限、并发与超时回归通过                           | baseline 保留 / 2026-07-23 |
| `document.segment`      | `tests/capabilities/infrastructure-baseline.test.ts`                                                                                                                                                                         | builtin / Proprietary  | 无外部 provider                                                   | 阅读顺序和标题角色 fixture 通过                                                        | baseline 保留 / 2026-07-22 |
| `evidence.mine`         | `tests/capabilities/baseline.test.ts`                                                                                                                                                                                        | builtin / Proprietary  | 无外部 provider                                                   | 可追溯声明 fixture 通过                                                                | baseline 保留 / 2026-07-22 |
| `claim.assess`          | `tests/capabilities/baseline.test.ts`、`src/lib/server/analysis.test.ts`                                                                                                                                                     | builtin / Proprietary  | 无外部 provider                                                   | 独立状态 fixture 与分析链接入回归通过                                                  | baseline 保留 / 2026-07-23 |
| `claim.conflict`        | `tests/capabilities/domain-behavior.test.ts`、`src/app/api/routes.test.ts`、`src/lib/server/analysis.test.ts`                                                                                                                | builtin / Proprietary  | 无外部 provider                                                   | 独立数值冲突集及“先评估、后叠加冲突”回归通过                                           | baseline 保留 / 2026-07-23 |
| `resume.score`          | `tests/capabilities/baseline.test.ts`                                                                                                                                                                                        | builtin / Proprietary  | 无外部 provider                                                   | 六维评分 fixture 通过                                                                  | baseline 保留 / 2026-07-22 |
| `resume.suggest`        | `tests/capabilities/baseline.test.ts`、`tests/client/resume.test.ts`                                                                                                                                                         | builtin / Proprietary  | 无外部 provider                                                   | 事实约束与精确 patch fixture 通过                                                      | baseline 保留 / 2026-07-22 |
| `resume.chat`           | `src/app/api/resume-chat/route.test.ts`、`src/lib/client/store.chat.test.ts`、`src/components/workspace/resume-chat.test.ts`                                                                                                | builtin / Proprietary  | 仅静态批准的服务端 provider；无真实结果时 API 显式失败            | 多轮上下文、刷新恢复、revision 绑定、应用修改和拒绝固定话术回归通过                   | baseline 契约保留 / 2026-07-27 |
| `resume.atsAudit`       | `tests/capabilities/domain-behavior.test.ts`、`src/app/api/routes.test.ts` 分析链                                                                                                                                            | builtin / Proprietary  | 无 ATS 厂商背书或兼容承诺                                         | 独立规则与 API 集成回归通过；需补 ATS 厂商样本                                         | baseline 保留 / 2026-07-23 |
| `jd.parse`              | `tests/capabilities/baseline.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                          | builtin / Proprietary  | 无外部 provider                                                   | JD 解析 fixture 通过                                                                   | baseline 保留 / 2026-07-22 |
| `job.match`             | `tests/capabilities/baseline.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                          | builtin / Proprietary  | 无录取概率或招聘平台背书                                          | 要求到证据映射 fixture 通过                                                            | baseline 保留 / 2026-07-22 |
| `job.riskDetect`        | `tests/capabilities/domain-behavior.test.ts`、`src/app/api/routes.test.ts` 岗位链                                                                                                                                            | builtin / Proprietary  | 无法规服务 provider                                               | 独立风险规则与 API 集成回归通过；法规样本待扩充                                        | baseline 保留 / 2026-07-23 |
| `copy.rewrite.zh`       | `tests/capabilities/domain-behavior.test.ts`、`tests/capabilities/baseline.test.ts`、`src/lib/server/ai/provider-gateway.test.ts`                                                                                            | builtin / Proprietary  | 静态批准的服务端 provider；失败回退 baseline                      | 中文 baseline、PII、术语、数字/事实硬门与回退回归通过；专家语料评测待补                | baseline 保留 / 2026-07-23 |
| `copy.rewrite.en`       | `tests/capabilities/domain-behavior.test.ts`、`tests/capabilities/baseline.test.ts`、`src/lib/server/ai/provider-gateway.test.ts`                                                                                            | builtin / Proprietary  | 静态批准的服务端 provider；失败回退 baseline                      | 英文 baseline、结构化改写、术语保留与回退回归通过；专家语料评测待补                    | baseline 保留 / 2026-07-23 |
| `copy.consistency`      | `tests/capabilities/domain-behavior.test.ts`、`tests/capabilities/baseline.test.ts`                                                                                                                                          | builtin / Proprietary  | 无外部模型                                                        | 注册、契约与独立风格一致性 fixture 通过；当前建议流未单独调用                          | baseline 保留 / 2026-07-23 |
| `layout.recommend`      | `tests/capabilities/infrastructure-baseline.test.ts`、`src/app/api/layout-recommend/route.test.ts`、`tests/fixtures/resume-dense.json`                                                                                       | builtin / Proprietary  | 无设计供应商背书                                                  | 三模板排序与 API fixture 通过，当前导出 UI 已展示推荐                                  | baseline 保留 / 2026-07-22 |
| `resume.render`         | `tests/capabilities/infrastructure-baseline.test.ts`、`services/document-worker/tests/test_templates.py`                                                                                                                     | builtin / Proprietary  | 固定本地 Typst；无远程编译                                        | 三模板真实 PDF 与字体检查通过                                                          | baseline 保留 / 2026-07-22 |
| `export.audit`          | `tests/capabilities/infrastructure-baseline.test.ts`、`src/app/api/routes.test.ts`、`src/app/api/export/download/visual-hardgate.test.ts`、`src/lib/pdf-visual-audit.test.ts`                                                | builtin / Proprietary  | 不依赖第三方 ATS；本地 PDF.js + Canvas 逐页三渲染差分审计         | 三模板、纯白、白字、线条掩护、尾部/窄数字遮挡、资源预算、SHA 与内容 hard gate 回归通过 | baseline 保留 / 2026-07-23 |
| `question.retrieve`     | `tests/capabilities/domain-behavior.test.ts`、`src/lib/server/interview-knowledge.test.ts`、`src/app/api/routes.test.ts`                                                                                                     | 独立题库 / Proprietary | 本地知识包；禁远程题库                                            | 60 题 Schema、配额、岗位相关检索与回归通过                                             | baseline 保留 / 2026-07-23 |
| `interview.plan`        | `tests/capabilities/domain-behavior.test.ts`、`src/lib/server/interview-knowledge.test.ts`、`src/app/api/routes.test.ts`                                                                                                     | builtin / Proprietary  | 无外部模型                                                        | 独立六题计划与 API 回归通过                                                            | baseline 保留 / 2026-07-23 |
| `story.build`           | `tests/capabilities/domain-behavior.test.ts`、`src/app/api/routes.test.ts` 分析链                                                                                                                                            | builtin / Proprietary  | 无外部模型                                                        | 独立 STAR 草稿与 API 集成回归通过                                                      | baseline 保留 / 2026-07-23 |
| `speech.transcribe`     | `tests/capabilities/infrastructure-baseline.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                           | builtin / Proprietary  | 仅标准化浏览器已识别文本；无服务端 ASR                            | 文本标准化与隐私契约通过                                                               | baseline 保留 / 2026-07-22 |
| `answer.evaluate`       | `tests/capabilities/domain-behavior.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                   | builtin / Proprietary  | 无外部模型                                                        | 独立回答评分与 API 回归通过                                                            | baseline 保留 / 2026-07-23 |
| `answer.coach`          | `tests/capabilities/domain-behavior.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                   | builtin / Proprietary  | 无外部模型                                                        | 独立教练反馈与 API 回归通过                                                            | baseline 保留 / 2026-07-23 |
| `resumeInterview.check` | `tests/capabilities/domain-behavior.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                   | builtin / Proprietary  | 无外部模型                                                        | 独立简历口径检查与 API 回归通过                                                        | baseline 保留 / 2026-07-23 |
| `pii.redact`            | `tests/capabilities/baseline.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                          | builtin / Proprietary  | 无外部 DLP provider                                                   | 邮箱、电话、证件号、地址和 URL 的 canonical detection fixture 通过                    | baseline 保留 / 2026-07-23 |
| `prompt.guard`          | `tests/capabilities/baseline.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                          | builtin / Proprietary  | 无外部安全 provider                                               | 注入模式 fixture 通过                                                                  | baseline 保留 / 2026-07-22 |
| `accessibility.audit`   | `tests/capabilities/infrastructure-baseline.test.ts`                                                                                                                                                                         | builtin / Proprietary  | 规则结果不等同人工 WCAG 认证                                      | 结构化 UI fixture 通过                                                                 | baseline 保留 / 2026-07-22 |
| `security.audit`        | `tests/capabilities/infrastructure-baseline.test.ts`、`services/document-worker/tests/test_security.py`、Compose smoke                                                                                                       | builtin / Proprietary  | 规则与容器 smoke 不等同第三方渗透测试                             | 权限、文件限制、只读根文件系统和 worker 网络隔离通过                                   | baseline 保留 / 2026-07-23 |
| `llm.eval`              | `tests/capabilities/infrastructure-baseline.test.ts`                                                                                                                                                                         | builtin / Proprietary  | 当前无外部评测平台                                                | 结构化断言 fixture 通过                                                                | baseline 保留 / 2026-07-22 |

姓名、无标签地址、上下文残留扫描和 fail-closed provider 阻断由 `src/lib/server/ai/pii-projection.ts` 与 provider gateway 执行，并由 `src/lib/server/ai/provider-gateway.test.ts` 验证。它们是外部调用前的外围安全控制，不是 `pii.redact` 当前输出契约中的额外 detection type；未来若合并职责必须先版本化 Schema、baseline 与 fixture。

### 候选 Skill 接入门槛

1. 记录来源、版本、许可证、依赖树、商标风险和维护人。
2. 按 manifest 审查数据范围、文件系统、网络、模型供应商及个人信息处理。
3. 通过输入/输出 Zod 契约、超时、非法输出、取消、幂等和 fallback 测试。
4. 在脱敏或合成 fixture 上运行对应 eval suite，并与当前 baseline 比较质量、延迟、成本和稳定性。
5. 先以 feature flag 影子运行，只记录脱敏指标；人工批准后逐步启用。
6. 启用记录必须包含日期、流量范围、评测报告和回滚版本；任何事实安全、隐私或人工确认规则均不可被 Skill 覆盖。

## Codex Development Skill Toolkit

仓库内统一维护 `plugins/resume-assistant-toolkit/`，作为开发、审查和评测本项目的 Codex Skill 入口。它不是产品运行时插件系统，也不会因被 Codex 读取而获得简历、JD、录音、数据库、模型密钥或网络权限。

- 总入口：`skills/resume-assistant-orchestrator/`，负责跨领域任务拆分和顺序编排。
- 领域入口：`resume-document-intelligence`、`resume-evidence-review`、`resume-job-writing`、`resume-layout-export`、`resume-interview-coach`、`resume-safety-evaluation`。
- 单一映射：31 项运行时 Capability 的归属、最大数据范围和 eval suite 只维护在 `resume-assistant-orchestrator/references/capability-map.md`。
- 接入协议：候选运行时 adapter、规则包、知识包或提示策略包必须遵守 `resume-assistant-orchestrator/references/extension-protocol.md`，再进入本文件的 Registry 生命周期。
- 边界：Codex Skill 只提供工程工作流、检查清单和验收方法；实际执行仍由服务器静态 Capability Registry、canonical Zod Schema、最小 data scope、feature flag 和 builtin fallback 控制。
- 维护规则：新增专业领域时优先扩充现有领域 Skill；只有职责无法合理归属时才新增入口。不得在页面组件、提示词或临时文档中另建平行 Capability 清单。

## 文档同步要求

- 产品行为或用户承诺变化：更新 `docs/PRD.md`。
- 契约、边界、运行路径或数据流变化：更新 `docs/ARCHITECTURE.md`。
- Capability 的实现、状态、权限、评测或回滚变化：更新本文件。
- 面试知识包变化：更新 `content/interview/manifest.yaml`，并按 `content/interview/README.md` 完成审核。

## 2026-07-23 本地桌面版验收状态

- 阶段 9 自动化验收通过：TypeScript、ESLint、44 个文件 / 259 项 Web 测试、34 项 document-worker 测试、3 项 loopback proxy 测试、生产构建与 `git diff --check` 全部通过。
- 浏览器已在 1024、1280、1440、1920px 验证首页与工作区无横向滚动或底部空洞；375、768、1023px 只显示电脑访问提示且不挂载工作台。
- 示例会话的两个返回入口、历史恢复、流程门、JD 草稿/证据矩阵、面试设备检查/回答/追问恢复和真实 PDF 质量门均通过；上传区以真实边界而非子元素 enter/leave 计数驱动，并覆盖页面离开与 `Escape` 取消。
- 本地 `127.0.0.1:8001/health` 返回 Typst 与 Tesseract 可用；未配置新 Key 的 `/api/capabilities` 全部为 baseline。`127.0.0.1:3000` 运行 Web 镜像 `sha256:a249fcd2684f47769fc09b8dace3481aed2e8b7dc4fed90f3dbf03159192ef4c`，worker 镜像为 `sha256:e66d66fb46250340337079bc066ad6c35f5b47f1c1ad52deada6630a135bccb9`。
- 本地 Docker 路径可用；`GET /api/health` 已有 4 项 Vitest，覆盖无需探测的自包含 baseline、可用的 isolated/enhanced 状态且不泄漏实现细节、显式配置失效时 fail closed，以及 `no-store` 的 Schema 合法响应。Vercel 与其他云部署仍延期。
- Gitleaks 对全部 Git 历史、当前差异、未跟踪源码和提交消息均无发现；旧提交元数据中的个人邮箱及初始提交生成物需要重写历史才能移除，本轮未经授权不执行。
- 以上结论只覆盖仓库固定 fixture、构建和 smoke 范围，不代表生产 OCR 准确率、第三方安全认证或外部生成式 AI 质量。
