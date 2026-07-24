# 发现与决策

## 2026-07-23 阶段 10 初始终验状态

- 阶段 9 的 259 项 Web 测试、34 项 worker 测试、生产构建和浏览器回归是历史证据，不自动证明当前完整作品仍无漏项。
- 当前 Git 工作区同时包含已暂存、未暂存和未跟踪文件；最终必须分别核对 HEAD、index 与工作树，确保根 README、新测试和新实现全部属于交付集合。
- 旧 Git 历史包含个人邮箱及已删除的合成 PDF/Python 字节码；当前树已忽略并删除生成物，但是否重写已推送历史属于需要用户明确授权的破坏性操作，不能擅自执行。
- Finder 物理拖拽曾因 Mac 锁屏无法自动操作；组件状态机已有原生式事件覆盖，但最终仍需尝试获得更强的当前运行态证据或明确保留人工验收边界。
- 当前 index 主要包含 ignore 收紧、Docker context 收紧和历史生成物删除；根 `README.md`、代理、岗位变体、领域重分析与多项组件/能力测试仍为未跟踪文件，都是当前功能闭环的一部分。最终交付必须以完整工作树为单位核对，不能把 index 误作成品集合。
- 根目录本来就没有 `docker-compose.yml`；权威 Compose 文件为 `infra/docker-compose.yml`，README 也使用该路径。一次审计命令读错路径不构成产品缺陷，后续只核对权威文件。
- 全仓未发现产品侧 `TODO`、`FIXME`、`NotImplemented`、“敬请期待”或假占位组件；`placeholder` 命中均为表单提示、PII 替换标记或防止 AI 返回占位文案的注释。
- `findings.md` 的阶段 7 历史段仍描述已废弃的拖拽深度计数，`progress.md` 的五问重启表仍停在阶段 7。这些是历史叙述而非运行缺陷，但最终同步时必须明确标注已被阶段 9/10 的几何边界实现取代，并把当前阶段更新为 10。
- 阶段 10 已用 Gitleaks 8.30.1 重新扫描全部 Git 历史、`src`、worker、infra、知识包、模板、正式文档、Codex 文档、README、三份规划记录、环境样例、package 与 lockfile，全部为零发现。对话中公开过的旧 Key 仍必须在供应商侧撤销，不能因仓库扫描干净而复用。
- 当前 `docker-compose -f infra/docker-compose.yml` 默认解析为 `worker`、`worker-loopback`、`web`，`future-infra` 才加入 PostgreSQL/Redis/MinIO。三个默认容器均在线，worker/loopback healthy；Web 健康为 document `isolated/ready`、AI `baseline/ready`、storage `client_local/ready`。
- 当前 `/api/capabilities` 实际返回 30 个能力，全部 `available: true`、`fallbackAvailable: true` 且为 baseline；这证明 Registry 当前可运行，不把尚未配置轮换后新 Key 的 provider 描述成已启用增强。
- `docs/PRD.md` 页首仍标记“阶段 9 交付审计中”，`.codex/PROJECT.md` 的验收标题也停在阶段 9；阶段 10 收口时必须统一为最终本地桌面 MVP 验收状态，并使用本轮权威测试/镜像数字。
- PRD 将 40 份多版面样本、OCR/阅读顺序召回率、Safari/屏幕阅读器、生产对象所有权与幂等明确列为尚待完成的生产级门槛；这些不属于已暂停云部署的本地 MVP 成功标准，最终交付必须继续清楚区分，不能声称已经通过生产认证。
- `docs/ARCHITECTURE.md` 安全章节写有“生产镜像固定 digest”，但当前 Dockerfile/Compose 使用固定版本 tag，本轮只在构建后记录本地镜像内容 SHA，并未把所有上游镜像引用锁到 registry digest。应改为如实描述当前版本标签与构建后 SHA，并把上游 digest 固定列为生产供应链门槛。
- Knip 首轮确认三个初版生产依赖与 Prettier 未被代码或脚本使用，现已从 package/lockfile 移除。复扫后无 unused dependency；唯一“unused file” `tests/server-only.ts` 实际由 `vitest.config.ts` 的 `server-only` alias 使用，Capability/Schema 的 unused exports 是刻意保留的公共扩展契约，不是未接线 UI 组件。
- UI/UX Skill 的自动设计系统仍误判为移动端营销式 hero/feature/CTA，不适用于仅桌面、高频文档审阅工作台；不采纳底部 tabs、Google Web Font 或营销层级。相关检查继续采用：全局 `:focus-visible`、跳过导航、44px 操作目标、真实 disabled、局部错误恢复、异步反馈、reduced-motion、稳定视口与单一滚动归属。
- 当前全局 CSS 已提供 3px `:focus-visible` 轮廓与 reduced-motion 降级；组件中 `outline-none` 的可交互控件仍会命中该全局规则，导出区显式改用 ring。Lucide 图标均作为装饰隐藏或由按钮 `aria-label`/可见文本命名，未发现结构性 emoji 图标。
- 阶段 10 通过 Computer Use 再次请求 Finder 当前状态，系统明确返回 Mac 已锁定且不能自动解锁；按安全边界不尝试绕过。Finder → 浏览器的物理实拖仍是唯一人工验收项，组件层已覆盖原生式 DataTransfer、几何边界、取消、区外释放和单次提交。

## 2026-07-23 阶段 9 完整作品交付审计

- 阶段 9 重新打开完成性结论；权威证据是当前工作树、运行容器、真实浏览器流程和覆盖具体分支的测试，不是阶段 8 的文档声明。
- 首个待证问题是 Git 交付完整性：当前 index 只包含 ignore/生成物清理，绝大多数功能改动仍未暂存，另有 README、代理、岗位变体、重分析逻辑和多项测试为未跟踪文件。若只提交当前 index，作品必然不完整。

## 2026-07-23 阶段 8 完成性复核

- 阶段 8 不继承阶段 7 的“最终完成”结论；每项用户要求必须由当前代码、实际运行路径、覆盖该分支的测试或浏览器/容器证据证明。
- UI/UX Skill 再次把产品推荐为营销式单列大字页面；该建议与仅桌面、高频简历审阅工作台冲突，继续拒绝紫色营销配色、超大标题和滚动装饰，只采用键盘可达、表单标签、状态反馈、错误恢复、布局稳定和防重复提交规则。
- 完成性审计拆为三条相互独立的只读复核：可见产品闭环、Capability/安全边界、本地仓库与可复现交付；任一路发现反证都必须回到实现阶段，不能以其他测试绿灯覆盖。
- 最终独立复核未发现仍未解决的 P0、P1 或 P2 产品缺陷。阶段 8 的统一基线为 44 个文件 / 239 项 Web 测试、32 项 document-worker pytest、3 项 loopback proxy pytest、生产构建、正式容器健康、四档桌面/三档窄屏浏览器验收和全范围 Gitleaks 扫描全部通过。
- 仓库仍保留两个需用户授权才能改变的历史事实：两个旧提交的元数据包含个人邮箱，初始提交历史可访问已在当前 index 删除的合成 PDF/Python 字节码。它们不含真实简历或密钥；彻底移除必须重写历史并强制推送，因此本轮不执行。

## 2026-07-23 本地桌面版增量

- 初始 UI 审计发现首页轴线混用且仍有移动端底部导航；阶段 6 已统一 `max-w-5xl`，移除移动端工作台并在窄于 1024px 时只挂载设备提示。
- `src/lib/client/store.ts` 原 `history` 已重命名为 `undoStack`，设备历史独立落入 IndexedDB，避免两种历史语义混淆。
- AI 只增强写作、评分、JD 和面试能力；PDF/OCR、证据、事实冲突、ATS、PII、防注入、渲染和导出审计继续由确定性实现掌握硬门。
- 对话中暴露的 API Key 不得进入代码、日志、测试、文档或任何请求；Base URL 和模型可以作为非秘密默认示例，本地启用必须使用轮换后的新 Secret。
- 本轮浏览器验收改为 1024/1280/1440/1920 桌面工作台，以及 375/768/1023 仅显示电脑访问提示；不再验证或维护手机工作台。
- 用户已暂停 Vercel 部署，本轮只保留本地 multipart 上传和本地隔离 document worker；Private Blob、Hosted API、签名下载和 Vercel 配置均推迟。
- 2026-07-23 对当前树及唯一 Git 历史提交执行文件名与内容模式扫描，没有发现常见云厂商/API token、私钥或带值 Secret。已跟踪的 6 个 `output/pdf` 文件为合成简历，使用 `example.com` 和占位电话号码；另有 5 个 `infra/**/__pycache__/*.pyc` 生成物。它们不构成已识别的敏感信息泄漏，但应在后续提交从版本控制移除。
- 独立复核确认旧 API Key 未进入当前树、唯一远端提交、Next 客户端静态包、运行容器日志/环境或 Web 镜像。唯一提交的 Git 作者邮箱为真实个人邮箱，且一个已跟踪 `.pyc` 含本机绝对路径；若仓库未来转公开，应先改为 GitHub noreply 并在备份后重写该单提交。Web Docker 专用 ignore 已改成源码 allowlist，防止未来 `.env`、凭据和用户文件进入 build context。
- Docker 的 internal backend 不直接发布 worker 到宿主；本地版用只读、非 root、低资源的 loopback TCP proxy 暴露 `127.0.0.1:8001`，worker 本身仍无外网出口。数字 PDF 已走 native，扫描 PDF 已走本地 Tesseract OCR。
- 全仓敏感串扫描未发现用户暴露的旧 Key；`.env.example` 不声明或保存 API Key。
- Provider Base URL 使用代码内静态批准列表，禁止通过 `AI_API_ALLOWLIST` 等环境变量扩张网络权限。
- 最新本地 Web 镜像为 `sha256:b0353ce369df9bfbb8efa9711b51d4bae5dc45a0e2e7efd9884f097439419e03`。镜像内置 Typst 0.15.1、Noto CJK 字体和三套 Typst 模板；首页、能力接口、示例接口及健康接口已通过容器 smoke。
- 服务端 PDF.js 改由统一 loader 显式导入 Node fake worker，避免 `outputFileTracingIncludes` 重复复制同一依赖；修复后的本地生产构建完成 7/7 页面并消除 standalone `ENOTDIR` tracing warning。
- 安全 `/api/health` 只返回 document、AI、storage 的 `ready/degraded` 与 mode；4 项路由测试通过，Docker production build 已包含该路由。本地 GET 200，三者依次为 `isolated/ready`、`baseline/ready`、`client_local/ready`。
- 阶段 6 最终验证为：TypeScript、ESLint、33 个文件 / 179 项 Web 测试、32 项 document-worker pytest、3 项 loopback proxy pytest 与 `git diff --check` 全部通过。
- 桌面浏览器在 1024×768、1280×720、1440×900、1920×1080 均无横向滚动，首页三段保持同一 `max-w-5xl` 轴线；375×812、768×900、1023×768 仅显示电脑浏览器提示且不渲染首页或工作台。
- Compose 默认只需 Web、worker 与 loopback；PostgreSQL、Redis、MinIO 进入 `future-infra` profile，不再阻塞当前本地版启动。
- Loopback proxy 使用 5 秒上游连接超时、240 秒整体空闲超时和默认 32 连接上限；空闲值覆盖 Web 对文档 worker 的 180 秒请求预算，同时防止无期限占用本地端口。

## 需求

- 面向中国用户的中英文简历分析 Web 应用。
- 上传 PDF 后立即分析；Web baseline 对数字页原生解析、scan 页整页 OCR、mixed 页整页 OCR 后过滤原生覆盖区域和重复块。
- 分块建议必须受证据约束，支持接受、拒绝、手改、补事实和撤销。
- 支持一个 JD 的证据覆盖矩阵和岗位定制版本。
- 三套真实 PDF 模板预览，最终导出需通过质量审计并由用户确认。
- 语音回答、文字转写、逐题反馈、面试故事卡和简历口径一致性检查。
- 所有专业能力都有可替换 Skill/Capability 接口，并有内置可运行基线。

## 研究发现

- JobOK 是 MIT 许可的 Agent Skill，不是 Web 产品；值得吸收证据链、`needs_proof`、JD 映射、故事库和复盘思路，不复用其简单 PDF/关键词实现。
- 通用 PDF 转 LaTeX 无法稳定保真；应使用 SourceBlocks + Resume AST，并通过受控模板重排。
- UI 应采用克制的 Apple 风工作台：系统字体、中性背景、白色表面、单一蓝色主操作、语义化绿/琥珀/红，避免营销式超大字、渐变和装饰光球。
- 产品只维护桌面侧栏 + 文档/建议双区；窄屏直接显示电脑访问提示，不再设计单列工作台或底部导航。
- 本机 Node 24、pnpm 10、Python 3.14、Docker CLI、`docker-compose` 与 Colima 可用；Typst 0.15.1 已下载到项目本地并可识别中文系统字体。当前需使用 `docker-compose`，不是 `docker compose` 子命令。
- UI 检索返回了不适合工作台的“夸张大字”样式；实际实现只采纳无障碍、状态反馈、响应式和中性专业配色建议。

## 技术决策

| 决策                                    | 理由                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| Next.js App Router + React + TypeScript | 同时覆盖 UI、API 和本地可运行体验                      |
| Zod 作为运行时契约真源                  | Capability 输入输出、知识包和 API 可统一校验           |
| `sessionStorage`/请求内处理 baseline    | 无 Docker 也能运行；生产适配 PostgreSQL/Redis/对象存储 |
| `pdfjs-dist` 做数字 PDF 文本提取        | 在 Next.js Node runtime 原生读取文字层与坐标           |
| 项目内 Typst 生成三套 PDF               | 使用受控模板生成可搜索的真实 PDF；编译失败阻断产物     |
| 浏览器 Web Speech + 文字 fallback       | 无 ASR 密钥仍能演示完整面试流程，应用不创建音频 Blob   |

## 实现审计发现

- 2026-07-23 阶段 7 逐项矩阵发现五项 P1：`/api/job-match` 的岗位 variant 直接复用输入 AST；面试 evaluate 客户端/API 丢弃题目 skills/followUps/scoringAnchors；UI 不消费 follow-up；客户端接受修改后只做固定分数微调且不使其他旧 revision 建议失效；`parsingWarnings` 没有任何 UI 消费。
- 另有交付/证据缺口：根目录无 README；Capability 注册测试证明 30 项存在但没有每项独立可执行质量 eval；AI 限流读取匿名 cookie 却没有签发路径；ATS audit 结果只记录版本不展示；分析进度为定时模拟而不是真实阶段事件。

## 阶段 7 已落地结论

- 导出区大空洞根因已经由真实 DOM 证明为 Radix 未激活 `tabpanel` 的 `display:flex` 覆盖 `hidden`；改为基础 `hidden`、仅 active `flex` 后，排版内容在 1024/1200/1440/1920 桌面宽度均紧接标签栏显示。
- `layout.recommend` 的 `reasons` 现在显示在模板选项前；查询失败会提示并允许重试，质量检查中的长哈希/诊断文本强制换行，不再让右栏横向溢出。
- 原文定位不再固定使用 `sourceBlockIds[0]`，会按建议原句对候选 SourceBlock 做规范化文本匹配并自动进入正确页。
- 岗位版只允许重排已有 section/entry，Schema 要求变体声明真实 change；无差异时明确不生成。岗位版使用自身 ID/revision/AST 进入原有 Typst、像素检查、质量报告、确认和下载链。
- 面试 route 不再重建空 metadata；skills、roleFamilies、followUps、scoringAnchors 和题库来源均保留，受 PII/提示注入保护后再参与评分。追问硬上限为每道主问题两轮。
- 限流 Cookie 由 Next proxy 服务端签发，随机、`HttpOnly`、`SameSite=Lax`、24 小时；IP 桶仍独立存在。Cookie 不含简历、JD、回答或用户身份。
- revision 变更后不再保留可误用的旧建议：客户端验证 revision 与 `beforeHash`，将旧 pending 标记 stale，并从新 AST 确定性重建 Claim、Evidence、Score、Suggestion 与 Story；完整快照撤销可恢复变更前领域状态。
- 导出面板现在使用三段式模板选择器、显式生成按钮、折叠式质量明细和固定的确认/下载操作区。模板状态绑定当前简历目标 ID/revision/SHA；切换通用版或岗位版不会把另一版本旧产物标成已生成。
- 1024×768 的模板组实测宽 319px，三个标签均无溢出；1024×768、1200×900、1440×900 的根文档均满足 `scrollWidth === clientWidth`。真实 Professional PDF 为 100/100、18/18 项通过，确认前后下载状态正确切换。
- 隔离 document worker 的 fallback 只应覆盖网络不可用、超时、解析失败和非法结构；上传摘要不一致属于完整性失败、413 属于资源硬门、用户取消属于显式终止，这三类必须失败关闭，不能由 Web baseline 绕过。
- IndexedDB 的 24 小时 TTL 在应用运行时通过定时/focus/visibility/read 清理；浏览器完全关闭时无法后台物理删除，因此用户文案和正式文档必须表述为“到期，并在下次打开时清理”，不能承诺关闭状态下恰好 24 小时删除。
- Vercel、Blob、云端 worker 和生产 p95/40 份 PDF 基准继续按用户指示延期，不计入本地 MVP 缺口；但文档不得把未验证的生产 NFR 写成已经达成。

- Capability catalog 登记的 30 个能力现均有可运行 baseline，并通过 availability、Schema、权限、fallback 和 smoke test。
- `/api/analyze` 始终原生解析优先：配置 `DOCUMENT_WORKER_URL` 的生产容器使用 Python worker，`digital` 不调用 OCR、`scan` 整页 OCR、`mixed` 仅识别无原生字符覆盖的图片区域；无 Docker baseline 才使用 PDF.js + Tesseract.js 整页补充，并对 mixed 页按 bbox 覆盖率、邻近文本和模糊相似度过滤重复块。
- 原版与新版均可使用真实 PDF iframe，并支持并排比较；来源高亮保留为独立“原文定位”辅助模式。
- `applySuggestion` 已消费白名单 JSON Pointer patch，保留手改与撤销；危险段、越界路径或 Schema 非法结果保持 AST 不变。
- 导出确认已绑定 resume ID、revision、模板和 PDF SHA-256；模板切换、内容修改、重新编译或旧异步返回都会使确认失效。
- 分块建议现已按 JSON Pointer 精确修改 Resume AST；`__proto__` 等危险段、越界路径或 Schema 非法结果会保持原 AST，不会退回全文替换。
- Tesseract 中英文模型已固定到项目本地并校验 SHA-256，运行时禁用语言缓存和 CDN fallback；Typst 子进程只继承 PATH/LANG/确定性时间及显式字体路径。
- 导出链现完整透传 SHA-256、内容覆盖和 hard gate；下载端点重跑 `export.audit`，客户端再复算响应字节哈希。
- 自动导出审计同时读取文字层、文本 bbox 和服务器逐页栅格画面，覆盖内容完整性、搜索性、非白/强对比像素、预期文字区域可见度、文本越界/重叠/边距/最小高度、替代字符、字体嵌入信号、ATS 顺序和 SHA；它可以阻断纯白与白字白底，但不是完整视觉或审美审计，真实 PDF 并排人工预览仍是最终门槛。当前没有自动密度重试。
- 新版 PDF 的“已预览”不再依赖 iframe `onLoad`：客户端 PDF.js 必须完成第一页 canvas 绘制，并对完整画布检查非白像素、强对比像素和亮度变化，失败时阻断确认/下载并提供重试。这是可见内容门槛，不是完整视觉版面审计。
- `toRenderableResume` 会同时保留 `section.text` 与 `entries`；审计始终比较完整 AST fragments，并有回归样本。
- 当前 30 项 baseline 的 `networkPolicy` 都为 `none`；provider gateway 只为七项静态生成式能力注册受控 extension，两项 copy rewrite 保持 baseline，默认 `AI_PROVIDER=baseline` 时不会发生服务端模型外发。`trusted_local` 仅供 canonical Schema、禁网且有 baseline 的受控评测使用。
- PII/guard 已对简历、JD、问题和回答执行最小字段投影；已接线的 provider 只能接收结构化、脱敏、guard 后 DTO，并在超时、限流、非法输出或事实检查失败时回退 baseline。
- 敏感状态已从 localStorage 改为 sessionStorage，并增加定时、focus、visibility 与 rehydrate 过期检查；旧版持久键在工作台挂载时删除。Web Speech 不保存音频 Blob，失败、超时和离开页面会停止。

## 遇到的问题

| 问题                                                              | 解决方案                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 计划要求 Typst/Python/Docker，初始环境缺少 Typst/Docker           | 已下载 Typst 和文档工具，并通过 Homebrew 安装 Docker CLI、`docker-compose`、Colima/Lima；Colima 已启动 |
| 外部 AI 服务未配置                                                | 使用确定性规则和模板化生成 baseline，Capability 可后续替换                                             |
| `latest` 安装到 TypeScript 7/ESLint 10，超出 Next 插件 peer range | 锁定 TypeScript 5.9 与 ESLint 9                                                                        |

## 资源

- JobOK 参考提交：`c5da0c6a6c9936b640a202c78cdd6e64b2981ba6`（MIT）。
- UI/UX Skill 强调 WCAG、44px 触控、移动响应式、稳定布局和 150–300ms 状态动效。
- Typst CLI：项目本地 `.tools/typst/typst`，版本 0.15.1。
- OCR 模型：`.tools/tesseract/{chi_sim,eng}.traineddata.gz`，bootstrap 会按固定 SHA-256 下载；二者分别约 1.6 MB/2.8 MB。

## 视觉/浏览器发现

- 2026-07-23 对当前源码重新量测四档桌面视口：1024×768、1280×720、1440×900、1920×1080 均满足 document `scrollHeight === clientHeight`、`scrollWidth === clientWidth`；`#workspace-content`、简历绝对铺满网格、右栏、激活 tabpanel 与导出 section 的底边都等于视口高度。当前高度链由 `h-dvh` 根容器、flex 剩余区和 `absolute inset-0` 明确定义，不依赖不确定的百分比高度。
- 当前导出面板只有主体区域 `overflow-auto`；质量检查列表已移除独立滚动，因此没有主体与明细双层滚动。1024×768 的可滚动正文为 180px、1280×720 为 132px，固定确认/下载区始终完整位于视口内。
- 2026-07-23 用户反馈文件始终位于上传框内时，“松开即可开始分析”会闪回默认提示。根因是浏览器在拖拽指针跨越投放区子元素时也会触发冒泡的 `dragleave`/`dragenter`；单次 `dragleave` 不能代表离开整个投放区。当前实现采用文件拖动类型过滤、进入深度计数、下一动画帧延迟复核和 drop 统一复位，保证框内移动期间状态稳定，真正离开后及时恢复。
- 最新源码已在 `http://localhost:3001/` 的真实桌面页面加载，上传区默认文案与结构正确。Browser 的隔离执行接口不提供可构造的 `DataTransfer`/DOM `Event`，无法可靠伪造操作系统文件拖动；因此拖动时序由 jsdom 组件测试覆盖，浏览器回归限定为页面渲染、尺寸、默认/完成状态和截图，不把自动化表面的限制视为产品失败。
- 用户截图确认工作台存在页面级纵向滚动：三栏内容在页面滚动后整体离开视口，固定侧栏和 sticky 顶栏仍保留，导致视口下半部显示大块空白。根因是 `Workspace` 仅使用 `min-h-dvh`，主列未形成 `h-dvh` 的 flex 高度约束；`ResumeWorkspace` 又以独立 `calc(100dvh - 64px)`/`min-height` 控制子栏。修复方向是锁定工作台根级页面滚动，让顶栏下的模块容器占满剩余高度，并把滚动归属到模块/栏内部。
- 第二张截图显示 `排版预览` 激活后，评分和标签栏下方到“排版预览与导出”标题之间出现大段空白。`TemplateExport` 源码本身没有用于制造该间距的 margin/justify 规则，说明空洞来自父级页面/网格高度和滚动坐标错位，而不是模板卡内容；仍需在修复根级高度后用真实 DOM bounding boxes 复核。同时会把导出面板保持为顶部连续信息流、内部滚动和底部下载操作，不允许正文被推离标签栏。
- 修复前 1440×900 DOM 量测显示未激活 `tabpanel` 虽有 `hidden` 属性，计算样式仍为 `display:flex` 并实际占用 290px；激活的排版面板因此从 y=610 才开始。改为基础 `hidden` + `data-[state=active]:flex` 后，浏览器可访问树只保留一个激活 `tabpanel`，排版标题、推荐、三模板和生成入口连续出现在标签栏之后，证明空洞根因已消除。
- 当前源码在 1440×900、1920×1080 和 1024×768 实拍均未再出现页面下方空洞。生成 Professional PDF 后，右栏按模板卡、100/100 质量清单、确认框和固定下载区连续排布；长质检清单在右栏内部滚动，不带动整个工作台离开视口。
- 1024×768 的“并排对照”因文档区可用宽度有限会按现有 `auto-fit` 变成上下排列；1280px 以上可并列。这是可读性取舍，但与按钮文案“并排”存在轻微语义偏差，纳入最终需求矩阵判断是否需要改名或强制双列。
- 2026-07-23 最终交付审计再次运行 UI/UX 设计系统、UX 与 Next.js 检索。自动设计系统仍误判为单列营销页/夸张极简，不采纳其超大标题、滚动揭示或单 CTA 结构；继续以桌面生产力工作台为准。
- 本轮采纳的核查项限定为：顺序标题层级、完整键盘操作、跳过导航、固定栏不遮挡内容、异步操作超过 300ms 有状态反馈、按钮防重复提交、动态区域预留尺寸、可见焦点和桌面四档零横向滚动。
- Next.js 检索的路由级 `loading.tsx` 对当前单页客户端工作台不是直接要求；本轮改为验证上传、分析、保存、渲染和下载各自已有明确的局部加载状态，避免引入无意义的页面级骨架。

- UI/UX Skill 的自动设计系统再次偏向 Newsletter/Exaggerated Minimalism；这不适合高频文档审阅工作台，因此明确拒绝营销结构、超大标题和滚动装饰动效。
- 2026-07-22 复核设计系统时，即使使用低视觉差异、低动效和中高密度参数，自动推荐仍返回 Newsletter/超大字极简；继续以产品工作台需求覆盖该推荐，仅保留其专业中性色、高对比、单一主操作和轻量状态动效。
- UX 审计重点固定为：键盘可达与可见焦点、跳过导航、统一 z-index、异步操作防重复提交、超过 300ms 的加载反馈、动态内容预留尺寸，以及桌面工作台零横向滚动。
- 采纳其可验证规则：中性高对比表面、单一主操作、可见焦点、44px 触控目标、8px 相邻间距、超过 300ms 的加载反馈、150–300ms 状态过渡和 `prefers-reduced-motion`；窄屏只验设备提示。
- 2026-07-22 最终 UI 检索仍把工具误判为 Newsletter/Exaggerated Minimalism；明确拒绝超大字号、滚动揭示与营销 CTA，只采用专业中性色、高对比、单一主操作、44px 触控目标、8px 操作间距、异步加载反馈及四档响应式检查。
- Next.js 专项建议与当前工作台相关的重点是稳定响应式容器和资源加载；Server Actions、OG 图等营销/通用建议不属于本轮核心验收范围。
- 1440x1000 实拍首屏：`scrollWidth === clientWidth`，无横向溢出；品牌、隐私提示、原生解析说明和唯一主上传动作层级清楚。高屏幕下下半部留白较多，列为低优先级密度问题，不妨碍首要流程。
- 三套 Typst 稀疏样例均为 1 页 A4、Tagged PDF、无加密；Poppler 可完整提取中文和 ATS 顺序，PingFang SC 的 Light/Regular/Medium/Semibold 均已子集嵌入。
- 120 DPI PNG 目检：Professional 层级最均衡，Minimal 留白更宽，Compact 信息密度最高；三者均无裁切、重叠、缺字、黑块或页脚碰撞。
- 稠密 worker 审计样例结果为 Professional 2 页、Minimal 2 页、Compact 1 页；三套均可搜索、字体嵌入、A4，未发现文本裁切/重叠/缺字。该结果不替代最终用户流程中的真实 PDF 并排确认。
- 2026-07-23 通过浏览器文件选择器上传 `sample-professional.pdf` 后，应用生成 1 页分析结果和 90/100 质量分；原始 PDF 在桌面端真实 iframe 预览中正常绘制，工作台、评分区和预览器无重叠或横向溢出。
- 同一上传请求已由本地 Python 文档 worker 接收，API 报告 `document.parse@1.0.0+isolated-worker`；数字 PDF 走原生文字和坐标解析，未触发 Web OCR fallback。
- 浏览器生成 Minimal 真实 PDF 后自动进入并排对照，第一页 PDF.js canvas 非空像素验证通过，导出质量为 100/100，15 项质量检查全绿；用户勾选确认前下载按钮保持禁用。
- 浏览器流程中 Professional、Minimal、Compact 三个模板均成功生成 1 页真实 PDF，质量报告均为 100/100 且 SHA-256 各不相同；从已确认模板切换到另一模板会立即清空确认并重新禁用下载，未发现跨模板误下载风险。
- 用户确认 Minimal 后 `/api/export/download` 返回 200；自动化环境未暴露客户端 Blob 的 download event，但服务端下载复审与响应链已实际执行成功。
- 岗位匹配浏览器流程可把一份 JD 拆成责任、技能、硬性和加分要求，分别标记已覆盖/部分覆盖/缺口并展示证据与下一步；示例覆盖率为 53%，界面明确说明它不是录取概率，定制分支绑定简历版本 1。
- 从岗位结果进入模拟面试后，系统基于最终简历、JD 与证据薄弱点生成 6 道主问题，设备检查入口和逐题教练模式正常展示。
- 文字回答可提交并生成 66/100 的结构化反馈，能识别具体例子和简历外数值；下一题会从 1/6 正确进入 2/6，清空回答和反馈并恢复禁用提交状态。
- 浏览器 QA 发现同一数值口径冲突被重复显示三次，已列为必须修复项并补回归测试；不同冲突仍需分别保留。
- 阶段 6 已废弃旧单列/底部导航响应式路径；375、768、1023px 只显示电脑访问提示，Upload、AnalysisProgress、Workspace 和录音界面均不挂载。
- 2026-07-23 重建后的 worker 镜像 health 返回 `ocr_provider=tesseract`、`ocr_available=true`、Typst 可用；镜像包含 `chi_sim`、`eng`、`osd` 三个 Tesseract 语言包，根文件系统只读、capabilities 全部丢弃，资源上限为 1.5 GiB/1.5 CPU。
- 用原简历第一页栅格化生成无文字层 A4 PDF 后，容器生产解析将其判为 `scan`，Tesseract 提取 13 个中英文块且无 warning；数字 PDF 仍由原生路径处理。
- 面试一致性去重修复已通过浏览器回归：同一组简历外数字只显示一条口径提示。
- 发布复审发现的导出资源与视觉绕过问题已修复：审计现限制页数、条目、字符、operator、像素、比较次数和总 deadline，并支持取消；full/no-text/text-mask 三路渲染差分、字形墨迹带与重叠滑窗可阻断白字叠装饰、纯白、句尾遮挡和窄数字遮挡，相关样例均返回 409。
- Next standalone 复制 traced `pdfjs-dist` 时出现的 `ENOTDIR` warning 已修复：去除重复 tracing include 后，本机生产构建和最终 Alpine Web 镜像均零 tracing warning，相关路由、原生模块及容器 smoke 通过。
- 2026-07-23 最新修复后的桌面首屏在 in-app Browser 1280x720 实测 `scrollWidth === clientWidth`，两个主操作按钮均为 44px 高；品牌、上传、隐私和事实安全提示层级清楚，无文字重叠或裁切。
- 最新服务重启后再次通过真实文件选择器上传 `sample-professional.pdf`：应用显示版本 1、1 页和 90/100 质量分，原版 PDF iframe 正常加载；该稀疏样例没有待审阅建议，因此用于模板/导出回归，证据交互改用内置案例验证。
- 内置案例接受/撤销浏览器回归通过：接受后版本 1→2、质量分 88→89、建议状态变为已应用；撤销后版本、分数、待处理建议和操作按钮均恢复到修改前状态。
- `dense-professional.pdf`（2 页）浏览器回归确认 11 条建议中的 `needs_proof` 不能直接接受；补充“延期率 18%→6%，可由复盘记录核对”后仅转为用户确认的待接受 rewrite。接受后版本 1→2；第一次撤销恢复已补证待接受状态，第二次撤销恢复原始 `needs_proof` 且撤销栈清空。
- JD 浏览器回归把 6 条要求拆为 responsibility/skill/must-have/nice-to-have 并显示证据、缺口和下一步；覆盖率明确标注“不是录取概率”，岗位定制分支绑定版本 2。
- 面试新会话回归通过：首个计划在提交回答并进入第 2/6 题后更新 JD，重新进入面试会回到设备检查并从第 1/6 题开始，转写与反馈均为空，旧问题/评审状态未串入新计划。
- 最新桌面浏览器回归覆盖 1024×768、1280×720、1440×900、1920×1080：首页和工作台均无横向滚动，首页头部、上传区和历史区处于同一 `max-w-5xl` 轴线。375×812、768×900、1023×768 只显示电脑浏览器提示，首页和工作台均不渲染。
- 体验示例、顶栏返回、历史恢复与侧栏品牌返回均通过；返回首页会保存当前分析，不复用删除动作。
- 本地 `127.0.0.1:8001/health` 返回 `typst_available=true`、`ocr_provider=tesseract`、`ocr_available=true`；`127.0.0.1:3000/api/capabilities` 在未配置轮换后新 Key 时全部为 baseline，当前 `3000` 已运行最新本地 Web 镜像。
- 局部遮挡修复后的浏览器终验：Professional、Minimal、Compact 均为 2 页、导出质量 100/100、第一页像素渲染验证通过；Compact 画布为 596x842，1280px 桌面无横向滚动。确认前下载禁用，确认后启用，服务日志确认 `/api/export/download` 返回 200。
- 阶段 6 前的 Alpine Web 基线镜像 `sha256:00b57e52ade74b682f8ca7b9dfca3e39fc1c86e028a42aaab2afa2839224c26d` 曾完成零 warning 构建；runtime 显式监听 `0.0.0.0`，宿主首页与内部 worker health 均返回 200。正常 render/download 为 200 且 SHA 一致，末尾 10% 遮挡和中段窄数字遮挡均在容器内返回 409 并命中 `text-visibility`。
- 最终 worker 镜像为 `sha256:0f2f0b84e13889dcbed8a2fc5e7adaa1758ca3dffe272e67d3a39aa0b23ca54d`；数字 PDF 仅走 native，扫描 PDF 使用本地 Tesseract OCR，区域、并发和超时预算均通过容器回归。
- 上传区的拖放提示现以文件拖动深度和下一帧离开复核驱动；跨子元素不会闪回，取消、失焦、drop 与框外投放均有明确收尾。同一轮状态审计还消除了历史首次加载空态闪烁、JD 请求与新输入错配、隐藏页签占位/草稿丢失和导出异步期间模板错配。
- 阶段 7 最终验证为 42 个文件 / 220 项 Web 测试、32 项 document-worker pytest、3 项 loopback proxy pytest；TypeScript、ESLint、生产构建和 `git diff --check` 均通过。
- 最终只读代码与交付复核未发现 P0、P1 或 P2 缺陷；剩余风险仅限后续接入外部模型或 Skill 时必须重新执行的权限、安全和质量评测。

---

_每执行2次查看/浏览器/搜索操作后更新此文件_

## 2026-07-23 阶段 9 补充发现：上传拖拽状态

- 用户实测仍可在文件未离开上传框时看到“松开即可开始分析”闪回默认提示。现有深度计数依赖冒泡的 `dragenter`/`dragleave` 成对出现，但激活状态会替换图标、文案并动态给内容增加 `pointer-events-none`，这些 DOM/命中目标变化本身可能产生不对称离开序列，因此计数并非上传框内外状态的可靠来源。
- 现有组件测试只模拟了手工配对的子节点进出，未覆盖激活重渲染后光标下目标变化、窗口级连续 `dragover` 与几何边界判定。修复应以投放区实际范围为唯一真值，并补充状态目标变化、框外移动、取消和 drop 的回归样本。
- UI/UX Skill 本轮仅采纳与桌面生产力工具直接相关的规则：拖拽过程实时且稳定反馈、错误带恢复路径、动态状态通过 `aria-live` 宣告、状态变化不引发布局抖动；其单列营销页推荐不适用于当前工作台。

## 2026-07-23 阶段 9 需求与运行时对照审计

- Capability Registry 的 30 个能力 ID 均有可运行 baseline；未发现只登记但无法降级的核心能力。
- P1：面试追问轮次、追问题目和追问评审只存在于组件 local state，切换模块、返回首页或历史恢复会丢失；历史快照目前只保存主问题评审。必须把完整面试进行态纳入会话与历史 Schema。
- P1：`undoStack` 的运行时快照包含完整 `AnalysisBundle`，持久化投影可能把原 PDF base64 和页面预览写入 `sessionStorage`，违反体积与隐私边界；必须对持久化撤销快照脱水，同时保持当前标签页内撤销语义。
- P1：用户选择“不归档，返回首页”后，首页挂载的历史刷新会再次自动归档当前分析，导致选择失效；需要显式的本次跳过状态或等价状态机。
- P2：面试入口文案称“进入设备检查”，实际直接进入题目；JD 承诺的职位名、职级、地点和求职语言尚无输入与 API 契约；JD 编辑后旧匹配结果仍可见，草稿在卸载后丢失。
- P2：Python worker 已提取字符字体名/字号，但 Web worker response Schema 丢弃该信息，尚未进入 SourceBlock/Resume AST；应以有界块级样式摘要传递，并保持 OCR 兼容。
- P1/P2：岗位、面试和排版入口尚未对未处理建议提供流程门或显著提醒，与“全部确认后进入下一阶段”的原始流程不完全一致。
- 工程边界：现有自动审计只能证明裁切、重叠、缺字、字体嵌入、可搜索性、阅读顺序等客观项，并要求用户真实并排确认；不能数学证明主观排版必然优于任意原稿。最终表述不得越过该边界。
- Git/安全：工作区与历史未发现 API Key，ignore 覆盖充分；提交元数据仍含个人邮箱，旧提交仍含合成 PDF/pyc，清理需用户授权历史重写与强推。当前 index 与未暂存/未跟踪实现混合，不能只提交 index。

## 2026-07-23 阶段 9 已完成修复

- 上传拖拽不再依赖 enter/leave 深度；窗口级文件 `dragover` 以事件目标是否属于投放区和坐标是否位于真实边界作双重判定。激活重渲染、子节点 leave、短暂 window target、框外移动、页面离开、`Escape`、drop、blur、dragend、真实 PDF 单次提交、监听器卸载和非文件拖动均有回归样本，上传组件现为 13 项测试。
- 工作台流程门已加入：只要仍有 `pending` 建议，岗位匹配和模拟面试按钮即为真实 `disabled`，并通过 `aria-describedby` 告知待确认数量；所有建议得到决定后自动解锁。
- `undoStack` 写入会话存储前会剥离 `pagePreviews` 与 `originalPdfBase64`，旧 `history/undoStack` 迁移也做同样投影；运行时完整快照和精确撤销不变。对畸形旧快照只存在 PDF 字段的情况也执行剥离。
- “不归档，返回首页”新增按简历 ID 的归档抑制状态；首页刷新不再自动保存当前改动或把旧摘要冒充当前摘要，用户继续工作后仍可明确保存。
- 隔离 PDF worker 现以有界文字块传递 `font_name/font_size/font_weight/font_style`，Web 端经 Zod 映射为 `SourceBlock.style`，`document.segment` 可利用字重辅助标题识别；OCR 路径字段可缺省/null，异常字体元数据降级为无样式正文而不是丢文本。
- 面试入口现为独立设备检查页：进入时不生成题目、不请求麦克风，点击“开始面试”后才创建计划。`InterviewProgress` v1 按简历 ID/revision 与计划指纹约束，持久化主问题索引、两轮追问、追问评审和转写草稿，不保存录音对象、计时器或权限错误。
- 岗位页现显式提供职位名、职级、地点、求职语言和 JD 草稿；草稿进入 Zustand、`sessionStorage` 与 IndexedDB 最近分析。任一字段变化会立即失效旧岗位矩阵、岗位版和面试计划，防止屏幕保留与当前输入不一致的结果。
- 流程门已下沉到 Store：有 `pending` 建议时，不仅界面按钮禁用，直接 `setModule`、会话恢复和历史恢复也都会保守回到简历审阅。
- 最终浏览器回归证明 JD 元信息与正文草稿可跨模块保留并生成证据矩阵；设备检查不提前请求麦克风，主问题回答与第一轮追问可在返回首页及历史恢复后继续；Professional PDF 为 100/100、18/18，确认前下载禁用。
- Computer Use 无法在锁定的 Mac 上执行 Finder 物理拖拽，且未绕过系统锁。该路径仍需解锁后的人工实拖；其余拖拽状态机由组件级原生式事件序列覆盖。

## 2026-07-24 统一 Skill 套件架构

- Codex 开发期 Skill 与产品运行时 Capability 必须继续分离：前者指导开发、审计和评测，后者仍由服务器静态 Registry、Zod 契约、权限声明、fallback 与 feature flag 管理。
- 为避免二三十个零散 Skill，采用单一插件 `resume-assistant-toolkit`，由一个编排 Skill 负责路由到六个领域 Skill：文档智能、证据与简历、岗位与文案、排版与导出、面试与语音、安全与评测。
- 30 项 Capability 的 ID、数据范围和 eval suite 只在共享参考文件维护一份；领域 Skill 只引用所负责的子集，禁止复制并产生不一致版本。
- 插件源码进入当前仓库，使用 `.codex-plugin/plugin.json` 作为唯一入口；本轮不创建个人 marketplace、不自动安装、不声明任何 MCP 或网络权限。
- 总入口只保存路由、依赖顺序和产品不变量；30 项 ID、数据范围、eval suite、provider allowlist 与 fallback 约束集中在 `capability-map.md`，候选运行时扩展统一遵循 `extension-protocol.md`。
- Skill Creator 的校验器需要 PyYAML；仓库现有 document-worker 虚拟环境已提供 6.0.3，可复用完成验证，无需下载或污染全局 Python。
- 领域 Skill 的 Rubric 与扩展类型检查必须叠加，多 Capability adapter 需要通过每个归属领域的更严格门槛；通用 adapter 检查不能替代 PDF、事实安全、导出或面试专项验收。
- 当前 manifest 只有 `networkPolicy`，没有候选级主机字段；因此 exact hosts 必须记录在版本化评审中并由 `provider-gateway.ts` 的静态 allowlist 强制。若未来候选需要不同主机集合，应先版本化增加机器可校验的 manifest allowlist。
- `document.ocr` v1 的输出仍固定 `engine: "tesseract.js"`。PaddleOCR 可作为 `document.parse` 内部 adapter 评测，但若要成为独立 Capability extension，必须先演进 canonical Schema，不能谎报引擎。
- `pii.redact` 当前 detection type 仅覆盖邮箱、电话、证件号、地址和 URL；姓名及上下文残留由 provider projection 外围控制。Registry 文档已拆开记录，避免把外围测试误算为 Capability 能力。
- 导出 `overallScore` 是服务器自动审计分，领域 Rubric 的 100 分是人工评审辅助；`ExportQualityReport.downloadable` 只表示产物通过质量门，真正下载仍需当前预览 SHA 与用户明确确认。
- 官方验证、程序化 30 项映射核对、链接检查、两轮前向试跑和独立只读审查均通过，最终无 blocker 或 medium。
