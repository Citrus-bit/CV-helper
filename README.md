# 简历分析助手

面向电脑浏览器的简历分析工作台。它优先在本地读取 PDF 原生文字层，只对扫描页或缺失区块调用 OCR；随后建立 Resume AST 与证据关系，并强制使用真实 AI 完成简历评分和逐条建议，再提供 JD 证据匹配、三套真实 PDF 预览、导出质检和模拟面试。

当前版本只支持宽度不小于 1024px 的桌面浏览器。Vercel、账号、云端对象存储和长期历史不在本地 MVP 范围内。

## 已实现能力

- PDF 原生解析、必要 OCR、低置信度提醒和原稿定位。
- 来自 `resume.score@2.x+` 的六维质量评分，以及来自 `resume.suggest@2.x+` 的证据约束修改建议。
- 一个可恢复的 JD/职位元信息草稿、要求-证据-缺口矩阵和岗位定制分支。
- `Professional`、`Minimal`、`Compact` 三套 Typst 模板。
- 原版/新版真实 PDF 预览、导出质量报告和下载硬门。
- 60 个双语面试问题单元、设备检查、浏览器语音转文字、两轮追问和可恢复的回答评审。
- 当前设备最近分析记录；24 小时到期，最多 10 条、总计最多 50 MB。
- 版本化的 31 项 Capability Registry；上传评分、上传建议和持续 AI 编辑对话禁止 baseline 冒充真实 AI。

## 环境要求

- Node.js `22.x`
- pnpm `10.26.2`
- macOS 或 Linux
- 桌面版 Chrome 或 Safari
- 可选：Docker Engine 与 Compose，用于隔离 PDFium/pdfplumber/Tesseract worker

## 本地启动

### 本地 Node 运行

该路径不要求 Docker或数据库。解析运行在 Next.js Node 进程中，使用 PDF.js 原生提取和离线 Tesseract.js 补充 OCR；上传分析仍需要下节的服务端 AI 配置。

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

## 上传分析必需的 AI 配置

应用在没有 Key 时仍可启动，但会禁用 PDF 上传和体验示例，并明确说明不会提供本地模板分析。先撤销任何曾在聊天、终端输出或提交中暴露的旧 Key，再把轮换后的新 Key 写入被忽略的 `.env.local`：

```dotenv
AI_PROVIDER=provider_gateway
AI_API_BASE=https://yunwu.ai/v1
AI_API_KEY=<rotated-server-only-key>
AI_MODEL=gpt-5.5
```

Docker 模式使用仓库根部被忽略的 `.env`，变量名相同。Key 只能进入服务端环境，不要添加 `NEXT_PUBLIC_` 前缀，也不要写入代码、README、`.env.example` 或日志。

AI 只接收 10 项白名单能力的最小化 DTO。用户上传和体验示例中的 `resume.score`、`resume.suggest` 必须同时获得 `@2.x+` 结果；未配置、超时、限流、网络失败、非法结构或事实检查失败时，整个请求失败，不返回本地评分、模板建议或部分 AI 结果。`resume.chat` 同样禁止固定 baseline 冒充回复；本轮未要求改造的 JD、岗位匹配、双语改写和面试能力仍保留原兼容策略。PDF 解析、OCR、证据图、PII 清理、ATS、渲染与导出审计不会交给外部模型。

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

下载复用用户实际预览过的 PDF 二进制。只有服务器审计、浏览器首屏像素检查、原稿对照和用户确认全部通过时才允许下载；任何裁切、重叠、缺字、内容遗漏、字体、搜索性、ATS 顺序或哈希检查失败都会阻断导出。

自动检查不能替代审美判断，因此产品提供原版与新版真实 PDF 对照，而不承诺对所有输入都自动生成主观上更美的版本。

## 验证命令

```bash
pnpm typecheck
pnpm lint
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
- [Codex 项目约束与 Skill Registry](.codex/PROJECT.md)
- [统一 Codex Skill 套件入口](plugins/resume-assistant-toolkit/skills/resume-assistant-orchestrator/SKILL.md)
- [31 项 Capability 归属映射](plugins/resume-assistant-toolkit/skills/resume-assistant-orchestrator/references/capability-map.md)
- [面试知识包说明](content/interview/README.md)

项目借鉴 [JobOK](https://github.com/GresonKwan/JobOK) 的证据链、JD 映射和面试一致性思路，但代码、提示、题库、模板和交互均为独立实现。
