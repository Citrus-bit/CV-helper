# 发现与决策

## 2026-07-23 本地桌面版增量

- 初始 UI 审计发现首页轴线混用且仍有移动端底部导航；阶段 6 已统一 `max-w-5xl`，移除移动端工作台并在窄于 1024px 时只挂载设备提示。
- `src/lib/client/store.ts` 原 `history` 已重命名为 `undoStack`，设备历史独立落入 IndexedDB，避免两种历史语义混淆。
- AI 只增强写作、评分、JD 和面试能力；PDF/OCR、证据、事实冲突、ATS、PII、防注入、渲染和导出审计继续由确定性实现掌握硬门。
- 对话中暴露的 API Key 不得进入代码、日志、测试、文档或任何请求；Base URL 和模型可以作为非秘密默认示例，本地启用必须使用轮换后的新 Secret。
- 本轮浏览器验收改为 1024/1280/1440/1920 桌面工作台，以及 375/768/1023 仅显示电脑访问提示；不再验证或维护手机工作台。
- 用户已暂停 Vercel 部署，本轮只保留本地 multipart 上传和本地隔离 document worker；Private Blob、Hosted API、签名下载和 Vercel 配置均推迟。
- Docker 的 internal backend 不直接发布 worker 到宿主；本地版用只读、非 root、低资源的 loopback TCP proxy 暴露 `127.0.0.1:8001`，worker 本身仍无外网出口。数字 PDF 已走 native，扫描 PDF 已走本地 Tesseract OCR。
- 全仓敏感串扫描未发现用户暴露的旧 Key；`.env.example` 不声明或保存 API Key。
- Provider Base URL 使用代码内静态批准列表，禁止通过 `AI_API_ALLOWLIST` 等环境变量扩张网络权限。
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
- 当前 30 项 baseline 的 `networkPolicy` 都为 `none`；provider gateway 只为九项静态生成式能力注册受控 extension，默认 `AI_PROVIDER=baseline` 时不会发生服务端模型外发。`trusted_local` 仅供 canonical Schema、禁网且有 baseline 的受控评测使用。
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
- 最新桌面浏览器回归覆盖 1024、1280、1440、1920px：首页和工作区均无横向滚动。375、768、1023px 只显示电脑访问提示且未挂载工作台。
- 示例中顶栏返回按钮与侧栏品牌均可在保存当前分析后回首页；历史恢复、当前会话删除、单条删除、清空取消和清空确认均实测通过，控制台无应用 error/warn。
- Browser 验收最初误用不存在的 `tab.logs`，改用 `tab.dev.logs` 后成功完成控制台复核。
- 本地 `127.0.0.1:8001/health` 返回 `typst_available=true`、`ocr_provider=tesseract`、`ocr_available=true`；`127.0.0.1:3001/api/capabilities` 在未配置新 Key 时全部为 baseline。`3000` 仍是旧 Docker Web 镜像，需最终重建。
- 局部遮挡修复后的浏览器终验：Professional、Minimal、Compact 均为 2 页、导出质量 100/100、第一页像素渲染验证通过；Compact 画布为 596x842，1280px 桌面无横向滚动。确认前下载禁用，确认后启用，服务日志确认 `/api/export/download` 返回 200。
- 最终 Alpine Web 镜像 `sha256:00b57e52ade74b682f8ca7b9dfca3e39fc1c86e028a42aaab2afa2839224c26d` 零 warning 构建；runtime 显式监听 `0.0.0.0`，宿主首页与内部 worker health 均返回 200。正常 render/download 为 200 且 SHA 一致，末尾 10% 遮挡和中段窄数字遮挡均在容器内返回 409 并命中 `text-visibility`。
- 最终 worker 镜像为 `sha256:0f2f0b84e13889dcbed8a2fc5e7adaa1758ca3dffe272e67d3a39aa0b23ca54d`；数字 PDF 仅走 native，扫描 PDF 使用本地 Tesseract OCR，区域、并发和超时预算均通过容器回归。
- 最终只读代码与交付复核未发现 P0、P1 或 P2 缺陷；剩余风险仅限后续接入外部模型或 Skill 时必须重新执行的权限、安全和质量评测。

---

_每执行2次查看/浏览器/搜索操作后更新此文件_
