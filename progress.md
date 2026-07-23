# 进度日志

## 会话：2026-07-23（本地桌面导航、历史与 AI）

### 阶段 6：本地桌面导航、设备历史与 AI 适配

- **状态：** in_progress
- **开始时间：** 2026-07-23
- 已确认阶段 6 前的工程基线通过；其测试数量不复用为当前最终结果。
- 已将工作拆分为桌面 UI/IndexedDB、AI provider gateway、本地 document worker 三条并行实现线。
- 已完成增量结构审计并实施：移动端工作台已移除；AI provider gateway 已接入分析、JD 与面试能力，未配置新 Key 时仍运行 baseline。
- 用户随后暂停 Vercel 部署准备；已停止 Hosted/Blob 实现并要求清除本轮 Vercel 专属依赖，只保留本地运行路径。
- 已完成一次全仓旧 Key 泄漏扫描（无命中）。
- 已同步三份长期文档中的本地版边界：1024px 桌面门、IndexedDB 24 小时历史、九项 AI 静态能力名单与确定性安全硬门。
- 已清除 `@vercel/blob`，本轮不实施 Vercel；`8001` OCR/Typst worker health 正常，`3000` 仍是待最终重建的旧 Docker Web 镜像。
- 当前并行合并态已通过一次 `pnpm typecheck`；最近记录已补显式 AI/规则摘要来源和无长度变化时的 PDF 剥离持久化。
- 桌面边界/历史/客户端会话 4 个新增测试文件共 15 项通过，覆盖恢复、删除、清空、v2→v3、请求取消、PDF 重新附加和窄屏不挂载；全仓 ESLint 通过。
- 安全约束：不使用、不测试、不写入对话中暴露的旧 API Key；只接受后续配置的新服务端 Secret。
- Compose 已改为默认只启动 Web/worker/loopback，PostgreSQL、Redis、MinIO 放入 `future-infra` profile；AI 环境变量已透传且默认 `baseline`，没有运行时 allowlist 扩权入口。
- 浏览器已在 1024/1280/1440/1920px 验证首页与工作区无横向滚动；375/768/1023px 只显示电脑提示且不挂载工作台。
- 示例中顶栏与侧栏品牌返回均保存历史；历史恢复、当前会话删除、单条删除、清空取消/确认均实测通过，控制台无应用 error/warn。
- 本地 `8001/health` 返回 Typst/Tesseract 可用；`3001/api/capabilities` 在无新 Key 时全部 baseline。
- Compose 默认服务精确验证为 `worker,web,worker-loopback`，`future-infra` profile 配置也可解析；loopback 的参数边界、转发/空闲关闭和超额连接拒绝共 3 项测试通过。
- 待完成：全量测试、本地生产构建、Compose 重建与最终测试数量回填。

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
  - 完成 `.codex/PROJECT.md`、PRD、架构文档和 30 项 Skill Registry。
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
| 2026-07-22 | 分析骨架屏出现重复 React key `85`                                                      | 1        | key 改为稳定的 `index-width` 组合，并加入控制台零错误验收                                                             |
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
| 2026-07-23 | Browser 首次调用不存在的 `tab.logs`                                                    | 1        | 改用 `tab.dev.logs`，成功完成控制台 error/warn 复核                                                                   |
| 2026-07-23 | 系统 Python 3.14 未安装 pytest                                                         | 1        | 不再重复使用系统解释器，改用 document-worker 已锁定的项目虚拟环境                                                     |
| 2026-07-23 | Prettier 无法为 `.env.example` 推断 parser                                             | 1        | 环境样例改用内容检查，其余 Markdown/YAML 由仓库 Prettier 格式化                                                       |
| 2026-07-23 | 代理测试通过 `importlib` 装载时未登记模块                                              | 1        | 执行前写入 `sys.modules`，使 `dataclass` 正确解析模块命名空间                                                         |
| 2026-07-23 | Compose 默认服务断言误计命令替换的结尾换行                                             | 1        | 改用逗号归一化后的服务列表断言，不再依赖 shell 保留尾部换行                                                           |
| 2026-07-23 | 多文件 patch 复用了格式化前的 Markdown 上下文                                          | 2        | 拆分代码与文档 patch，并按 Prettier 后的实际表格行重新应用                                                            |
| 2026-07-23 | 环境样例严格检查发现注释仍出现密钥变量名                                               | 1        | 删除该注释；密钥配置方式只在文档中指向被 Git 忽略的私有文件                                                           |

## 五问重启检查

| 问题           | 答案                                           |
| -------------- | ---------------------------------------------- |
| 我在哪里？     | 阶段 6：本地桌面导航、历史与 AI 适配           |
| 我要去哪里？   | 完成全量验证、容器重建和当前测试结果回填       |
| 目标是什么？   | 交付可运行、可扩展、证据约束的简历分析助手 MVP |
| 我学到了什么？ | 见 `findings.md`                               |
| 我做了什么？   | 见上方记录                                     |
