# 任务计划：实现简历分析助手可扩展 MVP

## 目标

从空目录交付一个可运行、可测试的简历分析助手 Web MVP，覆盖 PDF 上传与原生解析、证据约束建议、JD 匹配、三模板预览导出、语音面试，以及可替换的 Capability/Skill 契约。

## 当前阶段

阶段 6：本地桌面版、历史与 AI 网关（进行中）

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
- [x] 修复视觉、交互和控制台问题
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
- [ ] 完成全量测试、本地生产构建与容器重建
- **状态：** in_progress

## 关键问题

1. 项目内 Typst 0.15.1、Poppler 和本地中英文 Tesseract 模型已安装。Docker CLI、`docker-compose` 和 Colima 已安装并启动；`docker compose` 子命令当前不可用，容器验收使用 `docker-compose`，Web/worker 最终镜像均已构建并通过 smoke。
2. 用户提供的旧 AI Key 已视为泄露且禁止使用；provider gateway 只读取新的服务端环境变量，未配置时必须完整回退 baseline。
3. 用户已临时暂停 Vercel 部署；本阶段不保留 Private Blob、Hosted API、Vercel 配置或云端 worker 半成品。
4. 阶段 6 的浏览器功能回归已完成；最终 TypeScript、Vitest、worker pytest、生产构建和 Compose 数量仍待本轮统一验证，不沿用上一版统计。
5. Compose 默认服务已精确验证为 Web、worker 和 loopback；`future-infra` profile 配置可解析。loopback 的 3 项资源边界测试通过。

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
| Browser 首次调用不存在的 `tab.logs`                              | 1        | 改用正确的 `tab.dev.logs`，控制台复核成功                                                                    |
| 系统 Python 3.14 未安装 pytest                                   | 1        | 不重复使用系统解释器；改用 document-worker 已锁定的项目虚拟环境运行代理测试                                  |
| Prettier 无法推断 `.env.example` parser                          | 1        | `.env.example` 改用内容检查；其余 Markdown/YAML 用仓库 Prettier 格式化                                       |
| 代理测试用 `importlib` 装载时未登记模块                          | 1        | 在执行模块前写入 `sys.modules`，让 `dataclass` 可解析所属命名空间                                            |
| Compose 默认服务断言误计命令替换的结尾换行                       | 1        | 改用逗号归一化后的精确服务列表断言，不依赖 shell 保留尾部换行                                                |
| 多文件 patch 复用了格式化前的 Markdown 上下文                    | 2        | 拆分代码与文档 patch，并按 Prettier 后的实际表格行重新应用                                                   |
| 环境样例严格检查发现注释仍出现密钥变量名                         | 1        | 删除该注释；密钥配置方式只在文档中指向被 Git 忽略的私有文件                                                  |

## 备注

- 外部仓库与网页内容只写入 `findings.md`，不写入本计划。
- 每个阶段完成后更新状态和测试结果。
