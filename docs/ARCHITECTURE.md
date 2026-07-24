# 简历分析助手技术架构

版本：`0.1.0`  
Capability contract：`1.0`；builtin implementation：`1.0.0`  
日期：2026-07-23

## 1. 架构目标

系统围绕三条不变量设计：原始材料不可变、事实变更可追溯、专业能力可替换。业务层只依赖版本化 Capability 契约，内置 baseline 和后续 Skill 共享相同输入输出；供应商、模型和执行环境不能泄漏到前端或领域模型。

架构思路参考 [GresonKwan/JobOK](https://github.com/GresonKwan/JobOK) 固定提交 `c5da0c6a6c9936b640a202c78cdd6e64b2981ba6`（MIT）的证据链/JD/面试一致性原则；实现代码、模板、提示策略和题库均独立编写。若未来实际复制或改编 MIT 内容，必须单独保留许可与版权声明。

## 2. 运行拓扑

### 2.1 无 Docker 的 TypeScript baseline

```text
Browser
  ├─ Next.js UI
  ├─ sessionStorage active state
  ├─ IndexedDB 24h history / local PDF Blob
  └─ Web Speech recognition or editable text
        │ HTTP
Next.js Node runtime
  ├─ API routes
  ├─ PDF.js native extraction + page PNG rendering
  ├─ offline Tesseract.js for scan/mixed pages
  ├─ static Capability Registry + deterministic baselines
  ├─ optional provider gateway for nine allowlisted capabilities
  └─ local Typst compilation
       └─ .tools/typst/typst (0.15.1)
```

未配置 `DOCUMENT_WORKER_URL` 时，PDF.js 与 Tesseract.js 运行在 Next.js Node runtime，不在浏览器执行。本地开发不要求 Docker、数据库或外部密钥；活动状态使用标签页级 `sessionStorage`，最近分析与可选原 PDF 使用 IndexedDB，两者在 24 小时后到期，并在应用运行期间或下次打开时清理；浏览器不支持语音识别时回退为文字输入。`TYPST_BIN` 默认指向项目内 CLI，渲染失败会阻断当前产物，不存在未声明的 TypeScript renderer fallback。`pnpm dev` 读取 `.env.local`，该私有文件和 `.env` 均在 `.gitignore` 中。

App 顶层桌面边界在 hydration 后检查 `min-width: 1024px`。窄屏只挂载设备提示，不挂载 Upload、AnalysisProgress、Workspace 或语音组件。1024px 以上始终使用 216px 侧栏和桌面文档/建议布局，不存在底部导航或手机单列工作台。

### 2.2 已接通的隔离文档路径

```text
Browser
  │ HTTP(S)
Next.js Web/API
  └─ POST /api/analyze
       └─ DOCUMENT_WORKER_URL → Python document service
            ├─ PDFium + pdfplumber        render / native extraction
            ├─ local Tesseract CLI        chi_sim+eng OCR (default)
            ├─ optional local PaddleOCR   explicit enhancement only
            └─ normalized parse response  native/OCR blocks + PNG previews
```

配置 `DOCUMENT_WORKER_URL` 后，`parseWithDocumentWorker` 使用 180 秒请求预算调用 `/parse`，以 Zod 校验响应并映射到 `DocumentParseOutput`，随后沿用 TypeScript 的分段、AST、证据、评分和建议流程。未配置时该 adapter 返回 `null` 并调用 2.1 的 baseline；配置后遇到 worker 网络不可用、超时、解析失败、缺少页面数据或 Schema 非法时，也会回退同机 TypeScript baseline，并在解析 warning 与 capability warning 中记录降级。上传摘要不一致、413 资源硬门和用户主动取消不会回退；前两者防止完整性或资源限制被绕过，取消则保持用户意图。fallback 不会把简历发送给其他服务。Web 的 `/api/render` 同样优先调用 worker `/render-preview`，远端渲染失败时再回退 Web 本地 Typst；二者产物进入同一审计与确认链。`infra/web.Dockerfile` 按架构校验下载 Typst `0.15.1`，在运行镜像安装 `font-noto-cjk` 并复制 `templates/typst` 三套模板，因此容器内 fallback 不依赖宿主机工具。

worker、镜像和 Compose 默认 `OCR_PROVIDER=tesseract`、`TESSERACT_LANGUAGE=chi_sim+eng`。PaddleOCR 只有在显式构建 OCR 依赖、设置 `OCR_PROVIDER=paddleocr` 并预置本地检测/识别模型目录后才启用；`PADDLEOCR_ALLOW_MODEL_DOWNLOAD=false`，不是默认路径。

Node 侧 `AbortSignal` 能停止等待 worker 响应并阻止陈旧结果提交，但无法立即终止 Python 已经进入 `run_in_threadpool` 的同步 OCR/渲染函数。断开连接后仍在执行的计算由 worker deadline、OCR 子进程 timeout、并发、内存、CPU、进程和文件大小限制约束；在改为可协作取消的进程模型前，这是明确保留的本地运行风险。

### 2.3 后续生产基础设施目标

Compose 默认只启动 Web、隔离 worker 和仅发布到宿主 `127.0.0.1` 的受限 loopback proxy；proxy 设 5 秒上游连接超时、240 秒整体空闲超时和默认 32 个并发连接上限。PostgreSQL、Redis 和 MinIO 放在 `future-infra` profile，当前业务状态仍在 sessionStorage/IndexedDB，队列和对象存储 adapter 尚未接入。Compose 自动读取被 Git 忽略的 `.env`；`pnpm dev` 则读取 `.env.local`，两个私有文件都只能保存轮换后的本地 Secret。当前本地版不实施 Vercel、Private Blob、Hosted 模式或其他云对象存储/部署路径；embedding 与服务端 ASR provider 也未接入。当前与目标的边界如下：

| Concern        | Local baseline                | Production adapter                                |
| -------------- | ----------------------------- | ------------------------------------------------- |
| Domain state   | sessionStorage + IndexedDB    | PostgreSQL + pgvector                             |
| Async work     | in-process task runner        | Redis + BullMQ workers                            |
| Binary objects | IndexedDB Blob / object URLs  | MinIO/S3 signed object keys（本轮不实施）         |
| Document parse | PDF.js + offline Tesseract.js | **已接通**：`services/document-worker` Python API |
| Render         | 项目内 Typst                  | **已接通**：优先 worker Typst，失败回退本地 Typst |
| Speech         | Web Speech or editable text   | approved ASR adapter                              |
| AI generation  | optional server gateway       | same contract behind reviewed provider/flag       |

所有切换均通过环境配置和 adapter 注入完成，API wire shape、Resume AST 以及 Claim/EvidenceAsset/SourceBlock 的关联语义不变化。文档 parse/OCR/render 与 AI gateway 已接通；AI 默认关闭。数据库、队列、对象存储和服务端 ASR 仍是未来目标。

## 3. 核心数据流水线

```text
Immutable original PDF
  → safety validation
  → page classification
  → native text extraction ───────────────┐
  → OCR only for scan/mixed pages ─────────┤
  → adapter-specific mixed-page merge      ┤
  → deduplicated SourceBlocks             │
  → Resume AST                            │
  ├─ claim/evidence relations → scoring/suggestions
  ├─ JD requirements → evidence matrix
  ├─ accepted revision → story cards
  └─ template render → PDF audit → preview/download
```

### 3.1 页面分类和 OCR

两个文档 adapter 都先读取每页原生文字，再分类并只在需要时 OCR：

- `digital`：有效文字层足够，完全使用原生提取。
- `scan`：文字层缺失或无效，整页安全渲染后 OCR。
- `mixed`：存在可用原生文字和需要补充识别的图片内容。

隔离 worker 使用 PDFium/pdfplumber：`digital` 不调用 OCR，`scan` 把整页交给默认的本地 Tesseract CLI，`mixed` 只裁取面积达阈值且没有原生字符覆盖的图片区域识别。无 Docker baseline 使用 PDF.js + 本地 Tesseract.js：`scan`/`mixed` 都识别整页，`mixed` 再依据原生 bbox 的覆盖率、邻近范围、规范化文本和 bigram 相似度过滤。两条路径的 OCR 结果都归一为带 `source: ocr`、置信度和 bbox 的 SourceBlock。

worker 在调用 OCR 前按 85% 较小区域覆盖率去重，每页最多 4 个区域、每份文档最多 8 个区域，并用 semaphore 将 OCR 并发限制为 2。文档 OCR 默认预算 45 秒、最大 60 秒；单次 Tesseract 默认 12 秒、最大 20 秒，剩余 deadline 会继续传入子进程 timeout。字符、单词、图片框、区域像素、TSV 行/字节、fragment/block 展开和输出文本均有硬上限；超限返回稳定 warning code 并保留已有 native/scan/mixed 结果。

低置信度、双栏歧义、旋转或顺序异常进入人工确认，不应静默猜测。PaddleOCR 是 worker 的显式可选 provider，不是默认实现，也不是外部 AI 已接入的证据。

### 3.2 分层模型

- `SourceBlock`：不可变来源块，含 `id/page/bbox/text/source/confidence/style`。
- `ResumeDocument`：语言、页面、解析警告、当前 revision 和 AST。
- `ResumeNode`：联系信息、摘要、经历、教育、项目、技能等结构节点，保存来源块引用。
- `Claim`：文本、主体、动作、方法、结果、来源引用和支持状态。
- 逻辑 EvidenceGraph：当前不是单独持久化对象，而由 Claim 的 `sourceBlockIds/evidenceAssetIds` 与 EvidenceAsset 的 `sourceBlockIds` 共同表达；生产 adapter 可据此物化为图或关系表。
- `Suggestion`：`resumeRevision/sourceBlockIds/claimIds/kind/status/originalText/proposedText/rationale/beforeHash/patches/factRisk/interviewRisk`。
- `JobDraft/JobPosting/JDRequirement`：可恢复的职位名、职级、地点、语言和原始 JD 草稿，以及结构化岗位要求。
- `RequirementEvidenceMap`：要求、证据、覆盖状态、解释和追问。
- `ResumeVariant`：基线 revision 的岗位分支，不复制或覆盖原稿。
- `InterviewStory`：已确认声明映射成的 STAR 训练材料。
- `InterviewQuestion/AnswerEvaluation/InterviewProgress`：问题、评分维度、反馈、引用片段、追问和可恢复进度。`InterviewProgress` 以简历 ID/revision 与计划指纹绑定，进入 `sessionStorage` 和 IndexedDB 历史；录音对象、计时器和权限错误仍为临时态。
- Render response / `ExportQualityReport`：模板、PDF 哈希、页数和审计结果；当前没有单独持久化的 `LayoutCandidate` 实体。

## 4. Capability 契约

契约的 TypeScript 语义如下；具体代码以仓库 Schema 为准：

```ts
type CapabilityDescriptor = {
  id: CapabilityId;
  version: string;
  contractVersion: "1.0";
  locales: string[];
  license: string;
  provenance: string;
  dataScopes: DataScope[];
  networkPolicy: "none" | "provider_only" | "allowlist";
  timeoutMs: number;
  fallbackImplementation: string;
};

type CapabilityContext = {
  sessionId: string;
  locale: string;
  grantedDataScopes: DataScope[];
  traceId: string;
  deadlineAt: string;
  signal?: AbortSignal;
};

type CapabilityResult<T> = {
  data: T;
  confidence: number;
  evidenceReferences: string[];
  warnings: { code: string; message: string }[];
  sourceVersion: string;
  durationMs: number;
  usage?: { inputUnits?: number; outputUnits?: number; estimatedCost?: number };
  usedFallback: boolean;
};
```

- 每个输入和输出均有 Zod Schema；JSON Schema 从同一契约构建并用于跨进程验证。
- Registry 在服务器构建期静态注册，运行时 Map 以 capability ID 为 key，保存一个 baseline 和最多一个受控实现；实现版本保存在 descriptor/manifest 中。用户输入不能注册代码；任意 extension 默认禁用，`provider_gateway` 仅允许固定生成式能力名单。
- Descriptor 与 Skill manifest 在启用前验证；CapabilityContext 不含数据库、对象存储或模型密钥。
- 已注册 extension 超时、异常或输出 Schema 非法时调用同契约 baseline fallback，结果以 `usedFallback: true` 标记；取消请求直接传播，不执行 fallback。输入/上下文/权限错误在调用前拒绝。
- 写操作由业务 service 在 Capability 返回后执行。Skill 只计算结果，不能直接提交 revision 或访问任意对象键。
- 前端只得到 `FeatureAvailability { id, available, mode, locales, fallbackAvailable }`。

### 4.1 Skill manifest

每个代码适配器、规则包、知识包或提示策略包必须声明：

`id, version, kind, contractVersion, locales, dataScopes, networkPolicy, license, provenance, evalSuiteId`

代码适配器在构建期打包；规则包使用 JSON/YAML；知识包使用带 frontmatter 的 Markdown；提示策略只包含版本化模板和输出 Schema。任何包都不能通过 prompt 自行获得网络或工具权限。

### 4.2 调用与回退

1. 未配置 AI 时 Registry 只选择内置 baseline；受信本地扩展仅在显式评测模式启用，且必须使用 canonical Schema、禁网并保留 baseline。
2. `provider_gateway` 只增强九项能力：`resume.score`、`resume.suggest`、`jd.parse`、`job.match`、`copy.rewrite.zh`、`copy.rewrite.en`、`interview.plan`、`answer.evaluate` 和 `answer.coach`；其余能力只能调用确定性 baseline。两项 copy 能力只发送脱敏后的选中文本与保留术语，返回值必须保持原文映射、指定术语和数字，不得新增排名、资质或成果，否则回退 baseline。
3. Gateway 在 Next.js 服务端完成字段投影与 PII 清理，只从环境变量注入 URL、Key 和模型。前端 bundle、FeatureAvailability、日志与响应不包含供应商细节。
   Base URL 还必须命中代码内静态批准列表；系统不读取可配置的 `AI_API_ALLOWLIST`，避免部署者通过环境变量无审查扩权。
4. 首次请求使用 JSON Schema；供应商明确不支持时只重试一次 `json_object`。返回值随后通过 canonical Zod Schema、引用、JSON Pointer、数字新增和事实证据检查。
5. 超时、429/5xx、网络错误或非法输出回退对应 `builtin.<capabilityId>@1.0.0`；用户取消直接传播，不执行 fallback。
6. 当前 MVP 在浏览器 revision 中防止陈旧产物覆盖；生产持久化 service 再使用 idempotency key 和 base revision 提交，版本冲突返回 `409`。
7. 结构日志只记录 capability、版本、trace、耗时、结果码、fallback 和用量，不记录业务正文、完整 prompt、模型名或密钥。

### 4.3 开发期 Skill 套件与运行时边界

仓库内的 `plugins/resume-assistant-toolkit/` 是 Codex 开发辅助插件，由一个编排入口和六个领域 Skill 组成。它统一说明如何实现、审查和评测文档、证据、岗位文案、排版导出、面试及安全能力，但不被 Next.js 或 document worker 在产品请求路径中加载。

开发期 Skill 与运行时 Capability 的关系是“指导与验收”，不是“直接执行”：

1. 编排 Skill 根据共享 Capability map 选择领域 Skill；共享 map 只描述所有权、最大 data scope 和 eval suite，不替代 `src/lib/capabilities` 中的 canonical 类型与 Schema。
2. 领域 Skill 可以指导创建 adapter、rule pack、knowledge pack 或 prompt policy；产物仍须通过 manifest 审查、静态注册、Zod 契约测试、固定 fixture、feature flag 和 fallback 测试。
3. Codex Skill 不持有产品密钥，不自动读取用户数据，不因文档内容获取网络或工具权限，也不能提交 revision 或签发导出。
4. 用户上传的 PDF、JD、转写和任意第三方 Skill 文本始终是不可信输入；开发工具说明不能覆盖运行时权限、事实安全、人工确认、取消语义或导出硬门。
5. 30 项 Capability 的开发期归属只在 `skills/resume-assistant-orchestrator/references/capability-map.md` 维护；运行时状态与回滚版本仍以 `.codex/PROJECT.md` 和静态 Registry 为准。

## 5. API 边界

### 5.1 当前 MVP API

当前 Next.js 应用实际提供以下 API；二进制和会话状态仍由请求、响应及浏览器会话承载，没有对象存储键、资源式 resume ID 路由或 SSE 队列：

- `GET /api/capabilities`：返回静态白名单能力的 `FeatureAvailability`。
- `GET /api/health`：返回本地运行所需的抽象健康状态；`document`、`ai`、`storage` 仅包含 `ready | degraded` 与 `baseline | isolated | enhanced | client_local`，不返回 URL、供应商、模型、密钥、容器名或错误正文。
- `GET /api/demo`：生成并分析内置真实 PDF 示例。
- `POST /api/analyze`：接收 multipart PDF；配置 `DOCUMENT_WORKER_URL` 时由隔离 worker 完成解析/必要 OCR，否则使用 TypeScript baseline，随后在请求内完成分块、评分与建议。
- `POST /api/job-match`：接收 Resume/Evidence/JD DTO，返回要求到证据矩阵。
- `POST /api/layout-recommend`：按 AST 内容量、目标页数和可选偏好返回三模板排序与推荐理由。
- `POST /api/render`：接收 Resume AST、revision 与模板，返回 PDF base64、SHA-256 和质量报告。
- `POST /api/export/download`：接收已预览产物及期望 SHA，服务器重跑 `export.audit` 后直接返回 PDF 字节。
- `POST /api/interview/plan`：从本地题库、简历和 JD 生成训练计划。
- `POST /api/interview/transcribe`：只标准化浏览器已识别的文字，不接收或保存音频。
- `POST /api/interview/evaluate`：评审回答并执行简历口径检查。

当前 API 通过 Zod 校验输入并把 `request.signal` 传入 CapabilityContext；隔离文档响应另经 Zod 校验。上述九项生成式 capability 可调用已接线的 provider gateway；默认配置仍只运行 baseline。简历分析链在冲突检查前逐条调用 `claim.assess`，再把冲突状态叠加到已评估声明上。当前不声称已经完成真实供应商质量验收、持久化幂等键、资源所有权或队列 worker 恢复。

健康端点采用 `no-store` 响应并以本地可用性为准：未配置 worker 或 provider 时，document/AI baseline 与 `client_local` storage 都是 `ready`，不会因为未启用增强依赖而误报降级；只有显式配置隔离文档或增强 AI 且该配置不可用时，对应组件及整体状态才为 `degraded`。该端点不执行真实 AI 内容请求，也不改变 Vercel、Private Blob 与 Hosted 模式仍延期的边界。

上传 multipart 在 `formData()` 前按流限制为 10 MB PDF 加固定表单开销；导出下载 JSON 即使缺少 `Content-Length` 也会在 16 MB 处取消流并返回 `413`，不会先完整缓冲。`export.audit` 同时消费请求取消信号和 deadline。

### 5.2 生产对象存储/队列 API（未来目标）

以下资源 API 是 PostgreSQL、Redis/BullMQ 和 S3/MinIO adapter 接通后的目标，不属于当前 MVP 已实现端点：

- `POST /api/resumes/uploads`：校验会话和文件元数据，创建上传。
- `POST /api/resumes/:id/process`：幂等启动解析；`GET .../events` 通过 SSE 返回阶段进度。
- `PATCH /api/resumes/:id/blocks/:blockId`：人工修正解析结果并创建 revision。
- `POST /api/resumes/:id/suggestions`：对当前 revision 分析。
- `POST /api/suggestions/:id/actions`：接受、拒绝、手改、补事实或撤销；携带 base revision。
- `POST /api/jobs/analyze`：解析单个 JD；`GET /api/jobs/:id/evidence-map` 获取覆盖矩阵。
- `POST /api/resumes/:id/variants`：从基线创建一个岗位分支。
- `POST /api/resumes/:id/layouts`：生成三套候选；`GET .../:layoutId/pdf` 返回同一预览产物。
- `POST /api/layouts/:id/confirm`：确认通过审计的候选；下载使用相同对象键和哈希。
- `POST /api/interviews`：创建计划；音频上传、转写、文字修正、回答评估、下一题和结束报告使用子资源。
- `DELETE /api/sessions/:id`：立即撤销会话并排队删除关联对象。

目标状态下，所有创建/写入接口接受 `Idempotency-Key`，所有 revision 写入接受 `If-Match`；对象下载使用短时签名 URL 且校验 session ownership。

## 6. 排版与质量审计

`layout.recommend` 根据 AST 内容字符量、目标页数和可选模板偏好推荐 `professional | minimal | compact`，并估算页数；当前导出 UI 通过 `/api/layout-recommend` 展示结果。`resume.render` 读取 Resume AST 中需要展示的内容（包括用户选择保留的联系方式），不读取原 PDF。`export.audit` 独立读取 AST 和渲染结果，同时抽取文字层并在服务器逐页栅格化；它不信任客户端的预览结论。

当前自动审计读取 PDF 文字层和文本对象 bbox，覆盖：

- AST 文本片段完整性与可搜索文字层。
- 服务器逐页检查非白像素、强对比像素、亮度范围与亮度方差；纯白、纯透明或无实际标记的纯色页直接失败。
- 服务器分别渲染完整页、去文字页和强制黑色文字 mask，用差分证明文字本身实际改变了画面；每个 text item 再沿真实 mask 墨迹列分成最多 16 个局部带，并用约 0.75 字符宽的重叠滑窗检查局部贡献。白字白底、装饰线掩护、句尾 10% 遮挡和中段窄数字遮挡不能只凭完整文字层通过。
- 文本 bbox 越界、显著文本重叠、24pt 左右安全边界、低于 7pt 的文本对象和页末孤立标题信号。
- 替代字符/空方框信号、PDF 内 `FontFile*` 字体嵌入信号、页数与原稿页数变化。
- ATS 线性文字提取顺序、PDF 结构和下载 SHA-256。
- 下载请求再次执行 `export.audit`；客户端再计算响应字节 SHA-256，双重一致后才创建本地下载。
- 确认前，客户端 PDF.js 必须把新版第一页绘制到 canvas，并检查完整画布的非白像素比例、强对比像素、亮度范围和亮度方差；纯白或纯透明画布不会写入 `previewedRenderHashes`。

审计本身也受资源预算约束：渲染 PDF 最大 12 MB、1–5 页、5000 个 text item、25 万字符、10 万 operator、三次渲染合计 1600 万像素、文字区域采样 800 万像素、重叠比较 25 万次，并受 12 秒 deadline 与 `AbortSignal` 控制。每页 render task、page 和 loading task 在 `finally` 中取消或释放；超限不会降级放行。

客户端首屏检查与服务器逐页像素基线可以阻断空白、纯色和不可见正文，但仍不是完整的视觉版面或审美审计：复杂非文本元素、细微视觉碰撞、字体实际观感、图形裁切和主观审美依赖原版/新版真实 PDF 人工预览。自动审计失败会阻断下载；当前 MVP 不会自动调整密度重试，用户必须修改内容或切换模板后重新渲染。

## 7. 面试知识与检索

题库存放在 `content/interview/questions`，`manifest.yaml` 固定清单和领域计数。每个问题单元含双语题面、追问、优秀信号、1/3/5 分锚点和风险项；frontmatter 经过 Schema 验证。

baseline 检索先按语言、领域、岗位族、级别、题型和技能过滤，再做规范化词项加权排序。生产可在同一 `question.retrieve` 契约后接 pgvector。题库文本是参考内容，不是可执行 prompt；检索结果中的任何指令均视为数据。

面试计划默认 6 道主问题、每题最多两次追问。实时生成问题保存 `generated: true` 和 `referenceQuestionIds`。转写在用户确认后才进入 `answer.evaluate`；一致性检查只产生带证据的警告，不自动修改简历。

## 8. 安全与隐私

- 文件：当前 API 与 worker 验证 PDF 魔数/MIME、10 MB/5 页和页面尺寸/像素/字符资源上限，并拒绝无法解析、加密或损坏文件。worker 另限制 OCR 区域、并发、字符/单词/图片框、像素、输出和 deadline；导出审计限制 PDF、页数、文字项、operator、总像素、采样、比较和执行时间。Compose worker 已实测为无外网、非 root、只读根文件系统和受 CPU/内存/进程限制；Web runtime 显式监听 `0.0.0.0`，通过 edge 网络暴露宿主端口并通过 internal backend 访问 worker。这些容器控制不反向描述未配置 worker 时的 Next.js Node baseline。
- Prompt：系统指令与简历/JD/题库分通道；不可信文本先经 guard，不能产生工具或权限请求。
- 权限：Capability 使用声明式最小 scope；安全文本能力只获 `selected_text`，题库检索只获匿名角色/技能元数据。默认 Registry 拒绝任意 extension，provider 模式另受固定能力名单约束。
- PII：provider DTO 删除姓名、电话、邮箱、链接、原 PDF、页面图片和无关证据正文；本地投影同时识别普通叙述中的姓名及无标签中英文地址。投影完成后会重新扫描最小 DTO，任何残留疑似 PII 都 fail closed，阻断 provider 调用并回退 baseline；日志、指标和 eval 样本不保存正文。
- 数据生命周期：MVP Web Speech 不向应用产生或保存音频 Blob；转写文字仅存于设备会话。活动状态使用 `sessionStorage`，最近分析及可选原 PDF 使用 IndexedDB；最多 10 条/50 MB，24 小时后过期，并在应用运行期间或下次打开时清理。生产 ASR 若接收音频，必须在转写后删除并记录无正文删除回执。
- 供应链：依赖锁定，候选 Skill 审查许可证和依赖；生产镜像固定 digest，禁止运行时下载代码。

## 9. 可观测性和故障策略

当前 MVP 在响应头和会话 processing metadata 中保留 capability 版本/trace，并使用请求取消和 baseline fallback；隔离文档 adapter 已接通，但以下指标、队列重试和持久化 worker 恢复仍是后续目标：

- 指标：各 stage/capability 成功率、p50/p95 延迟、fallback 比例、Schema 失败、OCR 使用率、导出阻断率和清理延迟。
- Trace：上传到导出/面试 turn 使用同一 trace lineage；日志只含匿名 ID 和结构化元数据。
- 队列重试：只对瞬态失败有限重试；AI 非法输出最多修复一次；任务通过 idempotency key 防重复。
- 降级：外部 AI/OCR/ASR 不可用时启用 baseline；PDF 审计失败不能降级放行，必须阻断下载。
- 恢复：任务状态与 revision 分离，worker 重启从最后一个已提交 stage 继续。

## 10. 测试策略

阶段 9 自动化验证通过 `typecheck`、lint、44 个文件 / 259 项 Vitest、34 项 document-worker pytest、3 项 loopback proxy pytest、生产构建和 `git diff --check`。浏览器回归覆盖：1024/1280/1440/1920px 首页与工作区无横向滚动或底部空洞；375/768/1023px 只显示设备提示且不挂载工作台；两个返回入口、历史恢复、流程门、JD 草稿/证据矩阵、面试设备检查/回答/追问恢复和 Professional 100/100、18/18 质量门均通过。拖拽状态以窗口级文件 `dragover` 的目标归属与真实坐标边界为真值，页面离开、`Escape`、drop、dragend 与 blur 负责收尾；激活重渲染、多次跨子元素、窗口目标、框外移动、真实 PDF 单次提交和监听器卸载由组件事件序列验证。Mac 锁定时 Finder 物理拖拽保留为人工验收项。Gitleaks 对历史、差异、未跟踪源码和提交消息均无发现。该结论仅覆盖固定 fixture、构建与 smoke，不等同生产 OCR 准确率、第三方安全认证或外部 AI 质量。

- 安全健康端点：4 项 Vitest 覆盖自包含 baseline 不发起 worker 探测、可用 isolated/enhanced 仅返回抽象字段、显式配置失效时 fail closed，以及 HTTP 响应为 `no-store` 且通过 Schema。当前本地 Docker 路径可用；Vercel 验证仍延期。
- 契约：30 个 Capability 的 Zod/JSON Schema、权限、超时、取消、非法输出和 fallback 测试。
- 文档：至少 40 份合成/脱敏 PDF；数字文本、扫描 OCR、双栏顺序、旋转、混合页和恶意文件。
- 事实安全：数字、日期、角色、团队成果、`needs_proof` 和 revision 冲突 fixture。
- 导出：三模板内容哈希、字体、搜索文本、阅读顺序、裁切、重叠、缺字和预览下载一致性。
- 面试：60 个知识单元 Schema、领域配额、检索、两次追问上限、转写修正和一致性误报。
- 产品：当前以 Vitest 覆盖领域逻辑，并用应用内 Browser 做 1024/1280/1440/1920px 桌面交互与视觉验收；375/768/1023px 只验证设备提示且工作台不挂载。生产 CI 仍需补 Playwright 的 Chrome/Safari 权限与无障碍回归。
- 安全：提示注入、越权对象键、伪装 PDF、超限、日志脱敏、主动删除和 TTL。

## 11. 关键架构决策

| 决策                       | 结论                                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF 是否统一 OCR           | 否；原生解析优先。隔离 worker 对 scan 整页、mixed 缺失图片区 OCR；TypeScript fallback 对 scan/mixed 整页 OCR并过滤 mixed 覆盖与重复块。        |
| 是否 PDF → LaTeX 往返      | 否；先标准化为 Resume AST，再用受控模板渲染。                                                                                                  |
| 本地是否强依赖基础设施     | 否；未配置 `DOCUMENT_WORKER_URL` 时 TypeScript baseline 完整运行；生产解析/OCR 可切到已接通的 Python worker，PostgreSQL/Redis/MinIO 仍待接入。 |
| Skill 是否可由用户上传执行 | 否；服务器静态白名单、版本锁定、评测后启用。                                                                                                   |
| 预览是否用 HTML 近似       | 否；展示最终 PDF 产物，下载复用同一对象。                                                                                                      |
| 导出失败是否可绕过         | 否；硬性审计是不可降级的安全门。                                                                                                               |
