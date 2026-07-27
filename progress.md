# 进度日志

## 会话：2026-07-27（阶段 13 强制真实 AI 分析）

- **状态：** in_progress
- 已完成真实链路复核：Provider 配置与模型可用，但上传结果出现 AI 评分成功、AI 建议回退 baseline 的部分成功。
- 已确认根因范围包括 Registry 自动 fallback、Provider 建议输出契约不稳定、上传接口缺少原子 AI 门，以及 revision 后本地评分覆盖。
- 本轮按用户批准计划实施：先建立禁止 fallback 的服务端契约和测试，再处理 Provider wire schema、revision 重分析、前端/历史兼容、文档与完整终验。
- 已实现第一版 Registry `forbid` 策略、`AiAnalysisUnavailableError`、严格 AI 调用器、HTTP 错误映射，以及上传/示例的 `requireAi` 原子调用入口；`pnpm typecheck` 通过。
- 第一轮 Web 回归为 55 个文件 / 304 项，其中 299 项通过、5 项失败；失败均为旧 API 成功用例未注入 Provider，实际按新契约返回 `503 AI_ANALYSIS_UNAVAILABLE`。下一步改造测试夹具并补充明确的 strict-AI 失败断言，不放宽生产逻辑。
- Provider 精简 Schema、`editableTargets`、自然语言字段 PII 扫描、服务端 Suggestion 组装及一次纠错重试已完成第一版，TypeScript 继续通过。聚焦测试出现 4 个夹具迁移失败：1 个不完整 Scorecard、3 个仍返回旧完整 Suggestion 的 Provider 成功夹具；均需改为新契约后复测。
- Registry 聚焦测试现为 12/12 通过；Provider 聚焦测试除一项仅因稳定 ID 断言分隔符不符外，其余 28 项通过。新增 `/api/resume-analysis` 原子接口并让兼容建议接口复用同一严格评分+建议流程；移除本地 revision Scorecard 后，类型检查准确暴露 Store 的三处旧读取，已进入状态机改造。
- 上传页一次多区块补丁因事件处理代码的实际顺序与旧上下文不一致被拒绝；未产生部分修改。改为按 import/state、submit、控件、错误区四段精确应用。
- 第一轮全量回归为 55 个文件 / 307 项，225 项通过、82 项失败。多数失败是 Store `setAnalysis()` 对内部测试 fixture 的重复强拦截造成的级联空状态；上传客户端已在调用 Store 前完成来源校验，因此撤掉 Store 重复门，仅保留 API 客户端校验与 IndexedDB 新记录硬门。其他失败按上传 mock、兼容路由 mock、revision 新语义和无 Provider 集成用例分别迁移。

## 会话：2026-07-24（阶段 12 本地持久化的简历 AI 编辑对话）

### 阶段 12：本地持久化的简历 AI 编辑对话

- **状态：** complete
- 用户明确要求简历修改必须支持持续 AI 对话，并由本地管理上下文。
- 已恢复规划文件，完成 UI/UX 设计系统、长任务反馈、无障碍与 Next.js 约束检索。
- 已完成消息/摘要/事实/修改/revision 契约、`resume.chat` 与 `/api/resume-chat`、PII 投影、严格输出校验、7 分钟预算和本地有界上下文持久化。
- 审阅区已接入持续追问、失败重试、0–99% 估算进度、逐条/批量应用和旧 revision 标记；真实 AI 不可用时返回错误，不以固定 baseline 话术冒充回复。
- 正式文档与统一 Skill 套件已更新为 31 项 Capability 和 10 项 provider 白名单；共享 map 31/31、无重复，`resume.chat` 归属证据评审 Skill，两个修改后 Skill 与插件官方校验通过。
- 聚焦回归 5 个文件 / 48 项通过；最终 `pnpm typecheck`、`pnpm lint`、50 个文件 / 279 项 `pnpm test`、`pnpm build` 与 `git diff --check` 全部通过。
- 浏览器使用真实 provider 完成两轮上下文对话；四条消息与建议刷新后恢复，应用建议使 revision 1→2 并标记旧回复，第二次刷新仍保留版本、消息和已应用状态，console 无 error/warn。

## 会话：2026-07-23（阶段 10 最终作品独立终验）

### 阶段 10：最终作品独立终验

- **状态：** in_progress
- 不继承阶段 9 的完成结论；当前以工作树、运行时、文档和 Git 交付面逐项重建证据。
- 已恢复文件规划上下文，当前首要风险是 staged/unstaged/untracked 混合交付以及唯一尚未自动执行的 Finder 物理拖拽路径。
- 五步终验为：需求与文件矩阵、三路独立审计、缺口实现、全量与真实流程回归、可提交作品封装。

## 会话：2026-07-23（阶段 9 完整作品交付审计）

### 阶段 9：完整作品交付审计

- **状态：** complete
- 活跃目标要求最终再排查所有遗漏操作、任务与未实现组件；本阶段将阶段 8 视为历史证据，不直接继承其完成结论。
- 已重新读取文件规划 Skill 与三份持久化计划文件，并建立五步终验：逐项证据矩阵、三路独立审计、缺口修复、全量回归、Git 可提交性。
- 当前权威状态仍是大量 staged、unstaged 与 untracked 文件混合；在证明所有新增文件均进入交付范围前，不能把“测试通过”视为完整提交。
- 最终验证通过 TypeScript、ESLint、44 个文件 / 259 项 Web 测试、34 项 document-worker pytest、3 项 loopback proxy pytest、生产构建、`git diff --check` 与安全扫描。
- 上传区现以窗口级文件 `dragover` 的事件目标和真实边界为真值；页面离开、`Escape`、drop、dragend 与 blur 均会复位，真实 PDF 只提交一次，全部窗口监听器在卸载时移除。上传组件 13 项测试通过。
- 浏览器回归覆盖四档桌面、三档窄屏、两个返回入口、流程门、JD 草稿与证据矩阵、面试设备检查/回答/追问恢复，以及 Professional `100/100`、`18/18` 导出硬门；控制台无 error/warn。
- 最终 Web 镜像 `sha256:a249fcd2684f47769fc09b8dace3481aed2e8b7dc4fed90f3dbf03159192ef4c` 已运行于 `127.0.0.1:3000`。Mac 锁定阻止了 Computer Use 的 Finder 物理拖拽，不绕过系统锁，保留为唯一人工验收项。

## 会话：2026-07-23（阶段 8 最终完成性复核）

### 阶段 8：最终完成性复核

- **状态：** complete
- 用户要求在最终交付前再次排查遗漏操作、任务和未实现组件；本阶段重新打开完成性结论，不把阶段 7 的测试全绿或文档声明直接视为证据。
- 已恢复 `task_plan.md`、`progress.md`、`findings.md`，并建立五步复核：需求证据矩阵、三路独立代码审计、缺口实现、真实核心流程、可提交作品封装。
- UI/UX 审计继续以桌面生产力工作台为准；Skill 自动生成的单列营销页建议不适用于本产品，仅采用可访问性、状态清晰度、布局稳定和错误恢复规则。
- 上传区已改为文件类型过滤、拖动深度计数和下一动画帧离开复核；拖过内部图标、标题、说明或按钮时保持“松开即可开始分析”，drop、取消、窗口失焦、组件卸载和框外投放均统一收尾。
- 分析页已删除定时虚假推进，改为诚实的不确定等待状态；它只说明将处理的内容，不宣称后端已上报逐阶段完成事件，并保留取消、状态播报和 reduced-motion。
- 最新源码在 1024×768、1280×720、1440×900、1920×1080 的 DOM 量测中，工作区主容器、简历根网格、右栏和导出面板均精确贴合视口底部，页面无纵向/横向溢出；导出面板只保留单一主体滚动区。
- 最终全量验证通过 TypeScript、ESLint、44 个文件 / 239 项 Web 测试、32 项 document-worker pytest、3 项 loopback proxy pytest、生产构建与 `git diff --check`。Gitleaks 对全部历史、当前差异、未跟踪源码和提交消息均无发现。
- 正式 `127.0.0.1:3000` 容器版已重建；体验示例、顶栏返回、品牌返回、历史恢复、四档桌面、三档窄屏、真实 Professional PDF `100/100` 与 `18/18` 质量检查、确认前下载阻断和无浏览器错误均通过。worker health 确认 Typst/Tesseract 可用，镜像内无 Python 字节码。

## 会话：2026-07-23（阶段 7 最终交付审计）

### 阶段 7：最终交付审计与完整作品封装

- **状态：** complete
- 已恢复并复核 `task_plan.md`、`progress.md`、`findings.md`，不沿用“已有测试全绿即完成”的假设。
- 已建立五步终验：需求证据矩阵、缺口实现、核心全流程、视觉/无障碍/安全回归、可提交作品封装。
- 已运行 UI/UX 设计系统、UX 与 Next.js 专项检索；拒绝不适合工作台的营销结构，仅采用可验证的无障碍、异步反馈与稳定布局规则。
- 收到用户高视口截图，确认简历工作台可发生页面级滚动并在内容区域下方留下大块空白；已定位到根工作区未锁定视口高度和子栏各自计算高度的冲突，列为阶段 7 首个必须修复项。
- 收到第二张右栏截图，确认排版预览内容在父级高度/滚动错位时被推到面板底部；源码没有主动大间距，先修父级视口模型，再对导出面板顺序、滚动和底部操作逐项量测。
- 已修改工作台为视口锁定的 flex shell、模块内滚动，并让 Radix 未激活页签使用 `hidden`/激活态 `flex`，同时移除文档预览滚动区的强制最小高度。TypeScript 与 ESLint 通过；首次页签单测因 jsdom 低层 click 未触发 Radix 状态切换，改用 `userEvent` 重试。
- 两项布局回归测试现为 3/3 通过。修复前真实 DOM 证明 inactive/active 两个 tabpanel 各占 290px；修复后可访问树只包含激活排版面板，模板标题、推荐、三选项和生成入口连续出现。
- 当前源码的 1440×900、1920×1080、1024×768 视觉回归通过；实际生成 Professional PDF 后导出质量为 100/100，长清单在右栏内部滚动，页面下方不再留白。
- 已收到 PRD/架构/代码/测试逐项矩阵：确认岗位定制假分支、面试元数据/追问丢失、revision 后领域数据未重算、解析 warning 不可见为 P1；README、匿名限流标识和逐 Capability eval 为交付证据缺口。阶段 7 不再把旧的 complete 标记视为最终结论。
- 已在 `127.0.0.1:3000` 重建并复核用户截图对应修复：排版预览标题、推荐理由、三模板、生成入口和底部下载区连续出现，未激活建议页不再占据隐藏高度；1024×768 与 1440×900 均无整屏空洞。
- 解析 warning 与低置信度 OCR 已进入预览区，可展开查看并跳转对应原稿页；原 PDF 被容量策略释放时，导出确认保持阻断直至重新附加原稿。
- 岗位定制现使用 requirement/mapping/Claim 证据做稳定重排，只保留原有内容与数字；真实差异、通用版/岗位版切换、JD 证据正文、最近记录恢复及岗位版统一渲染/质检/下载链均已完成。完整 Web 回归当时为 40 文件 / 197 项通过。
- 面试 evaluate 现携带完整题目 metadata，展示五维评分、回答引用和教练反馈，并对每道主问题最多执行两轮追问；相关 4 文件 / 35 项回归、TypeScript、ESLint 与格式检查通过。
- 新增根 README，说明 Node/Docker 本地启动、轮换后服务端 AI Key、24 小时数据、导出硬门、安全边界与 Vercel 延期；新增 24 小时 `HttpOnly` 匿名限流 Cookie，真实 dev 响应已确认签发。
- 建议审阅现区分五种 Claim 状态，展示评分维度、来源与面试风险；补事实必须回答具体问题且不能直接重复预填原文。评分依据展开区显示全部扣分与证据，并用独立最大高度保护下方页签布局。
- revision 生命周期已闭环：严格校验 revision 与 `beforeHash`，新 revision 使旧 pending 建议失效，确定性重建 Claim/Evidence/评分/建议/故事卡，手改生成用户确认事实，撤销恢复完整旧快照；全量 42 文件 / 209 项测试通过。
- 用户反馈导出选项仍不舒适后，将三张纵向模板卡改为稳定的三段式选择器，模板选择不再隐式触发编译；推荐理由压缩为单一摘要，生成动作固定到底部主按钮，质量明细按需展开。
- 生成后的确认勾选已移到下载按钮正上方的固定操作区，确保禁用原因与下载动作同时可见；通用版与岗位版的“已生成”状态会核验目标 ID、revision、模板和 SHA，不再误用另一版本的旧产物。
- 最新浏览器回归：1024×768、1200×900、1440×900 均无横向滚动或模板文字溢出；真实 Professional PDF 导出质量 100/100、18/18 项通过，勾选对照确认前下载禁用、确认后启用。
- 上传区现在按文件拖动深度维护高亮状态，在下一动画帧确认真正离开；跨越内部图标、标题、说明与按钮不会再闪回默认提示。`dragend`、窗口失焦、drop 和组件卸载统一复位，框外投放文件也不会触发浏览器跳转。
- 同类状态审计已修复：最近记录首次读取不闪空态；JD 匹配期间输入只读；已访问页签保留草稿但非活动页不占布局；PDF 生成和下载复核期间模板、重新生成与确认控件锁定。
- 最终全量验证通过：TypeScript、ESLint、42 个文件 / 220 项 Web 测试、32 项 document-worker pytest、3 项 loopback proxy pytest、生产构建及 `git diff --check`。最新 Web 镜像已在 `127.0.0.1:3000` 运行，健康状态为 document `isolated/ready`、AI `baseline/ready`、storage `client_local/ready`。

## 会话：2026-07-23（本地桌面导航、历史与 AI）

### 阶段 6：本地桌面导航、设备历史与 AI 适配

- **状态：** complete
- **开始时间：** 2026-07-23
- 已确认阶段 6 前的工程基线通过；其测试数量不复用为当前最终结果。
- 已将工作拆分为桌面 UI/IndexedDB、AI provider gateway、本地 document worker 三条并行实现线。
- 已完成增量结构审计并实施：移动端工作台已移除；AI provider gateway 已接入分析、JD 与面试能力，未配置新 Key 时仍运行 baseline。
- 用户随后暂停 Vercel 部署准备；已停止 Hosted/Blob 实现并要求清除本轮 Vercel 专属依赖，只保留本地运行路径。
- 已完成一次全仓旧 Key 泄漏扫描（无命中）。
- 已同步三份长期文档中的本地版边界：1024px 桌面门、IndexedDB 24 小时历史、当前十项 AI provider 能力与确定性安全硬门。
- 已清除 `@vercel/blob`，本轮不实施 Vercel；本地 Web 已重建为镜像 `sha256:b0353ce369df9bfbb8efa9711b51d4bae5dc45a0e2e7efd9884f097439419e03`，当前运行于 `127.0.0.1:3000`。
- 当前并行合并态已通过一次 `pnpm typecheck`；最近记录已补显式 AI/规则摘要来源和无长度变化时的 PDF 剥离持久化。
- 桌面边界/历史/客户端会话 4 个新增测试文件共 15 项通过，覆盖恢复、删除、清空、v2→v3、请求取消、PDF 重新附加和窄屏不挂载；全仓 ESLint 通过。
- 安全约束：不使用、不测试、不写入对话中暴露的旧 API Key；只接受后续配置的新服务端 Secret。
- Compose 已改为默认只启动 Web/worker/loopback，PostgreSQL、Redis、MinIO 放入 `future-infra` profile；AI 环境变量已透传且默认 `baseline`，没有运行时 allowlist 扩权入口。
- 已检查当前工作树与全部本地 Git 历史：常见 API Key、私钥、GitHub/AWS/Google/Slack token 和带值 Secret 赋值均无命中；`.env.example` 不包含 API Key。`.gitignore` 已扩展到私有环境文件、证书、数据库、用户 PDF/录音、测试输出与 Python 缓存。
- 初始已推送提交中存在 6 个合成简历 PDF 和 5 个 Python 字节码生成物；PDF 内容为 `example.com`/占位号码测试资料，未发现真实用户资料。忽略规则不会自动移除已跟踪文件，最终交付将明确这一边界。
- 已在首页加入未归档当前分析的恢复入口；仅当内存/sessionStorage 有分析而 IndexedDB 最近记录不存在时显示，并可直接返回工作台。
- 工作台现会以 `role="alert"` 显示自动归档错误，并提供“重试保存”与“不归档，返回首页”；后一条路径保留当前分析。相关归档恢复、语音 dispose、删除清理和 TTL 迁移 6 个文件 / 25 项聚焦测试通过。
- 浏览器已在 1024×768、1280×720、1440×900、1920×1080 验证首页与工作台均无横向滚动；首页头部、上传区和历史区保持同一 `max-w-5xl` 内容轴线。
- 375×812、768×900、1023×768 仅显示电脑浏览器提示，不渲染首页或工作台。
- 体验示例、顶栏返回、历史恢复和侧栏品牌返回均通过；返回操作与删除会话保持独立。
- 本地产品页 `browser dev logs` 返回空数组 `[]`，未发现 console error 或 warning。
- 新增统一服务端 PDF.js loader，显式加载 Node fake worker 并移除重复 tracing include；修复后的生产构建通过，7/7 页面生成且不再出现 `pdfjs-dist` standalone tracing warning。
- Web 镜像内置 Typst 0.15.1、Noto CJK 字体和 Professional/Minimal/Compact 三套模板；隔离 Web fallback 已生成有效 PDF，文档 worker health 同时报告 Typst 与中英 Tesseract 可用。
- 本地 `8001/health` 返回 Typst/Tesseract 可用；`3000/api/capabilities` 在无轮换后新 Key 时全部 baseline。首页、能力接口和示例接口均返回 200。
- 新增安全的 `/api/health`：响应只包含 document、AI、storage 的 `ready/degraded` 与 mode，不暴露配置细节；4 项路由测试通过，生产构建已包含该路由。
- 本地 `/api/health` GET 返回 200：document 为 `isolated/ready`、AI 为 `baseline/ready`、storage 为 `client_local/ready`。
- Compose 默认服务精确验证为 `worker,web,worker-loopback`，`future-infra` profile 配置也可解析；loopback 的参数边界、转发/空闲关闭和超额连接拒绝共 3 项测试通过。
- 最终全量验证通过：`pnpm typecheck`、`pnpm lint`、33 个文件 / 179 项 Web 测试、32 项 document-worker pytest、3 项 loopback proxy pytest 和 `git diff --check` 全部通过。

#### 阶段 6 最终验证

| 验证项          | 结果                             | 状态 |
| --------------- | -------------------------------- | ---- |
| TypeScript      | `pnpm typecheck` 通过            | 通过 |
| ESLint          | `pnpm lint` 通过                 | 通过 |
| Web 测试        | 33 个文件、179 项测试通过        | 通过 |
| 健康路由        | 4 项测试及本地 GET 200           | 通过 |
| document-worker | 32 项 pytest 通过                | 通过 |
| loopback proxy  | 3 项 pytest 通过                 | 通过 |
| 工作树检查      | `git diff --check` 通过          | 通过 |
| 桌面布局        | 四档视口无横向滚动，轴线统一     | 通过 |
| 窄屏边界        | 三档视口仅渲染电脑浏览器提示     | 通过 |
| 返回与恢复      | 示例、两种返回入口及历史恢复通过 | 通过 |

## 会话：2026-07-22

### 阶段 1：基础与正式文档

- **状态：** complete
- **开始时间：** 2026-07-22
- 执行的操作：
  - 读取文件规划、UI/UX 和浏览器测试 Skill。
  - 核对 Node、pnpm、Python、Typst、Docker 和 Git 环境。
  - 创建任务、发现和进度追踪文件。
  - 初始化 Git、Next.js/TypeScript 配置并安装依赖。
  - 下载项目本地 Typst 0.15.1，并确认 PingFang SC 等中文字体可用。
  - 后续通过 Homebrew 安装 Docker CLI、`docker-compose`、Colima/Lima，并启动 Colima Docker context。
  - 完成 `.codex/PROJECT.md`、PRD、架构文档和当前 31 项 Skill Registry。
  - 创建 60 个原创双语面试问题单元并通过结构校验。
- 创建/修改的文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
  - `package.json`、`pnpm-lock.yaml`、Next/Tailwind/Vitest 配置
  - `src/app/layout.tsx`、`src/app/page.tsx`、`src/app/globals.css`

### 阶段 2：领域能力与 API

- **状态：** complete
- 已完成领域 Schema、Capability Registry、确定性 baseline、PDF 原生解析和 OCR fallback。
- `document.ocr` 与 PDF scan/mixed fallback 已统一使用本地 Tesseract 语言包配置；运行时拒绝 URL 形式的语言目录，避免隐式 CDN 访问。scan 页保留整页 OCR，mixed 页过滤原生覆盖和重复块。
- 当前 10 个 API 路由、模板推荐、真实 Typst 渲染、服务端下载复审和客户端 SHA 复算链路已串联。
- 文档 worker 最终回归为 32 项 Python 测试通过；Compose 定义包含 5 个服务。
- 下载并校验本地中英文 Tesseract 模型，OCR baseline 不再依赖运行时网络。

### 阶段 3：产品界面（旧版，已由阶段 6 取代）

- **状态：** complete
- 已实现上传、建议决策、证据补充、评分、JD 匹配、模板导出和语音面试界面。
- 使用 `useSyncExternalStore` 保证持久化状态首帧一致；导出确认绑定到具体渲染产物。
- 当时曾维护桌面、移动单列和底部导航；阶段 6 已删除移动端工作台，当前仅保留 1024px 以上桌面布局和窄屏提示。

### 阶段 4：测试与验证

- **状态：** complete
- 2026-07-23 最终全量 `typecheck`、`lint`、24 个文件 / 119 项 Vitest、32 项 Python worker 测试和零 tracing warning 生产构建均通过；Compose 配置解析通过。
- 最终 Web 镜像 `sha256:00b57e52...c26d` 和 worker 镜像 `sha256:0f2f0b84...ca54d` 均零 warning 构建；容器 health、真实 render/download、数字/扫描 PDF、OCR 区域超限、不可见/局部遮挡阻断、只读文件系统及网络隔离通过。
- 浏览器真实上传、补证/接受/双层撤销、JD、面试评审与会话重置、三模板 100/100 和下载硬门在当时通过；布局结论已由阶段 6 的桌面限定回归取代。
- 发布复审发现的 digest、隐私清理、无长度上传、导出资源预算、不可见/局部遮挡文字、OCR 资源上限和面试状态同步问题均已修复并回归。

### 阶段 5：交付

- **状态：** complete
- `.codex/PROJECT.md`、PRD、架构、计划、发现和进度记录已同步到最终实现与验收数字。
- 最新生产 Web 容器保留在 `http://127.0.0.1:3000`；隔离文档 worker 仅通过 Compose internal backend 的 `http://worker:8000` 供 Web 访问。

## 阶段 6 前测试结果（历史基线）

| 测试           | 输入                                                           | 预期结果                                  | 实际结果                                                                           | 状态 |
| -------------- | -------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- | ---- |
| 环境检查       | Node/pnpm/Python                                               | 可运行基础工具链                          | Node 24、pnpm 10、Python 3.14 可用                                                 | 通过 |
| Typst 安装     | macOS arm64                                                    | CLI 可编译且识别中文字体                  | Typst 0.15.1、PingFang SC 可用                                                     | 通过 |
| Docker/Compose | Docker CLI + Colima + `docker-compose`                         | 可解析并构建生产拓扑                      | 配置与两镜像构建无 warning；Web/worker/PDF/OCR/下载硬门、只读与网络隔离 smoke 通过 | 通过 |
| TypeScript     | `pnpm typecheck`                                               | 无类型错误                                | 最新全量通过，0 错误/警告                                                          | 通过 |
| 单元测试       | `pnpm test`                                                    | 全量能力与 API 测试通过                   | 24 个文件、119 项全部通过                                                          | 通过 |
| 文档 worker    | `pytest -q services/document-worker/tests`                     | PDF 安全、解析、模板测试通过              | 32 项全部通过                                                                      | 通过 |
| OCR 工具       | `bootstrap-tools.sh` + `gzip -t`                               | 固定模型可离线读取                        | 两个模型校验和及 gzip 完整性通过                                                   | 通过 |
| OCR Capability | `pnpm test tests/capabilities/infrastructure-baseline.test.ts` | 独立 OCR 也只读取本地模型                 | 12/12 通过，并断言无 HTTP(S) 语言路径                                              | 通过 |
| 三模板 PDF     | Typst + Poppler + Browser                                      | A4、可搜索、字体嵌入、无视觉缺陷          | 稀疏与稠密三模板、像素验证、内容/局部文字硬门、预览确认和下载通过                  | 通过 |
| ESLint         | `pnpm lint`                                                    | 无规则、配置错误或 warning                | 最新全量通过，0 错误/警告                                                          | 通过 |
| Next 构建      | `pnpm build`                                                   | 所有页面与 API 可生成且无 tracing warning | 生产构建通过，7/7 静态页生成；仅保留 Next.js `serverActions` experimental 提示     | 通过 |

## 错误日志

| 时间戳     | 错误                                                                                   | 尝试次数 | 解决方案                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| 2026-07-22 | 初始环境缺少 Typst CLI 与 Docker                                                       | 1        | 下载项目内 Typst，并安装 Docker CLI、`docker-compose`、Colima/Lima；Colima 已启动                                     |
| 2026-07-22 | TypeScript 7/ESLint 10 超出 Next 插件兼容范围                                          | 1        | 锁定 TypeScript 5.9 与 ESLint 9                                                                                       |
| 2026-07-22 | ESLint 9 找不到 `eslint.config.*`                                                      | 1        | 新增 Next.js 扁平配置并重新运行 lint                                                                                  |
| 2026-07-22 | 非法 JSON Pointer 被拒绝后仍回退全文替换                                               | 1        | 有 patch 时只执行白名单路径，失败保持 AST 不变                                                                        |
| 2026-07-22 | 三文件文档补丁因 PRD 上下文不匹配而整体拒绝                                            | 1        | 拆分为逐文件补丁并按实际段落重新应用                                                                                  |
| 2026-07-22 | ATS 顺序硬门将完整 AST 与组合渲染字段混排，正常模板被误判                              | 1        | 内容遗漏继续比较完整 AST，阅读顺序仅比较去重后的实际渲染序列                                                          |
| 2026-07-22 | 语音多文件补丁因 API 测试标题不匹配而整体拒绝                                          | 1        | 拆为契约/API、UI 和测试三段逐一应用                                                                                   |
| 2026-07-22 | 浏览器点击“体验示例”后 `/api/demo` 返回 `CORRUPT`                                      | 2        | 定位为 Turbopack 打包后找不到 `pdf.worker.mjs`；将 `pdfjs-dist` 设为服务端 external，端点恢复 200                     |
| 2026-07-22 | `pnpm dlx tsx -e` 顶层 `await` 不受 CJS 输出支持                                       | 1        | 改用 async IIFE 运行独立 PDF 生成与解析诊断                                                                           |
| 2026-07-22 | 分析骨架屏出现重复 React key `85`                                                      | 1        | key 改为稳定的 `index-width` 组合，并补充 React key 回归测试                                                          |
| 2026-07-22 | Web 文档把 mixed OCR 误写成区域裁剪                                                    | 1        | 按实际实现修正为整页 OCR 后过滤原生覆盖区域和重复块，并与 Python worker 区域能力分开描述                              |
| 2026-07-23 | 浏览器 locator 不提供 `setInputFiles`                                                  | 1        | 改用 `waitForEvent("filechooser")` 后由 chooser `setFiles` 上传真实 PDF                                               |
| 2026-07-23 | worker 镜像默认 `OCR_PROVIDER=paddleocr`，但默认构建不安装 PaddleOCR                   | 1        | 将镜像默认统一为已内置中英模型的 Tesseract；PaddleOCR 继续作为显式可选增强                                            |
| 2026-07-23 | 浏览器下载 API 返回 200，但自动化未捕获 Blob download event                            | 1        | 以服务端下载复审、响应状态和按钮硬门验证为准，未重复触发下载                                                          |
| 2026-07-23 | in-app Browser 对隔离执行上下文的 `HTMLElement instanceof` 与 `body.press` 不兼容      | 2        | 改用 DOM 尺寸、语义快照、触控目标扫描和现有 skip link 单元/静态检查完成无障碍验收                                     |
| 2026-07-23 | 发布审计发现 worker 摘要未与上传字节核对                                               | 1        | 在适配器映射前计算本地 SHA-256；不一致时以 `WORKER_DIGEST_MISMATCH` 拒绝                                              |
| 2026-07-23 | 旧版敏感 `localStorage` 只在 Workspace 挂载时清理                                      | 1        | 清理逻辑前移到应用根组件，上传页、过期会话和无 v2 会话也会执行                                                        |
| 2026-07-23 | 缺失 `Content-Length` 时 `request.formData()` 会先缓冲完整上传体                       | 1        | multipart 解析前按流读取并在 10 MB PDF 加固定表单开销处取消，返回 413                                                 |
| 2026-07-23 | Docker CLI 找不到已由 Homebrew 安装的 buildx，且用户配置引用 Desktop credential helper | 2        | 使用独立 `/tmp/resume-assistant-docker-config` 注册 Homebrew buildx，并显式指向 Colima socket；未修改用户 Docker 配置 |
| 2026-07-23 | Colima 发布端口未能从宿主 `curl` 访问，容器本身已 healthy                              | 1        | 改用容器内部 health 请求与 stdin 直送扫描 PDF 验证相同生产代码路径                                                    |
| 2026-07-23 | 最新 production build 复制 traced `pdfjs-dist` 时出现 `ENOTDIR`                        | 1        | 去除重复 tracing include；本机及最终 Alpine 构建零 warning，相关路由和原生模块 smoke 通过                             |
| 2026-07-23 | 更新三份进度文件的 patch 上下文不匹配                                                  | 2        | 改为逐文件、按实际段落精确更新                                                                                        |
| 2026-07-23 | 导出审计可被白字叠装饰或局部遮挡关键文字绕过                                           | 2        | 增加 full/no-text/text-mask 三渲染差分、字形墨迹带和重叠滑窗；白字、句尾与窄数字遮挡均返回 409                        |
| 2026-07-23 | 导出审计和 OCR worker 缺少完整资源预算                                                 | 1        | 导出增加页/项/字符/operator/像素/比较/deadline/cancel；OCR 增加区域/并发/字符/像素/输出/Tesseract timeout 上限        |
| 2026-07-23 | Markdown 格式检查发现项目约定与三份进度文件表格未对齐                                  | 1        | 使用仓库 Prettier 机械格式化后重新检查                                                                                |
| 2026-07-23 | Next standalone 在双网络容器中按容器 hostname 只监听单个网卡，宿主端口连接无响应       | 1        | 在 Web runtime 镜像固定 `HOSTNAME=0.0.0.0`，重建后宿主首页和容器内 worker health 均返回 200                           |
| 2026-07-23 | Browser 首次调用不存在的 `tab.logs`                                                    | 1        | 改用 `tab.dev.logs` 完成日志工具调用诊断                                                                              |
| 2026-07-23 | 系统 Python 3.14 未安装 pytest                                                         | 1        | 不再重复使用系统解释器，改用 document-worker 已锁定的项目虚拟环境                                                     |
| 2026-07-23 | Prettier 无法为 `.env.example` 推断 parser                                             | 1        | 环境样例改用内容检查，其余 Markdown/YAML 由仓库 Prettier 格式化                                                       |
| 2026-07-23 | 代理测试通过 `importlib` 装载时未登记模块                                              | 1        | 执行前写入 `sys.modules`，使 `dataclass` 正确解析模块命名空间                                                         |
| 2026-07-23 | Compose 默认服务断言误计命令替换的结尾换行                                             | 1        | 改用逗号归一化后的服务列表断言，不再依赖 shell 保留尾部换行                                                           |
| 2026-07-23 | 多文件 patch 复用了格式化前的 Markdown 上下文                                          | 2        | 拆分代码与文档 patch，并按 Prettier 后的实际表格行重新应用                                                            |
| 2026-07-23 | 环境样例严格检查发现注释仍出现密钥变量名                                               | 1        | 删除该注释；密钥配置方式只在文档中指向被 Git 忽略的私有文件                                                           |
| 2026-07-23 | 新组件测试使用 `.test.tsx`，未命中仓库只包含 `.test.ts` 的 Vitest 规则                 | 1        | 两个测试无 JSX，改名为 `.test.ts` 并用显式文件列表复跑                                                                |
| 2026-07-23 | Store 测试的产品级 `reset()` 会保留首页历史摘要，导致下一用例看到上一条记录            | 1        | 测试 `beforeEach` 在清 IndexedDB 后同步清空 `recentAnalyses`，恢复完整隔离                                            |
| 2026-07-23 | Next standalone 重复复制 `pdfjs-dist`；直接移除 include 后又漏掉 Node fake worker      | 2        | 新增统一 PDF.js loader 显式导入 worker，并补子路径类型声明；不再使用重复 tracing include                              |
| 2026-07-23 | Prettier 无法为 Git/Docker ignore 文件推断 parser                                      | 1        | 保持人工审阅，改用 Docker build、`git check-ignore` 与 `git diff --check` 验证                                        |
| 2026-07-23 | Browser 不支持 `networkidle` 作为等待状态                                              | 1        | 改用 `domcontentloaded`，再以可访问树中的目标状态和截图复核                                                           |
| 2026-07-23 | React 类型定义不接受 `<details defaultOpen>`                                           | 1        | 改用合法 `open` 属性，警告/失败时展开、全绿时保持折叠                                                                 |
| 2026-07-23 | 三文件进度补丁复用旧表格上下文而失败                                                   | 1        | 拆分为逐文件补丁，并按当前实际行应用                                                                                  |

## 五问重启检查

| 问题           | 答案                                           |
| -------------- | ---------------------------------------------- |
| 我在哪里？     | 阶段 13：上传与 revision 分析强制真实 AI        |
| 我要去哪里？   | 完成全量构建、Python 回归和真实 Provider 终验    |
| 目标是什么？   | 交付可运行、可扩展、证据约束的简历分析助手 MVP |
| 我学到了什么？ | 见 `findings.md`                               |
| 我做了什么？   | 见上方记录                                     |

## 会话：2026-07-24（阶段 11 统一 Skill 套件）

- **状态：** complete
- 用户要求先由项目自行编写所需 Skills，并统一架构和入口，避免零散安装。
- 已决定在仓库内创建单一 `resume-assistant-toolkit` Codex 插件；本轮不修改个人 marketplace，也不让这些开发期 Skill 自动成为产品运行时扩展。
- 计划采用一个编排入口加六个领域 Skill，共享 Capability 映射、安全边界和验收协议。
- 已用官方脚手架创建插件入口和七个 Skill 目录；其中三个 Skill 完整初始化，四个因中文短描述不足 25 字符只生成了 `SKILL.md`，后续改用元数据生成器补齐，避免覆盖目录。
- 元数据生成器直接读取 frontmatter 时发现系统 Python 缺少 PyYAML；将使用其显式 `--name` 参数继续，不为项目引入无关依赖。
- 已完成统一插件 manifest、总入口 Skill、31 项 Capability 单一映射和运行时扩展协议；总入口按文档→证据→岗位/文案→排版→面试→安全顺序路由跨域任务。
- 已确认 document-worker 项目虚拟环境包含 PyYAML 6.0.3，后续 Skill 校验使用该隔离环境，不修改系统 Python。
- 已完成六个领域 Skill 及各自 Rubric：文档智能、证据评审、岗位与中英文文案、Typst 排版导出、面试与语音、安全与评测；全部通过官方 `quick_validate.py`，插件通过 `validate_plugin.py`。
- Capability map 与运行时源码程序化比对为 31/31，无缺失、额外或重复归属；全部相对链接有效，frontmatter 仅含 `name`/`description`，无 TODO、动态脚本入口、MCP 或网络权限声明。
- 两轮独立 forward test 覆盖 mixed PDF 缺陷、导出审计失败和外部 Skill 启用审查，并据此澄清页面分类/抽取模式、OCR 编排、自动/人工导出评分、下载授权、provider host allowlist、影子计划和领域 Rubric 叠加规则。
- 独立审查发现并闭环两项契约边界：`document.ocr` v1 仍固定 `tesseract.js` engine，非 Tesseract extension 需先版本化 Schema；`pii.redact` 当前不输出姓名 detection，姓名与上下文 PII 由 provider projection 外围控制。
- 已同步 `.codex/PROJECT.md`、`docs/ARCHITECTURE.md`、`docs/PRD.md` 和根 README；最终 Skill/插件验证、敏感占位扫描、链接检查及 `git diff --check` 通过。本阶段未安装到个人 marketplace、未暂存、未提交。

### 2026-07-23 上传拖拽交互修复

- 深度计数方案经用户真实拖拽证明仍会因激活重渲染和命中目标变化而失真，现已废弃。
- 当前实现使用窗口级文件 `dragover`，以事件目标归属和上传框几何边界双重判定；框内子元素 leave、短暂 window target 和重复跨越都不会关闭高亮，真实框外 `dragleave`、`Escape`、drop、dragend 或 blur 会复位。
- 上传区现有 13 项聚焦测试通过，覆盖原生式目标变化、框内/框外、取消、真实 PDF 单次提交、监听器卸载、非文件 payload 和防浏览器导航。Finder 实拖仍需在 Mac 解锁后补最后人工验收。

### 2026-07-23 阶段 9 完整交付审计（完成）

- 需求矩阵、组件运行时和 Git 交付审计已完成；当前 31 个 Capability ID 均有 baseline 契约。
- 已修复未确认建议的后续模块门控、撤销栈持久化 PDF/预览泄漏、“不归档”被首页刷新反转，以及 PDF 字体元数据在 Web Schema 中丢失。
- 面试设备检查/追问进度与 JD 元信息/草稿持久化已完成；全量 Web、worker、构建、容器、安全与桌面浏览器回归均已通过。
- 面试设备检查与 `InterviewProgress` v1 已完成；主问题、两轮追问、追问评审和文字草稿可跨模块、返回首页和历史恢复继续，并按简历 revision/计划指纹防串状态。
- JD 职位名、职级、地点、求职语言和正文草稿已进入 Store、会话存储与最近分析；任一字段变化会立即清除旧岗位结果、岗位版和面试计划。
- 流程门已从组件按钮下沉到 Store 及会话/历史恢复路径。最终全量为 44 个文件 / 259 项 Web 测试，另有 34 项 worker 与 3 项 loopback proxy 测试全部通过。

## 会话：2026-07-27（阶段 13 上传分析强制真实 AI）

- **状态：** in_progress；实现、完整自动化、Python 回归和生产构建已完成，真实 Provider 三次连续成功验收因上游 429 尚未通过。
- Registry 已增加 `allow | forbid` fallback policy；上传、示例和 revision 的 `resume.score`、`resume.suggest` 通过严格调用器验证非 fallback 与 `@2.x+` 来源。
- `/api/analyze`、`/api/demo` 和新增 `/api/resume-analysis` 均采用评分+建议原子成功；错误统一为不含正文/Provider 细节的 `AI_ANALYSIS_UNAVAILABLE`。
- Provider 建议改为精简候选 Schema、限定 `editableTargets`，系统字段与 patch 由服务端生成；部分非法候选过滤、显式空数组成功、全部非法只纠错一次。
- revision 修改后本地只重建 Claim/Evidence/Story；AI 状态按 `stale → refreshing → fresh/failed`，旧请求取消且晚到响应不能覆盖新 revision。等待/失败期间旧分数隐藏，JD 和面试禁用。
- 上传页会在 AI 未配置时禁用提交；失败保留 File 并提供重试。旧 baseline 历史与旧 sessionStorage 标为“旧版本地分析”，不能进入工作台或把旧分数显示为 AI。
- 已新增严格 API、Provider 纠错、零建议、两次非法失败、旧记录隔离、revision 失败重试与竞态测试。当前 `pnpm typecheck`、`pnpm lint` 和全量 Web 测试已通过；最近一次全量为 56 个文件 / 319 项，后续新增聚焦测试也通过。
- README、PRD、架构、Capability map、`.codex/PROJECT.md` 和 `.env.example` 已同步为“上传分析必须真实 AI”；最终 Provider 验收后再回填完成结论。
- 2026-07-27 最终自动化回归已完成：`pnpm typecheck`、`pnpm lint`、`pnpm test`（57 个文件 / 333 项）、`pnpm build`、document-worker pytest（34 项）和 infra pytest（3 项）均通过。真实 Provider 的生产接口与浏览器终验仍在执行，未提前标记阶段完成。
- 生产端口 `3002` 的第一份合成 PDF 上传返回 `503 AI_ANALYSIS_UNAVAILABLE`，失败能力为 `resume.score`；响应没有 AnalysisBundle、Provider 细节或本地模板结果。该失败说明原子门生效，但真实 Provider 验收尚未通过，正在以结构化安全日志定位原因。
- 两次不含简历正文的最小 Provider 探针均未产生可记录的 HTTP 元数据；未读取响应正文、未输出凭证，也未据此放宽强制 AI 契约。按 `retryable: true` 语义改用不同合成简历执行一次应用级重试。
- 第二份合成 PDF 请求约五分钟后同样返回 `AI_ANALYSIS_UNAVAILABLE`，失败能力仍为 `resume.score`，无 AnalysisBundle。
- 第三份合成 PDF 在可观测生产进程中确认 `resume.score@2.0.0` 由 Provider 以 HTTP 200 成功返回（24.6 秒），随后 `resume.suggest@2.0.0` 的首轮 `json_schema` 请求被上游以 HTTP 429 拒绝（23.5 秒）；应用整体返回 503 且未泄漏已成功评分、未执行兼容格式重试或 baseline。真实连续成功验收仍未通过。
- 生产浏览器使用真实文件选择器上传合成 PDF：等待页未展示提前结果；Provider 再次评分 200、建议 429 后，页面返回上传区，显示“AI 分析未完成，未返回本地模板结果”，保留“重新使用 AI 分析”，最近分析仍为空，未进入工作台。
# 2026-07-27 代码清理与边界审计

- 已读取文件规划技能及现有 `task_plan.md`、`findings.md`、`progress.md`。
- 已在计划中新增阶段 14，范围限定为：先证据审计，再删除无用代码，最后做聚焦优化与解耦并执行全量验证。
- 已运行会话恢复检查并读取 Git 状态与根目录文件概览；恢复脚本没有报告未同步上下文。
- 已识别并保护审计开始前存在的未跟踪 `.github/` 和隐私 API 目录。
- 一次规划文档补丁因章节位置假设错误而失败且未产生修改；已读取实际位置并改用精确上下文。
- 已完成依赖脚本、TypeScript/Next/Vitest 配置、Git 跟踪文件、忽略规则和全仓主要目录的第一轮盘点。
- 已运行更严格的 TypeScript 未使用符号检查并完成运行依赖逐项引用扫描；均未发现可直接删除项。
- 已读取 README、架构文档和前端入口，确认约定式动态入口与当前业务不变量。
- 已临时运行 `knip`（未修改依赖清单）；获得未使用文件/导出候选，开始人工校验约定式入口与公共契约。
- 已逐项追踪第一批候选的定义与引用，确认四个无调用包装可删除，并识别 baseline 公共 barrel 过宽问题。
- 已复核上传、revision、兼容建议、示例路由及严格 AI service 调用链，并审阅 Python worker 的入口与模块职责。
- 已确认客户端存在一套无调用且语义落后的渲染转换，可删除并解除 client -> server 类型依赖。
- 客户端 API 多段补丁曾因转写接口上下文不匹配而整体失败且未产生修改；随后按当前文件逐段应用，保留 multipart/JSON 请求差异。
- 已删除客户端旧渲染转换、旧建议请求包装、服务端渲染组合包装、面试检索便利包装与无调用缓存清理入口。
- 已移除空转 `apiSessionHeaders`，并将仅本文件使用的组件、Store、行合并辅助实现改为私有。
- 已将 baseline barrel 收敛为契约与 Registry 门面，裸 Capability 实现只通过聚合注册表使用。
- 已把仅测试引用的 `pdf-lib` 从生产依赖移到开发依赖，并用 `pnpm install --lockfile-only` 同步 lockfile。
- 已撤销 lockfile 因 `latest` 触发的全部无关依赖升级，只保留 3 行 `pdf-lib` 分类移动。
- 已统一领域模板 ID Schema，并把岗位/面试客户端请求改为显式传递简历身份；Madge 从 1 个循环依赖降为 0。
- 已用临时 ESLint 复杂度规则完成热点量测，并将后续拆分边界记录到 findings；本轮不冒险重写高复杂度业务状态机。
- 聚焦验证实际运行了全量 57 个 Vitest 文件 / 334 项测试，全部通过；TypeScript 与 `git diff --check` 同步通过。
- 最终验证通过：TypeScript、ESLint、57 个文件 / 334 项 Vitest、34 项 document-worker pytest、3 项 loopback proxy pytest、Next 生产构建、冻结/离线 lockfile 检查、零循环依赖与 `git diff --check`。
- 生产构建自动改写的 `next-env.d.ts` 已恢复为构建前内容，没有把生成噪声纳入交付。
- 阶段 14 已完成；阶段 13 的真实 Provider 连续成功终验仍保持未完成，不因代码清理而改变状态。
- 规划技能通用 `check-complete.sh` 不识别现有中文“阶段”清单，返回 `0/0 phases`；以 `task_plan.md` 阶段 14 的逐项勾选和本节验证结果为完成依据。
