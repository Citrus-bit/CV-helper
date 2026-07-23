# 任务计划：实现简历分析助手可扩展 MVP

## 目标

从空目录交付一个可运行、可测试的简历分析助手 Web MVP，覆盖 PDF 上传与原生解析、证据约束建议、JD 匹配、三模板预览导出、语音面试，以及可替换的 Capability/Skill 契约。

## 当前阶段

阶段 7：最终交付审计与完整作品封装（进行中）

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

- [ ] 将 PRD、架构、Capability、页面组件和测试证据逐项映射，识别占位与未证明项
- [ ] 补齐功能、交互、文档、安全及本地运行缺口
- [ ] 重走真实 PDF、建议审阅、JD、面试、三模板预览和导出质量门
- [ ] 完成桌面视觉、键盘/无障碍、安全、性能、构建和全量测试回归
- [ ] 清理不应继续跟踪的生成物，整理可提交作品与最终交付说明
- **状态：** in_progress

## 关键问题

1. 项目内 Typst 0.15.1、Poppler 和本地中英文 Tesseract 模型已安装。Docker CLI、`docker-compose` 和 Colima 已安装并启动；`docker compose` 子命令当前不可用，容器验收使用 `docker-compose`，Web/worker 最终镜像均已构建并通过 smoke。
2. 用户提供的旧 AI Key 已视为泄露且禁止使用；provider gateway 只读取新的服务端环境变量，未配置时必须完整回退 baseline。
3. 用户已临时暂停 Vercel 部署；本阶段不保留 Private Blob、Hosted API、Vercel 配置或云端 worker 半成品。
4. 阶段 6 最终验证通过：TypeScript、ESLint、33 个文件 / 179 项 Web 测试、32 项 document-worker 测试、3 项 loopback proxy 测试及 `git diff --check` 全部通过；其中健康路由 4 项测试通过。
5. Compose 默认服务已精确验证为 Web、worker 和 loopback；`future-infra` profile 配置可解析。loopback 的 3 项资源边界测试通过。
6. 当前 Git 只有一个已推送提交；常见 API Key、私钥和带值 Secret 模式扫描无命中。初始提交已跟踪 6 个合成 PDF 与 5 个 Python 字节码文件；它们不是用户数据，但后续提交应删除这些生成物，新增忽略规则只能阻止新文件，不能改写已推送历史。
7. 当前本地 Web 镜像为 `sha256:b0353ce369df9bfbb8efa9711b51d4bae5dc45a0e2e7efd9884f097439419e03`；生产构建包含 `/api/health`，首页、能力接口、示例接口与健康接口均已通过容器 smoke。
8. 首页与工作台在 1024×768、1280×720、1440×900、1920×1080 均无横向滚动；375×812、768×900、1023×768 仅显示电脑浏览器提示。体验示例、顶栏返回、历史恢复和侧栏品牌返回均通过。
9. 本地 `/api/health` GET 返回 200，只暴露 document、AI、storage 的 `ready/degraded` 与 mode；当前分别为 `isolated/ready`、`baseline/ready`、`client_local/ready`。

## 已做决策

| 决策                                     | 理由                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| Next.js + TypeScript 单体先交付          | 空项目中最快形成完整、可验证的 MVP，同时保留服务拆分边界                |
| 原生 PDF 解析优先，OCR 仅 fallback       | 数字 PDF 的准确率、速度和布局信息均优于 OCR                             |
| 静态白名单 Capability Registry           | 满足 Skill 可扩展性，同时避免运行任意不可信脚本                         |
| 本地 baseline + 默认关闭的扩展入口       | 没有密钥也可完整体验；未来 provider 通过隔离 gateway 接入，不改业务模型 |
| 三套真实 PDF 输出统一由项目内 Typst 生成 | 预览与下载一致，便于质量审计；渲染失败直接阻断                          |

## 遇到的错误

| 错误                                                             | 尝试次数 | 解决方案                                                                                                     |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
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
| 环境样例严格检查发现注释仍出现密钥变量名                         | 1        | 删除该注释；密钥配置方式只在文档中指向被 Git 忽略的私有文件                                                  |
| 新增组件测试使用 `.test.tsx`，未匹配仓库的 `.test.ts` include    | 1        | 将两个无 JSX 组件测试改名为 `.test.ts`，并用显式文件列表验证实际执行                                         |
| Store 测试的 `reset()` 按产品语义保留历史摘要，造成跨用例残留    | 1        | `beforeEach` 在清 IndexedDB 后同步清空测试内 `recentAnalyses`，补齐状态隔离                                  |
| Next standalone 重复复制 `pdfjs-dist`，移除后又漏掉 fake worker  | 2        | 统一服务端 PDF.js loader 显式导入 worker，并补子路径类型声明；不再依赖重复 tracing include                   |
| Prettier 无法推断 Git/Docker ignore 文件 parser                  | 1        | ignore 文件保持人工审阅，并用 Docker build、`git check-ignore` 与 `git diff --check` 验证                    |
| Radix Tabs 回归测试未响应低层 `fireEvent.click`                  | 1        | 改用 `userEvent` 发送完整用户点击序列，不重复低层事件                                                       |

## 备注

- 外部仓库与网页内容只写入 `findings.md`，不写入本计划。
- 每个阶段完成后更新状态和测试结果。
