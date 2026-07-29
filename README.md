# 简历分析助手

面向电脑浏览器的简历分析工作台。它优先在本地读取 PDF 原生文字层，只对扫描页或缺失区块调用 OCR；随后建立 Resume AST 与证据关系，并强制使用真实 AI 完成简历评分和逐条建议，再提供三套真实 PDF 预览、导出质检和模拟面试。用户选完 PDF 后可选填一份 JD，同一次分析会额外生成证据约束的岗位分支。

当前版本只支持宽度不小于 1024px 的桌面浏览器。Vercel、账号、云端对象存储和长期历史不在本地 MVP 范围内。

## 已实现能力

- PDF 原生解析、必要 OCR、低置信度提醒和原稿定位。
- 来自 `resume.score@2.x+` 的六维质量评分，以及来自 `resume.suggest@2.x+` 的证据约束修改建议。
- 来自 `jd.parse@2.x+` 与 `job.match@2.x+` 的可选 JD 解析、要求-证据-缺口矩阵和岗位定制分支；当前 UI 在选定 PDF 后、提交分析前收集 JD，并在简历区提供通用版/岗位版切换，不再设置独立岗位页面。
- `Professional`、`Minimal`、`Compact` 三套 Typst 模板。
- 原版/新版真实 PDF 预览、导出质量报告和下载硬门。
- 60 个双语面试问题单元，以及由 `interview.plan@2.x+`、`answer.evaluate@2.x+`、`answer.coach@2.x+` 驱动的出题、回答评审和教练反馈。
- 当前设备最近分析记录；24 小时到期，最多 10 条、总计最多 50 MB。
- 版本化的 31 项 Capability Registry；简历分析、持续编辑、岗位分析和面试推理都禁止 baseline 冒充真实 AI。

## 环境要求

- Node.js `22.x`
- pnpm `10.26.2`
- macOS 或 Linux
- 桌面版 Chrome 或 Safari
- 可选：Docker Engine 与 Compose，用于隔离 PDFium/pdfplumber/Tesseract worker

## 本地启动

### 本地 Node 运行

该路径不要求 Docker 或数据库。解析运行在 Next.js Node 进程中，使用 PDF.js 原生提取和离线 Tesseract.js 补充 OCR；上传分析仍需要下节的服务端 AI 配置。

```bash
pnpm install --frozen-lockfile
./scripts/bootstrap-tools.sh
pnpm dev
```

打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。`bootstrap-tools.sh` 会校验后下载 Typst `0.15.1` 与本地中英文 OCR 模型到被 Git 忽略的 `.tools/`。

### 隔离文档 worker

Docker 模式默认启动 Web、禁网文档 worker 和仅绑定 `127.0.0.1` 的 loopback proxy；PostgreSQL、Redis 和 MinIO 仍属于后续基础设施，不会默认启动。

```bash
docker compose -f infra/docker-compose.yml up --build
```

若本机使用独立 Compose 二进制，请把 `docker compose` 替换为 `docker-compose`。默认入口仍是 [http://127.0.0.1:3000](http://127.0.0.1:3000)，worker 健康检查可通过 [http://127.0.0.1:8001/health](http://127.0.0.1:8001/health) 查看。

## 用户分析流程必需的 AI 配置

应用在没有 Key 时仍可启动，但会禁用需要真实 AI 的 PDF 上传分析；体验示例使用隔离的本地模板，仍可直接查看。先撤销任何曾在聊天、终端输出或提交中暴露的旧 Key，再把轮换后的新 Key 写入被忽略的 `.env.local`：

```dotenv
AI_PROVIDER=provider_gateway
AI_API_BASE=https://yunwu.ai/v1
AI_API_KEY=<rotated-server-only-key>
AI_MODEL=gpt-5.5
```

其余本地配置项及默认值见 [`.env.example`](.env.example)，包括四类 AI 请求限流、反向代理信任开关、文档 worker OCR provider 和 Typst 路径。Docker 模式使用仓库根部被忽略的 `.env`，实际透传项以 [`infra/docker-compose.yml`](infra/docker-compose.yml) 为准。Key 只能进入服务端环境，不要添加 `NEXT_PUBLIC_` 前缀，也不要写入代码、README、`.env.example` 或日志。

AI 只接收 10 项白名单能力的最小化 DTO。真实简历评分与建议、持续编辑、证据补写、JD 解析、岗位匹配、面试计划、回答评估和教练反馈都必须获得各自 `@2.x+` 结果；未配置、超时、限流、网络失败、非法结构或事实检查失败时，对应用户操作直接失败，不返回 baseline 模板或部分 AI 结果。体验示例是显式标记且不持久化的本地模板会话，不会进入真实分析、岗位匹配、面试或 AI 对话链路。PDF 解析、OCR、证据图、PII 清理、ATS、题库检索、渲染与导出审计是确定性基础设施，不会冒充 AI 推理。

用户修改当前 Resume AST 后，旧 AI 结果会进入 `stale/refreshing` 状态；只有 `/api/resume-analysis` 为同一 ID/revision 返回新的评分与建议后才重新标记为 `fresh`。等待或失败期间不会展示本地评分，JD 匹配和模拟面试也会保持禁用。

## 数据与隐私

- 活动会话保存在标签页级 `sessionStorage`。
- 最近分析和可选原 PDF 保存在当前浏览器的 IndexedDB，24 小时到期；应用运行期间或下次打开时执行物理清理。
- 新记录只有在评分与建议都来自当前 revision 的 `@2.x+` AI 时才会写入。旧 baseline 记录保留并标为“旧版本地分析”，有原 PDF 时可重新提交 AI，没有原 PDF 时要求重新上传。
- 首页支持删除单条记录和“清空本机记录”；清空会释放对象 URL 并移除当前会话与本地历史。
- 浏览器语音识别不创建应用侧音频文件；用户可在提交评审前编辑转写文字。
- 联系方式等无关 PII 会在进入外部 AI 前脱敏；日志不记录简历、JD、回答正文、完整提示或密钥。
- 对话中曾出现过的 Key 应视为泄露并立即在供应商后台撤销。

## 导出保证

下载复用用户实际预览过的 PDF 二进制。服务器自动审计只以当前最新 revision 的 Resume AST 为内容基准；原稿和历史版本仅供用户人工对照，不参与自动质量分。导出固定使用 Compact 模板，并且必须通过单页检查；内容无法自然排入一页时会阻断下载，避免通过裁切或缩小字号强行压缩。只有服务器审计、浏览器首屏像素检查、原稿对照和用户确认全部通过时才允许下载。任何裁切、重叠、缺字、当前内容遗漏、字体、搜索性、ATS 顺序、页数或哈希检查失败都会阻断导出。

自动检查不能替代审美判断，因此产品提供原版与新版真实 PDF 切换对照，而不承诺对所有输入都自动生成主观上更美的版本。

## 验证命令

```bash
pnpm typecheck
pnpm lint
pnpm docs:check
pnpm test
pnpm build
python3 -m pytest services/document-worker/tests
python3 -m pytest infra/tests
git diff --check
```

Python 测试需要先安装对应锁定依赖；Docker 构建会在镜像内安装运行依赖。提交前还应检查 `git status`，确认 `.env*`、用户 PDF、录音、`.tools/`、测试输出和 Python 缓存未进入版本控制。

## 文档

- [产品需求](docs/PRD.md)
- [技术架构](docs/ARCHITECTURE.md)
- [行业领域指导上下文](docs/DOMAIN_GUIDANCE.md)
- [Codex 项目约束与 Skill Registry](.codex/PROJECT.md)
- [统一 Codex Skill 套件入口](plugins/resume-assistant-toolkit/skills/resume-assistant-orchestrator/SKILL.md)
- [31 项 Capability 归属映射](plugins/resume-assistant-toolkit/skills/resume-assistant-orchestrator/references/capability-map.md)
- [面试知识包说明](content/interview/README.md)

项目借鉴 [JobOK](https://github.com/GresonKwan/JobOK) 的证据链、JD 映射和面试一致性思路，但代码、提示、题库、模板和交互均为独立实现。
