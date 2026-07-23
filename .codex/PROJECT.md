# 简历分析助手：项目约定

最后更新：2026-07-23  
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
8. MVP 使用浏览器语音识别且应用不采集音频 Blob；浏览器供应商边界必须披露。匿名工作状态与本机最近分析最长保留 24 小时，用户可删除单条或立即清空全部。
9. 产品工作台只支持宽度不少于 1024px 的电脑浏览器；窄屏仅显示设备提示，不能挂载或运行上传、分析、工作区或录音界面。
10. “返回首页”只保存并离开当前分析；“删除当前会话”和“清空本机记录”是独立、需明确确认的破坏性动作。

## 参考项目边界

本项目参考 JobOK 的“证据 → 能力 → 岗位 → 简历 → 面试”工作思路，以及证据不足时主动追问的产品原则。参考对象固定为 [GresonKwan/JobOK](https://github.com/GresonKwan/JobOK) 提交 `c5da0c6a6c9936b640a202c78cdd6e64b2981ba6`，其许可证为 MIT。

- 当前实现为独立设计与独立代码，不复制 JobOK 的提示词、题库、模板或具体实现文本。
- JobOK 的 PDF/关键词方案不作为本项目技术基线；本项目采用 SourceBlocks、Resume AST、按页 OCR 与混合页去重合并，以及可追溯证据图。
- 若未来复制或改编任何具有著作权意义的代码或文本，必须先做许可证审查，并在 `THIRD_PARTY_NOTICES.md` 中保留 MIT 许可和版权声明。
- “受某项目启发”不等于兼容、从属、联合开发或质量背书；产品文案不得暗示此类关系。

## 运行路径

### 无 Docker 的 TypeScript baseline

- Web 与 API：Next.js/TypeScript，入口为 `src/app`。
- Capability：服务器端静态白名单，内置确定性规则、模板和浏览器能力；无密钥时必须可降级。
- PDF 输入：未配置 `DOCUMENT_WORKER_URL` 时，Next.js Node runtime 使用 `pdfjs-dist` 原生读取文字层与归一化坐标；`scan` 和 `mixed` 页才调用服务器端 Tesseract.js 本地中英文模型。OCR 以整页 PNG 为输入，混合页在识别后按空间覆盖率和邻近文本去重；运行时不访问 CDN。
- PDF 输出：项目内 Typst CLI `.tools/typst/typst`（`0.15.1`）编译三套真实、可搜索 PDF；预览与下载复用同一二进制产物。路径可由 `TYPST_BIN` 覆盖。
- 状态：当前活动会话保存在标签页级 `sessionStorage`；最近分析以 IndexedDB 保存结构快照和可选本地 PDF Blob。两者都执行 24 小时 TTL，不要求 PostgreSQL、Redis、MinIO、Python 或 Docker 才能启动。

本地直接运行使用 `pnpm dev`，Next.js 自动读取被 Git 忽略的 `.env.local`。如需启用 AI，只能在该私有文件中写入轮换后的新 `AI_API_KEY`，并把 `AI_PROVIDER` 设为 `provider_gateway`；不得把密钥写入 `.env.example`、代码或文档。

### 已接通的隔离文档路径与本地容器

- 文档解析：配置 `DOCUMENT_WORKER_URL` 后，`/api/analyze` 把 PDF 发送到 `services/document-worker`，由 PDFium/pdfplumber 完成原生提取、页面分类、必要 OCR 和页面预览；返回值经 Zod 转换为同一 `DocumentParseOutput`。未配置时使用上一节的 TypeScript baseline；配置后 worker 不可用会返回受控错误，不会静默切换到其他外部服务。
- OCR：worker、镜像和 Compose 均默认使用本地 Tesseract CLI，语言为 `chi_sim+eng`；PaddleOCR 仅是通过构建参数、显式 `OCR_PROVIDER=paddleocr` 和预置本地模型启用的可选增强，禁止运行时下载模型。
- OCR 资源门：worker 每页最多处理 4 个去重区域、每份文档最多 8 个区域，并限制并发、字符、单词、图片框、像素、TSV/文本输出和 block 展开；文档预算默认 45 秒（最大 60 秒），单次 Tesseract 默认 12 秒（最大 20 秒）。超限返回稳定 warning，不丢弃已取得的原生结果。
- AI：允许的九项生成式能力已接入服务端 OpenAI-compatible provider gateway。网关只接收最小化、脱敏、guard 后 DTO；未配置、超时、限流、5xx 或非法结果自动回退 baseline，用户取消除外。当前默认 `AI_PROVIDER=baseline`，等待轮换后的新密钥再启用增强模式。
- 渲染：配置 worker 时，Web 优先调用 `/render-preview`；失败时可回退项目内 Typst。两条路径使用同一三模板和质量硬门，worker 内 `/usr/local/bin/typst` 读取只读 `/app/templates/typst` 与固定 `fonts-noto-cjk`。
- 容器边界：Compose 中 Web/worker 均为非 root、只读根文件系统、移除 Linux capabilities 并使用独立临时目录；worker 位于 internal backend 网络且无外网出口，并设置 CPU、内存、进程、文件大小和执行时限。
- 本地启动：`docker-compose -f infra/docker-compose.yml up --build` 默认只启动 Web、worker 和只绑定 `127.0.0.1` 的受限 loopback proxy。proxy 默认限制 5 秒上游连接、240 秒整体空闲和 32 个并发连接。Compose 自动读取被 Git 忽略的 `.env`；AI Secret 只能放在该文件或进程环境中。
- 未来基础设施：PostgreSQL、Redis 和 MinIO 仅保留在 `future-infra` Compose profile，当前业务不依赖也不连接这些服务。
- 切换方式：文档服务和 AI 通过 adapter + 环境配置切换，不改变领域模型或客户端协议。

隔离文档解析、OCR、渲染 adapter 与九项 AI provider gateway 均已接入当前 Web 数据路径；AI 默认关闭且尚未用真实供应商密钥验收。PostgreSQL、Redis/BullMQ、MinIO/S3、服务端 ASR 与任何云部署仍是后续目标，不得描述为已经投入使用。

## Skill Extension Registry

### 登记规则

- `status` 仅允许 `baseline | candidate | evaluating | enabled | rejected | deprecated`。
- 当前所有条目均为 `baseline`；外部 Skill 未经许可证、安全和回归评测不得设为 `enabled`。
- 生产默认 Registry 的任意扩展执行模式为 `disabled`；`trusted_local` 只用于受控评测且禁止网络、要求 canonical Schema 和已注册 baseline。`provider_gateway` 只允许静态名单内的九项能力通过服务端受控网关执行，不能用于用户上传代码或扩大数据范围。
- `data scope` 是最大授权，不代表每次调用都会传入全部数据；调用方仍必须执行最小化和 PII 脱敏。
- `network` 的 `none` 表示 baseline 不需要联网；候选 Skill 若需联网，必须重新审批 manifest。
- provider gateway 只接受代码内静态批准的供应商 Base URL；不存在可由 `AI_API_ALLOWLIST` 或用户输入扩张的运行时白名单。
- 所有回滚目标固定为对应能力经过测试的 `builtin.<capabilityId>@1.0.0`。新 Skill 失败、超时或输出不符合 Schema 时自动回退，且不得丢失会话 revision。
- extension 回退结果使用 `CapabilityResult.usedFallback: true`；当前字段不叫 `degraded`。取消调用直接传播，不以 baseline 覆盖用户取消。

| Capability ID           | Baseline 实现                                                                                                                                                                           | 主要质量缺口 / 期待 Skill                                          | Data scope / Network                      | Eval suite                      | 状态 / 回滚                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ------------------------------- | ------------------------------------------------ |
| `document.parse`        | 配置 worker 时由 PDFium/pdfplumber 原生提取并返回必要 OCR 块；未配置时回退 PDF.js 原生文字层、页数与坐标提取                                                                            | 复杂字体映射、表格、异常编码                                       | `original_pdf` / none                     | `eval.document.parse.v1`        | baseline / `builtin.document.parse@1.0.0`        |
| `document.ocr`          | worker 默认本地 Tesseract CLI `chi_sim+eng`：scan 整页、mixed 无原生文字图片区域，并具备区域/像素/字符/并发/截止时间硬上限；TypeScript fallback 使用本地 Tesseract.js 并执行 mixed 去重 | 低清、旋转、手写、复杂混合版面；PaddleOCR 可选增强仍需独立质量评测 | `page_image` / none                       | `eval.document.ocr.v1`          | baseline / `builtin.document.ocr@1.0.0`          |
| `document.segment`      | 坐标排序与标题词典分段                                                                                                                                                                  | 双栏交错、浮动侧栏、复杂表格                                       | `source_blocks` / none                    | `eval.document.segment.v1`      | baseline / `builtin.document.segment@1.0.0`      |
| `evidence.mine`         | 从 AST 抽取动作、方法、结果与来源块                                                                                                                                                     | 隐含证据、附件联动、追问质量                                       | `resume_ast,source_blocks` / none         | `eval.evidence.mine.v1`         | baseline / `builtin.evidence.mine@1.0.0`         |
| `claim.assess`          | 规则判定支持、待补证据和用户确认                                                                                                                                                        | 行业事实边界、数字可信度                                           | `evidence_graph` / none                   | `eval.claim.assess.v1`          | baseline / `builtin.claim.assess@1.0.0`          |
| `claim.conflict`        | 相似声明间数值不一致启发式                                                                                                                                                              | 日期、角色、实体、语义冲突与跨附件核对                             | `evidence_graph` / none                   | `eval.claim.conflict.v1`        | baseline / `builtin.claim.conflict@1.0.0`        |
| `resume.score`          | 六维 rubric 与可追溯扣分项                                                                                                                                                              | 行业/职级标定与评分校准                                            | `resume_ast,evidence_graph` / none        | `eval.resume.score.v1`          | baseline / `builtin.resume.score@1.0.0`          |
| `resume.suggest`        | 证据约束的规则化改写建议                                                                                                                                                                | 专业招聘判断、自然表达、多语言                                     | `resume_ast,evidence_graph` / none        | `eval.resume.suggest.v1`        | baseline / `builtin.resume.suggest@1.0.0`        |
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
| `pii.redact`            | 邮箱、电话、证件号、地址和 URL 规则脱敏                                                                                                                                                 | 姓名实体、跨语言和误脱敏控制                                       | `selected_text` / none                    | `eval.security.pii.v1`          | baseline / `builtin.pii.redact@1.0.0`            |
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
| `claim.assess`          | `tests/capabilities/baseline.test.ts` 的 Registry/Schema 基线                                                                                                                                                                | builtin / Proprietary  | 无外部 provider                                                   | 注册与契约通过；尚未接入当前分析 API，独立行为 fixture 待补                            | baseline 保留 / 2026-07-22 |
| `claim.conflict`        | `src/app/api/routes.test.ts` 分析链                                                                                                                                                                                          | builtin / Proprietary  | 无外部 provider                                                   | API 集成回归通过；需补独立冲突集                                                       | baseline 保留 / 2026-07-22 |
| `resume.score`          | `tests/capabilities/baseline.test.ts`                                                                                                                                                                                        | builtin / Proprietary  | 无外部 provider                                                   | 六维评分 fixture 通过                                                                  | baseline 保留 / 2026-07-22 |
| `resume.suggest`        | `tests/capabilities/baseline.test.ts`、`tests/client/resume.test.ts`                                                                                                                                                         | builtin / Proprietary  | 无外部 provider                                                   | 事实约束与精确 patch fixture 通过                                                      | baseline 保留 / 2026-07-22 |
| `resume.atsAudit`       | `src/app/api/routes.test.ts` 分析链                                                                                                                                                                                          | builtin / Proprietary  | 无 ATS 厂商背书或兼容承诺                                         | API 集成回归通过；需补 ATS 厂商样本                                                    | baseline 保留 / 2026-07-22 |
| `jd.parse`              | `tests/capabilities/baseline.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                          | builtin / Proprietary  | 无外部 provider                                                   | JD 解析 fixture 通过                                                                   | baseline 保留 / 2026-07-22 |
| `job.match`             | `tests/capabilities/baseline.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                          | builtin / Proprietary  | 无录取概率或招聘平台背书                                          | 要求到证据映射 fixture 通过                                                            | baseline 保留 / 2026-07-22 |
| `job.riskDetect`        | `src/app/api/routes.test.ts` 岗位链                                                                                                                                                                                          | builtin / Proprietary  | 无法规服务 provider                                               | API 集成回归通过；法规样本待扩充                                                       | baseline 保留 / 2026-07-22 |
| `copy.rewrite.zh`       | `tests/capabilities/baseline.test.ts` 的 Registry/Schema 基线                                                                                                                                                                | builtin / Proprietary  | 无外部模型                                                        | 注册与契约通过；当前建议流未单独调用，专家语料评测待补                                 | baseline 保留 / 2026-07-22 |
| `copy.rewrite.en`       | `tests/capabilities/baseline.test.ts` 的 Registry/Schema 基线                                                                                                                                                                | builtin / Proprietary  | 无外部模型                                                        | 注册与契约通过；当前建议流未单独调用，专家语料评测待补                                 | baseline 保留 / 2026-07-22 |
| `copy.consistency`      | `tests/capabilities/baseline.test.ts` 的 Registry/Schema 基线                                                                                                                                                                | builtin / Proprietary  | 无外部模型                                                        | 注册与契约通过；当前建议流未单独调用，独立风格集待补                                   | baseline 保留 / 2026-07-22 |
| `layout.recommend`      | `tests/capabilities/infrastructure-baseline.test.ts`、`src/app/api/layout-recommend/route.test.ts`、`tests/fixtures/resume-dense.json`                                                                                       | builtin / Proprietary  | 无设计供应商背书                                                  | 三模板排序与 API fixture 通过，当前导出 UI 已展示推荐                                  | baseline 保留 / 2026-07-22 |
| `resume.render`         | `tests/capabilities/infrastructure-baseline.test.ts`、`services/document-worker/tests/test_templates.py`                                                                                                                     | builtin / Proprietary  | 固定本地 Typst；无远程编译                                        | 三模板真实 PDF 与字体检查通过                                                          | baseline 保留 / 2026-07-22 |
| `export.audit`          | `tests/capabilities/infrastructure-baseline.test.ts`、`src/app/api/routes.test.ts`、`src/app/api/export/download/visual-hardgate.test.ts`、`src/lib/pdf-visual-audit.test.ts`                                                | builtin / Proprietary  | 不依赖第三方 ATS；本地 PDF.js + Canvas 逐页三渲染差分审计         | 三模板、纯白、白字、线条掩护、尾部/窄数字遮挡、资源预算、SHA 与内容 hard gate 回归通过 | baseline 保留 / 2026-07-23 |
| `question.retrieve`     | `src/lib/server/interview-knowledge.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                   | 独立题库 / Proprietary | 本地知识包；禁远程题库                                            | 60 题 Schema、配额与检索回归通过                                                       | baseline 保留 / 2026-07-22 |
| `interview.plan`        | `src/lib/server/interview-knowledge.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                   | builtin / Proprietary  | 无外部模型                                                        | 六题计划 API 回归通过                                                                  | baseline 保留 / 2026-07-22 |
| `story.build`           | `src/app/api/routes.test.ts` 分析链                                                                                                                                                                                          | builtin / Proprietary  | 无外部模型                                                        | API 集成回归通过；独立 STAR fixture 待补                                               | baseline 保留 / 2026-07-22 |
| `speech.transcribe`     | `tests/capabilities/infrastructure-baseline.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                           | builtin / Proprietary  | 仅标准化浏览器已识别文本；无服务端 ASR                            | 文本标准化与隐私契约通过                                                               | baseline 保留 / 2026-07-22 |
| `answer.evaluate`       | `src/app/api/routes.test.ts`                                                                                                                                                                                                 | builtin / Proprietary  | 无外部模型                                                        | 回答评审 API 回归通过                                                                  | baseline 保留 / 2026-07-22 |
| `answer.coach`          | `src/app/api/routes.test.ts`                                                                                                                                                                                                 | builtin / Proprietary  | 无外部模型                                                        | 教练反馈 API 回归通过                                                                  | baseline 保留 / 2026-07-22 |
| `resumeInterview.check` | `src/app/api/routes.test.ts`                                                                                                                                                                                                 | builtin / Proprietary  | 无外部模型                                                        | 简历口径检查 API 回归通过                                                              | baseline 保留 / 2026-07-22 |
| `pii.redact`            | `tests/capabilities/baseline.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                          | builtin / Proprietary  | 无外部 DLP provider                                               | 邮箱/电话/URL fixture 通过                                                             | baseline 保留 / 2026-07-22 |
| `prompt.guard`          | `tests/capabilities/baseline.test.ts`、`src/app/api/routes.test.ts`                                                                                                                                                          | builtin / Proprietary  | 无外部安全 provider                                               | 注入模式 fixture 通过                                                                  | baseline 保留 / 2026-07-22 |
| `accessibility.audit`   | `tests/capabilities/infrastructure-baseline.test.ts`                                                                                                                                                                         | builtin / Proprietary  | 规则结果不等同人工 WCAG 认证                                      | 结构化 UI fixture 通过                                                                 | baseline 保留 / 2026-07-22 |
| `security.audit`        | `tests/capabilities/infrastructure-baseline.test.ts`、`services/document-worker/tests/test_security.py`、Compose smoke                                                                                                       | builtin / Proprietary  | 规则与容器 smoke 不等同第三方渗透测试                             | 权限、文件限制、只读根文件系统和 worker 网络隔离通过                                   | baseline 保留 / 2026-07-23 |
| `llm.eval`              | `tests/capabilities/infrastructure-baseline.test.ts`                                                                                                                                                                         | builtin / Proprietary  | 当前无外部评测平台                                                | 结构化断言 fixture 通过                                                                | baseline 保留 / 2026-07-22 |

### 候选 Skill 接入门槛

1. 记录来源、版本、许可证、依赖树、商标风险和维护人。
2. 按 manifest 审查数据范围、文件系统、网络、模型供应商及个人信息处理。
3. 通过输入/输出 Zod 契约、超时、非法输出、取消、幂等和 fallback 测试。
4. 在脱敏或合成 fixture 上运行对应 eval suite，并与当前 baseline 比较质量、延迟、成本和稳定性。
5. 先以 feature flag 影子运行，只记录脱敏指标；人工批准后逐步启用。
6. 启用记录必须包含日期、流量范围、评测报告和回滚版本；任何事实安全、隐私或人工确认规则均不可被 Skill 覆盖。

## 文档同步要求

- 产品行为或用户承诺变化：更新 `docs/PRD.md`。
- 契约、边界、运行路径或数据流变化：更新 `docs/ARCHITECTURE.md`。
- Capability 的实现、状态、权限、评测或回滚变化：更新本文件。
- 面试知识包变化：更新 `content/interview/manifest.yaml`，并按 `content/interview/README.md` 完成审核。

## 2026-07-23 本地桌面版验收状态

- 上一版工程基线曾通过完整 TypeScript、Vitest、worker pytest、构建和容器 smoke；阶段 6 改动后的最终测试数量待本轮全量验证填写，不沿用旧数字作为当前结论。
- 浏览器已在 1024、1280、1440、1920px 验证首页与工作区无横向滚动；375、768、1023px 只显示电脑访问提示且不挂载工作台。
- 示例会话的顶栏返回、侧栏品牌返回、历史恢复、当前会话删除、单条删除及清空取消/确认均通过；控制台没有应用 error/warn。
- 本地 `127.0.0.1:8001/health` 返回 Typst 与 Tesseract 可用；未配置新 Key 的开发服务 `/api/capabilities` 全部为 baseline。旧 `127.0.0.1:3000` 容器仍需在最终交付前重建。
- 以上结论只覆盖仓库固定 fixture、构建和 smoke 范围，不代表生产 OCR 准确率、第三方安全认证或外部生成式 AI 质量。
