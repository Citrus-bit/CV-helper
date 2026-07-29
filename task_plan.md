# 任务计划：实现简历分析助手可扩展 MVP

## 目标

从空目录交付一个可运行、可测试的简历分析助手 Web MVP，覆盖 PDF 上传与原生解析、证据约束建议、JD 匹配、三模板预览导出、语音面试，以及可替换的 Capability/Skill 契约。

## 当前阶段

阶段 16：岗位分析与面试强制真实 AI（已完成）

## 各阶段

### 阶段 1：基础与正式文档

- [x] 初始化 Git、Next.js/TypeScript 工程与依赖
- [x] 创建 `.codex/PROJECT.md`、PRD、架构文档
- [x] 建立 Capability 契约、Skill Registry 与测试基线
- **状态：** complete

### 阶段 2：领域能力与 API

- [x] 实现 PDF 原生解析优先及 OCR fallback 契约
- [x] 实现 Resume AST、EvidenceGraph、评分和事实安全建议
- [x] 实现 JD 覆盖矩阵、岗位版本与面试能力
- [x] 实现三模板 PDF 导出、真实预览、哈希复核及质量报告
- **状态：** complete

### 阶段 3：产品界面（初版，已由阶段 6 的桌面限定取代）

- [x] 实现上传/分析工作流
- [x] 实现简历审阅、证据补充和评分交互
- [x] 实现岗位匹配、模板预览和语音面试
- [x] 完成 Apple 风响应式与无障碍最终复核
- **状态：** complete

### 阶段 4：测试与验证（阶段 6 前基线）

- [x] 在最新改动后重跑类型、lint、单元与 worker 测试
- [x] 消除 standalone tracing 警告并重跑生产构建
- [x] 启动开发服务器并进行浏览器桌面/移动端 QA
- [x] 修复当时发现的视觉与交互问题
- **状态：** complete（当时的 Web/worker 测试、生产构建、浏览器和容器回归已通过；不作为阶段 6 的当前统计）

### 阶段 5：交付

- [x] 更新正式文档和进度记录
- [x] 检查所有交付文件及运行说明
- [x] 向用户提供可访问 URL 和验证摘要
- **状态：** complete

### 阶段 6：本地桌面导航、设备历史与 AI 适配

- [x] 移除移动端工作台，仅保留 1024px 以上桌面布局和窄屏提示
- [x] 增加非破坏性返回首页入口、统一首页内容轴线
- [x] 实现 IndexedDB 最近分析、恢复、删除、清空、配额淘汰和 v2 迁移
- [x] 接入服务端 AI provider gateway、PII 投影、结构校验、限流和 baseline 回退
- [x] 恢复并验证本地隔离 document worker 的原生解析、OCR 和 Typst 能力
- [x] 收紧本地 worker loopback 的连接、空闲和并发资源边界
- [x] 同步本地版项目、PRD 和架构文档
- [x] 扫描当前树与 Git 历史中的常见密钥模式并收紧本地敏感数据忽略规则
- [x] 完成本地生产构建、PDF.js standalone 修复与容器重建
- [x] 增加最小化 `/api/health` 状态接口及生产镜像回归
- [x] 完成桌面/窄屏浏览器矩阵及返回/恢复流程回归
- [x] 完成最终全量测试并回填本阶段统一数字
- **状态：** complete

### 阶段 7：最终交付审计与完整作品封装

- [x] 将 PRD、架构、Capability、页面组件和测试证据逐项映射，识别占位与未证明项
- [x] 实现真实岗位定制 AST/差异，不再用原 AST 冒充岗位版本
- [x] 面试评审携带完整题目元数据并执行最多两轮追问，完整展示教练反馈
- [x] AST revision 变化后使旧建议失效，并重算 Claim、故事与评分
- [x] 在预览区展示解析 warning、OCR/低置信度与定位信息
- [x] 重构排版预览与导出面板，消除空洞并收紧模板、质检、确认与下载层级
- [x] 修复上传区跨子元素拖动时提示闪回，并补齐文件拖拽状态回归测试
- [x] 补齐 AI 匿名会话限流标识、本地 README 和 Capability 行为/eval 证据
- [x] 补齐功能、交互、文档、安全及本地运行缺口
- [x] 重走真实 PDF、建议审阅、JD、面试、三模板预览和导出质量门
- [x] 完成桌面视觉、键盘/无障碍、安全、性能、构建和全量测试回归
- [x] 清理不应继续跟踪的生成物，整理可提交作品与最终交付说明
- **状态：** complete

### 阶段 8：最终完成性复核

- [x] 按全部用户要求建立功能、组件、文档、运行时与验收证据矩阵
- [x] 独立复核产品闭环、Capability/安全边界和本地交付，不继承阶段 7 的完成结论
- [x] 修复所有已证实的漏项、占位、伪实现或不可恢复交互
- [x] 重走数字/扫描 PDF、建议、JD、三模板导出和面试核心流程
- [x] 重跑全量测试、构建、容器、安全扫描与桌面视觉/无障碍验收
- [x] 同步三份正式文档和交付说明，确认工作树可提交
- **状态：** complete

### 阶段 9：完整作品交付审计

- [x] 从全部用户要求、PRD、架构、Capability Registry 和运行拓扑建立逐项证据矩阵
- [x] 独立复核每个页面、组件、API、baseline、Skill 接口和本地交付路径，不能继承阶段 8 结论
- [x] 修复任何缺失操作、未接线组件、占位实现、错误状态或文档反证
- [x] 重跑 Web/worker/proxy 测试、构建、容器、安全扫描和真实桌面核心流程
- [x] 确认 Git 差异包含完整作品且没有遗漏未跟踪文件、敏感信息或生成物
- **状态：** complete

### 阶段 10：最终作品独立终验

- [ ] 以当前工作树重建全部用户要求、PRD、架构、页面、组件、API 和本地运行证据矩阵
- [ ] 并行审计所有操作是否接线、所有组件是否可达、所有错误/取消/恢复路径是否闭环
- [ ] 审计未跟踪与混合暂存文件、敏感信息、生成物和本地启动材料是否构成完整交付
- [ ] 修复所有由当前证据确认的缺口，并为每项补充可失败的回归测试
- [ ] 重跑 Web、worker、代理、生产构建、容器、安全和桌面浏览器核心流程
- [ ] 同步 `.codex/PROJECT.md`、PRD、架构、README、计划、发现与进度，确认作品可提交
- **状态：** in_progress

### 阶段 11：统一 Skill 套件

- [x] 在仓库内创建单一 `resume-assistant-toolkit` 插件入口，不写入个人 marketplace
- [x] 创建一个编排 Skill 和六个领域 Skill，覆盖现有 31 项 Capability
- [x] 提取共享 Capability 映射、安全边界、输出规范与验收清单，避免各 Skill 重复或冲突
- [x] 为每个 Skill 生成 `agents/openai.yaml`，并通过 Skill/插件验证器
- [x] 同步 `.codex/PROJECT.md`、架构文档和项目进度，明确开发期 Skill 与产品运行时 Capability 的边界
- **状态：** complete

### 阶段 12：本地持久化的简历 AI 编辑对话

- [x] 定义对话消息、会话摘要、已确认事实、修改记录与简历 revision 的运行时契约
- [x] 实现 `resume.chat` 服务端能力与 `/api/resume-chat`，走真实 AI、PII 投影、严格输出校验和 7 分钟超时
- [x] 实现客户端本地持久化与有界上下文组装：长期摘要 + 最近消息 + 当前简历 + 事实/修改摘要
- [x] 在审阅工作区增加可连续追问、可重试、可应用改写的 AI 编辑视图，等待时显示 0–99% 进度
- [x] 覆盖上下文裁剪、历史恢复、revision 变更、应用改写、失败关闭及键盘/无障碍回归
- [x] 重跑 TypeScript、ESLint、相关测试、生产构建与浏览器实流程
- **状态：** complete

### 阶段 13：上传与 revision 分析强制真实 AI

- [x] 为 Capability Registry 增加禁止 baseline fallback 的调用策略与专用错误协议
- [x] 将上传、示例和 revision 评分/建议切换为真实 AI 原子成功
- [x] 精简 Provider 建议 wire schema、固定可编辑目标并增加一次结构纠错重试
- [x] 增加 AI 新鲜度、revision 重分析、竞态保护与下游流程门
- [x] 隔离旧本地规则记录，移除新流程中的本地建议展示与持久化
- [x] 更新环境与正式文档，完成自动化与生产构建回归
- [ ] 完成两份合成简历、三次连续成功的真实 Provider 终验
- **状态：** in_progress

### 阶段 14：代码清理、优化与模块边界审计

- [x] 盘点当前工作树、入口、模块依赖、配置、测试与运行拓扑
- [x] 以引用、构建产物和测试证据确认可安全删除的代码与依赖
- [x] 实施低风险清理，并对已证实的重复逻辑或不清晰边界做聚焦优化
- [x] 检查所有调用方、公共导出、类型、文档与配置的一致性
- [x] 运行格式、类型、静态检查、测试和生产构建，记录兼容性风险
- **状态：** complete

### 阶段 15：岗位定制简历与原版一致问题修复

- [x] 复现并追踪岗位匹配结果、岗位定制 AST、排版预览和 PDF 导出的数据链路
- [x] 定位导致岗位定制版沿用原始简历的根因，并明确事实安全边界
- [x] 修复生成、状态持久化或导出读取错误，确保定制版实际体现岗位相关调整
- [x] 补充能区分原版与岗位版的回归测试，覆盖预览和导出请求
- [x] 运行相关测试、类型检查与实际页面回归，并记录验证结果
- **状态：** complete
- **错误记录：** 首次多文件补丁因 `document-preview.tsx` 已有用户改动、目标旧文案不存在而整体未应用；后续按实际文件拆分补丁，不覆盖现有预览模式修改。
- **错误记录：** 首次测试补丁包含空的 `job-workspace.test.ts` hunk，校验拒绝且未应用；已删除空 hunk，并改为逐个测试文件补丁。
- **错误记录：** 首轮相关测试中 4 个文件通过、2 个文件失败；`job-workspace` 与全量类型错误来自现有 `capabilityVersions` 必填契约和旧 fixture 不一致，路由测试另有 500/400，需隔离岗位用例继续诊断。
- **错误记录：** 首次端口探测使用了 zsh 只读变量名 `status`；未改变系统状态，改用任务专用变量名后重试。
- **错误记录：** 浏览器真实岗位匹配调用的增强 AI Provider 本次未完成，应用按策略显式失败且未返回 baseline；不重复依赖该外部状态，改用确定性路由与 PDF 渲染测试完成本轮验证。
- **错误记录：** 仓库未安装 Prettier，`pnpm exec prettier --check` 无法运行；不为本轮引入新依赖，改以 ESLint、目标测试和 `git diff --check` 验证格式与语法。

### 阶段 16：岗位分析与面试强制真实 AI

- [x] 盘点岗位解析/匹配与面试计划/评估/教练的全部 Provider 调用和 fallback 路径
- [x] 将用户可见岗位与面试推理能力切换为禁止 baseline fallback 的原子成功语义
- [x] 在服务端响应、客户端契约和持久化边界校验 `@2.x+` 真实 AI 来源
- [x] 补齐未配置、限流、超时、非法响应及半成功场景的失败关闭测试
- [x] 运行类型、静态检查、相关测试、全量测试、生产构建和真实 Provider 回归
- **状态：** complete

## 关键问题

1. 项目内 Typst 0.15.1、Poppler 和本地中英文 Tesseract 模型已安装。Docker CLI、`docker-compose` 和 Colima 已安装并启动；`docker compose` 子命令当前不可用，容器验收使用 `docker-compose`，Web/worker 最终镜像均已构建并通过 smoke。
2. 用户提供的旧 AI Key 已视为泄露且禁止使用；provider gateway 只读取新的服务端环境变量。`resume.score`、`resume.suggest`、`resume.chat`、`jd.parse`、`job.match`、`interview.plan`、`answer.evaluate`、`answer.coach` 必须显式失败，不能用 baseline 伪装真实 AI；两项 copy 能力保持受事实校验约束的兼容策略。
3. 用户已临时暂停 Vercel 部署；本阶段不保留 Private Blob、Hosted API、Vercel 配置或云端 worker 半成品。
4. 阶段 6 最终验证通过：TypeScript、ESLint、33 个文件 / 179 项 Web 测试、32 项 document-worker 测试、3 项 loopback proxy 测试及 `git diff --check` 全部通过；其中健康路由 4 项测试通过。
5. Compose 默认服务已精确验证为 Web、worker 和 loopback；`future-infra` profile 配置可解析。loopback 的 3 项资源边界测试通过。
6. 当前 Git 历史有两个提交；Gitleaks 对全部历史、当前差异、未跟踪源码和提交消息均无命中。两个提交的作者/提交者元数据包含个人邮箱；初始提交还跟踪过 6 个合成 PDF 与 5 个 Python 字节码文件。当前 index 已删除生成物并补齐忽略规则，但彻底移除邮箱或旧文件需要重写已推送历史，未经用户明确授权不执行。
7. 当前本地 Web 镜像为 `sha256:a249fcd2684f47769fc09b8dace3481aed2e8b7dc4fed90f3dbf03159192ef4c`，worker 镜像为 `sha256:e66d66fb46250340337079bc066ad6c35f5b47f1c1ad52deada6630a135bccb9`；生产构建包含 `/api/health`，首页、能力接口、示例接口、真实 PDF 生成与健康接口均已通过容器 smoke。
8. 首页与工作台在 1024×768、1280×720、1440×900、1920×1080 均无横向滚动；375×812、768×900、1023×768 仅显示电脑浏览器提示。体验示例、顶栏返回、历史恢复和侧栏品牌返回均通过。
9. 本地 `/api/health` GET 返回 200，只暴露 document、AI、storage 的 `ready/degraded` 与 mode；当前分别为 `isolated/ready`、`baseline/ready`、`client_local/ready`。
10. 阶段 7 审计曾否定“全部完成”结论；岗位定制 AST、面试元数据/追问、revision 后领域重算、解析 warning 可见性和根 README 均已补齐并回归。
11. 隔离 worker 可恢复错误现会回退内置解析；摘要不一致、413 和用户取消继续失败关闭。“24 小时清理”文案已明确浏览器关闭时在下次打开后物理清理。
12. 阶段 7 最终验证通过 TypeScript、ESLint、42 个文件 / 220 项 Web 测试、32 项 document-worker 测试、3 项 loopback proxy 测试、生产构建与 `git diff --check`；Gitleaks 对 Git 历史、当前差异和提交消息均无命中。
13. 阶段 8 最终验证通过 TypeScript、ESLint、44 个文件 / 239 项 Web 测试、32 项 document-worker 测试、3 项 loopback proxy 测试、生产构建、容器健康、四档桌面/三档窄屏浏览器回归及 Gitleaks 全范围扫描。上传拖拽、分析等待、历史恢复、页签保活、导出单滚动层和真实 PDF 质量门均有独立回归证据。
14. 阶段 12 最终验证通过 TypeScript、ESLint、50 个文件 / 279 项 Web 测试、生产构建、`git diff --check`、31/31 Capability 映射、两个修改后 Skill 与插件官方校验；浏览器真实 provider 回归覆盖两轮上下文、刷新恢复、revision 绑定和应用修改，console 无 error/warn。

## 已做决策

| 决策 | 理由 |
| --- | --- |
| Next.js + TypeScript 单体先交付          | 空项目中最快形成完整、可验证的 MVP，同时保留服务拆分边界                |
| 原生 PDF 解析优先，OCR 仅 fallback       | 数字 PDF 的准确率、速度和布局信息均优于 OCR                             |
| 静态白名单 Capability Registry           | 满足 Skill 可扩展性，同时避免运行任意不可信脚本                         |
| 本地 baseline 保留给确定性评测与非严格能力 | 上传评分/建议必须由 provider gateway 返回，缺少密钥时应用可启动但不能分析 |
| 三套真实 PDF 输出统一由项目内 Typst 生成 | 预览与下载一致，便于质量审计；渲染失败直接阻断                          |
| 上传评分与建议禁止 baseline fallback     | 用户要求真实 AI 分析；AI 失败必须显式失败，不能返回模板化本地结果        |

## 遇到的错误

| 错误 | 尝试次数 | 解决方案 |
| --- | --- | --- |
| 本机初始缺少 Typst CLI 与 Docker                                 | 1        | 已下载项目内 Typst，并安装/启动 Docker CLI、`docker-compose` 与 Colima；Web/worker 最终镜像验证通过          |
| 浏览器示例 PDF 被误报损坏                                        | 2        | 定位为 Next dev server 找不到 `pdf.worker.mjs`，将 `pdfjs-dist` 设为 server external 后 `/api/demo` 恢复 200 |
| ESLint 9 找不到扁平配置                                          | 1        | 新增 `eslint.config.mjs`，组合 Next.js Core Web Vitals 与 TypeScript 规则                                    |
| 非法分块 patch 拒绝后仍触发全局替换                              | 1        | 有 patch 的建议禁止回退全文替换；路径无效时保持 AST 原样                                                     |
| Next standalone 复制 `pdfjs-dist` 时出现 ENOTDIR tracing warning | 1        | 去除重复 tracing include；本机与 Alpine 构建均零 warning，PDF.js/Canvas/API smoke 通过                       |
| 更新进度文件的 patch 上下文不匹配                                | 2        | 改为逐文件、按实际段落精确更新                                                                               |
| Browser 首次调用不存在的 `tab.logs`                              | 1        | 改用正确的 `tab.dev.logs` 完成日志工具调用诊断                                                               |
| 系统 Python 3.14 未安装 pytest                                   | 1        | 不重复使用系统解释器；改用 document-worker 已锁定的项目虚拟环境运行代理测试                                  |
| Prettier 无法推断 `.env.example` parser                          | 1        | `.env.example` 改用内容检查；其余 Markdown/YAML 用仓库 Prettier 格式化                                       |
| 代理测试用 `importlib` 装载时未登记模块                          | 1        | 在执行模块前写入 `sys.modules`，让 `dataclass` 可解析所属命名空间                                            |
| Compose 默认服务断言误计命令替换的结尾换行                       | 1        | 改用逗号归一化后的精确服务列表断言，不依赖 shell 保留尾部换行                                                |
| 多文件 patch 复用了格式化前的 Markdown 上下文                    | 2        | 拆分代码与文档 patch，并按 Prettier 后的实际表格行重新应用                                                   |
| 阶段 16 首次类型检查发现岗位/面试旧测试夹具缺少 AI 来源证明       | 1        | 保留严格必填契约，逐个更新合法夹具并增加旧 baseline/缺失来源拒绝测试                                         |
| 仓库未安装 Prettier，定向格式检查命令不可用                     | 1        | 不引入无关依赖；使用现有 ESLint、TypeScript、`git diff --check` 与测试验证                                   |
| 首轮定向测试的 routes 测试仍按旧请求和仅简历能力的 AI mock 运行  | 1        | 扩展统一成功 Provider mock 覆盖岗位/面试能力，并给面试请求补齐服务端版本绑定字段                             |
| 阶段 16 首次路由负向测试补丁使用了错误的既有测试标题上下文       | 1        | 已读取实际测试标题与精确行，拆分为小补丁应用，不覆盖阶段 15 同文件改动                                     |
| AI 岗位解释测试把单项 partial 覆盖率误写为 40                    | 1        | 按服务端公式修正为 50；单一要求的 importance 在分子分母抵消，partial 权重固定为 0.5                         |
| 环境样例严格检查发现注释仍出现密钥变量名                         | 1        | 删除该注释；密钥配置方式只在文档中指向被 Git 忽略的私有文件                                                  |
| 新增组件测试使用 `.test.tsx`，未匹配仓库的 `.test.ts` include    | 1        | 将两个无 JSX 组件测试改名为 `.test.ts`，并用显式文件列表验证实际执行                                         |
| 生产服务启动命令把 `--` 透传给 Next，导致 `-p` 被识别为目录     | 1        | 改用 `pnpm exec next start -p 3005` 直接调用 Next CLI；失败命令未启动服务或发送业务请求                       |
| 目标岗位地点被通用 PII 复检误判为候选人地址                    | 1        | 从 `jd.parse` Provider 最小 DTO 删除独立地点字段；成功后仍由服务端写回目标地点，并补隐私边界回归测试         |
| “产品经理岗位”被宽松上下文姓名复检误判                         | 1        | 将“岗位/职位”加入非人名上下文词表；保留真实姓名、地址和其他 PII 检测规则                                   |
| 岗位原因日志补丁两次与实际上下文不一致                          | 2        | 读取实际行后把代码、进度与计划拆成独立小补丁；两次失败均未改动文件                                         |
| 文件规划技能引用的 `check-complete.sh` 不存在                    | 1        | 以阶段 16 勾选、全量自动化、生产健康和真实 Provider 端到端证据作为完成依据                                 |
| Store 测试的 `reset()` 按产品语义保留历史摘要，造成跨用例残留    | 1        | `beforeEach` 在清 IndexedDB 后同步清空测试内 `recentAnalyses`，补齐状态隔离                                  |
| Next standalone 重复复制 `pdfjs-dist`，移除后又漏掉 fake worker  | 2        | 统一服务端 PDF.js loader 显式导入 worker，并补子路径类型声明；不再依赖重复 tracing include                   |
| Prettier 无法推断 Git/Docker ignore 文件 parser                  | 1        | ignore 文件保持人工审阅，并用 Docker build、`git check-ignore` 与 `git diff --check` 验证                    |
| Radix Tabs 回归测试未响应低层 `fireEvent.click`                  | 1        | 改用 `userEvent` 发送完整用户点击序列，不重复低层事件                                                        |
| `127.0.0.1:3001` 被 Next dev 拒绝跨域开发资源                    | 1        | 不修改生产配置，开发视觉回归改用同源 `localhost:3001`                                                        |
| Browser locator DOM 量测在 PDF iframe 页面超时                   | 1        | 不重复该 locator evaluate；改用可访问树、截图和无 iframe 的顶层选择器证据                                    |
| 浏览器能力不支持 `networkidle` 等待状态                          | 1        | 改用受支持的 `domcontentloaded`，随后读取 DOM 快照和具体渲染状态                                             |
| React `<details>` 类型不支持 `defaultOpen`                       | 1        | 使用合法 `open` 属性，只在质检存在警告或失败时默认展开                                                       |
| 三文件进度补丁复用旧表格上下文而失败                             | 1        | 拆分为逐文件补丁，并按当前实际行应用                                                                         |
| Browser 隔离执行环境不能构造文件拖拽事件                         | 3        | 停止重复事件注入；使用组件级完整 dragenter/dragleave 序列验证逻辑，浏览器仅复核真实页面布局与默认/最终状态   |
| 最终容器重建命中失效的 Docker Desktop credential/plugin 配置     | 1        | 使用一次性 `DOCKER_CONFIG`、Homebrew buildx 与现有 Colima socket 构建，不修改用户全局 Docker 配置            |
| Computer Use 尝试 Finder 真实拖拽时 Mac 处于锁定状态             | 1        | 不绕过系统锁；保留 Finder 实拖为人工验收项，组件事件序列覆盖拖拽状态机                                       |
| jsdom `fireEvent.dragLeave` 不保留原生坐标                       | 1        | 改用带 `dataTransfer`、`clientX` 和 `clientY` 的自定义原生拖拽事件验证真实边界判断                           |
| BSD `tar` 不支持 GNU 参数                                        | 1        | 先过滤实际存在的文件，再归档未暂存及未跟踪源码供敏感信息扫描                                                 |
| 阶段 10 三文件补丁假定了错误的 findings 标题                     | 1        | 不重复原补丁；先读取实际标题 `# 发现与决策`，再用正确上下文一次应用                                           |
| 交付审计首次读取了不存在的根 `docker-compose.yml`                | 1        | 使用 README 声明且实际存在的 `infra/docker-compose.yml` 作为权威 Compose 文件                                |
| 新增全仓 Prettier 门发现 114 个既有文件未采用统一格式            | 1        | 不引入大规模无关格式化；撤回该门并移除未接线 Prettier，继续使用 ESLint、TypeScript 与 `git diff --check`       |
| 4 个 Skill 的中文 `short_description` 少于 25 个字符             | 1        | 保留脚手架已创建的目录，不重复初始化；补足描述后用 `generate_openai_yaml.py` 生成界面元数据和资源目录          |
| `generate_openai_yaml.py` 的系统 Python 缺少 PyYAML              | 1        | 不增加全局依赖；改用脚本的 `--name` 参数绕过 frontmatter YAML 读取，继续生成确定性界面元数据                  |
| 系统 Python 运行 Skill 校验时缺少 PyYAML                         | 1        | 改用 document-worker 已锁定且包含 PyYAML 的项目虚拟环境，Skill 与插件校验均通过                              |
| 仓库已移除 Prettier，无法执行临时 Markdown `--check`             | 1        | 不重复引入未接线工具；使用 ESLint、人工审阅和 `git diff --check`，最终差异检查通过                            |
| 真实 Provider 连续验收中 `resume.suggest` 返回 HTTP 429          | 2        | 保持阶段未完成；待 Provider 限流或配额恢复后重跑三次连续验收，禁止自动重试 429、baseline 或部分结果            |

## 备注

- 外部仓库与网页内容只写入 `findings.md`，不写入本计划。
- 每个阶段完成后更新状态和测试结果。
