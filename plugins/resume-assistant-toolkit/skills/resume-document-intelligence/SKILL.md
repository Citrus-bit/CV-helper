---
name: resume-document-intelligence
description: 分析、实现、诊断或评审简历 PDF 的安全接入、原生文字与坐标提取、扫描/混合页局部 OCR、块去重、阅读顺序恢复、语义分段和 Resume AST 来源关联。处理 PDF 上传、乱码或无文字层、双栏/表格版面、解析 warning、worker 与 PDF.js 回退，或修改 document.parse、document.ocr、document.segment Capability 时使用。
---

# 简历文档智能

把 PDF 解析当作可追溯的数据工程任务。优先保留原生文字层、字体和几何信息，仅在证据表明原生提取不足时调用 OCR；不要把 OCR 当作默认或“完美”方案。

## 先读取统一入口

1. 先读取[能力映射](../resume-assistant-orchestrator/references/capability-map.md)，确认 Capability ID、数据范围、内置 fallback 和相邻 Skill。
2. 在新增或替换实现前读取[扩展协议](../resume-assistant-orchestrator/references/extension-protocol.md)，遵守 Manifest、Schema、权限、评测和回滚要求。
3. 在设计 fixture、比较候选解析器或做发布验收时读取[本 Skill 量表](references/rubric.md)。
4. 以仓库中的 TypeScript 类型、Zod Schema 和现有测试为权威；文档与代码冲突时先核实运行路径，再修正文档或实现。

## 明确任务边界

- 把 `document.parse`、`document.ocr`、`document.segment` 作为本 Skill 的唯一主能力。
- 把事实声明、评分、建议和 ATS 结论交给 `resume-evidence-review`；这里只输出可供审计的文档信号，不推断候选人事实。
- 把模板选择、Typst 编译和最终 PDF 质量门交给 `resume-layout-export`；不要做通用 PDF → LaTeX → PDF 往返。
- 保持原 PDF 不可变。只从规范化 `SourceBlock` 构建 Resume AST，并保留每个节点的 `sourceBlockIds`。
- 不宣称完整还原原稿样式、复杂表格语义、超链接关系或任意双栏阅读顺序。

## 区分页面分类与抽取模式

- 页面分类字段使用 `digital | scan | mixed`，描述单页原生文字与图像信号；它不等于整份文档的抽取模式。
- canonical Capability 输出的文档抽取模式使用 `native | mixed | ocr`。TypeScript parser 内部可能暂用 `hybrid`，但 adapter 必须在进入 canonical Schema 前归一化为 `mixed`。
- 把 `document.parse` 视为产品级文档结果入口。OCR 可以由当前 parser adapter 在其受控流程内执行，也可以独立通过 `document.ocr` 契约评测；不要假定 Registry 必须嵌套调用另一个 Capability。先从 `src/app/api/analyze/route.ts` 追踪请求编排，再核对 `src/lib/server/document-worker.ts` 的 worker 归一化、`src/lib/server/pdf.ts` 的本地解析和 `src/lib/server/analysis.ts` 的领域转换。
- 当前契约 `1.0` 的 `DocumentOcrOutputSchema.engine` 固定为 `tesseract.js`，因此 `document.ocr` 只能无缝替换兼容该语义的 Tesseract 实现。PaddleOCR 或其他引擎可先作为 `document.parse` 内部受控 adapter 评测；若要注册为独立 `document.ocr` extension，必须先版本化放宽 canonical Schema、更新 Registry 记录并证明旧客户端兼容，禁止谎报引擎。
- 页面阈值、OCR 覆盖率、相似度、warning code 和资源预算以当前代码、配置与 canonical Schema 为权威。修改任一阈值时同时更新 fixture、版本记录和两条 adapter 的兼容性测试，不在 Skill 文本中另建第二套常量。

## 执行解析流程

### 1. 校验输入与预算

1. 校验 PDF 签名、MIME、扩展名、大小、页数、加密状态和解析完整性。
2. 沿调用链传递 `AbortSignal`、deadline、trace ID 和最小数据授权；立即传播用户取消。
3. 在解压、渲染、图片区域、像素、字符、块数、OCR 并发和输出大小上设置硬上限。
4. 拒绝伪装、损坏、加密或超限文件；不要为资源超限、内容摘要不一致或取消请求执行静默 fallback。

### 2. 优先原生解析

1. 先提取每页原生文字、字符/词坐标、页面尺寸、字体信号和图片区域。
2. 根据有效文字量、覆盖范围、字符质量和图像区域把页面标为 `digital`、`scan` 或 `mixed`。
3. 对 `digital` 页禁止 OCR；把原生内容标为 `source: native`。
4. 保留原始页索引、稳定顺序、归一化 bbox、置信度和有界 style 字段。
5. 对异常编码、缺字、旋转、重叠坐标或阅读顺序歧义生成稳定 warning code，不要静默猜测。

### 3. 只对缺失区域 OCR

1. 对 `scan` 页安全渲染整页并 OCR。
2. 对 `mixed` 页优先裁取没有原生字符覆盖的图片区域；仅在 baseline 无法区域识别时整页 OCR 后做空间与文本去重。
3. 默认使用离线、本地 OCR。禁止在运行时从 CDN 下载模型，禁止把页面图像发送到未审批网络服务。
4. 归一化 OCR 块为 `source: ocr`，保留页码、bbox、置信度和引擎 warning。
5. 使用覆盖率、邻近关系、规范化文本和模糊相似度去除与原生块重复的 OCR 结果。
6. 对低置信度结果保留原文并要求人工对照，不要让 OCR 覆盖更可靠的原生文本。

### 4. 恢复阅读顺序与分段

1. 先按页处理，再结合列、y 坐标、x 坐标、字体层级和邻接关系排序。
2. 识别 `heading`、`paragraph`、`list-item`、`table`、`contact`、`footer` 和 `unknown` 角色。
3. 将连续块组织为 contact、section、body 或 footer segment；保留组成块 ID。
4. 对双栏交错、浮动侧栏、跨页条目和复杂表格降低置信度并产生 warning。
5. 生成 AST 时只引用已存在的 `SourceBlock`；禁止凭版面猜测补造日期、公司、职级、指标或技能。

## 遵守 Capability 契约

| Capability | 最大输入范围 | 必须输出的核心信号 | 本地基线边界 |
| --- | --- | --- | --- |
| `document.parse` | `original_pdf` | 页数、页面信号、原生块、warning、`native/mixed/ocr` 模式 | worker 使用 PDFium/pdfplumber；可恢复失败回退 PDF.js |
| `document.ocr` | `page_image` | OCR 文本、块、bbox、置信度、引擎 warning | 本地 Tesseract；仅用于 scan/mixed 缺失内容 |
| `document.segment` | `source_blocks` | 排序后的块、角色、语义 segment | 确定性坐标与标题规则 |

- 返回标准 `CapabilityResult<T>`：结构化 `data`、总体置信度、证据引用、warning、来源版本、耗时/用量和 fallback 标志。
- 通过 canonical Zod Schema 校验输入与输出；不要在 Skill 内另造不兼容 DTO。
- 保持数据最小化：解析实现可读原 PDF，OCR 实现只读获准页面图像，分段实现只读 SourceBlocks。
- 保持网络策略默认 `none`；候选实现若需联网，先停止接入并走扩展协议审查。
- 保留 `builtin.document.parse@1.0.0`、`builtin.document.ocr@1.0.0`、`builtin.document.segment@1.0.0` 作为可验证回滚目标。

## 处理失败与降级

- 将隔离 worker 的连接失败、超时或结构非法视为可恢复错误，并在允许时回退本机 baseline。
- 将 PDF 摘要不一致、`413`、安全拒绝和用户取消视为不可回退错误。
- 在回退结果上设置 `usedFallback: true` 并保留可向用户解释的 warning；不要丢失当前会话或 revision。
- 终止 OCR 子进程或 worker，释放页面、对象 URL 和临时资源。
- 不把“解析成功”误写成“内容完全正确”；展示低置信度块供原版 PDF 对照。

## 验证实现

1. 先添加会失败的最小 fixture，再修改实现。
2. 覆盖数字 PDF、纯扫描、mixed、双栏、表格、旋转、乱码、空页、加密、损坏、超限和取消。
3. 断言数字 PDF 不调用 OCR，mixed 不重复原生文字，所有块 bbox 合法且 ID 唯一。
4. 断言 worker 与 TypeScript fallback 产生兼容 wire shape，并保留来源和 warning。
5. 运行相关 Web 测试，例如：

   ```bash
   pnpm vitest run tests/capabilities/infrastructure-baseline.test.ts src/lib/server/document-worker.test.ts src/lib/server/ocr-merge.test.ts src/app/api/analyze/route.test.ts
   ```

6. 修改 Python worker 时运行：

   ```bash
   pytest services/document-worker/tests/test_parser.py services/document-worker/tests/test_ocr.py services/document-worker/tests/test_security.py
   ```

7. 再运行 `pnpm typecheck`、`pnpm lint` 和受影响的完整测试集。
8. 按量表人工抽检真实 PDF 预览；把召回率目标明确写成“待样本验证目标”，不要把 fixture 通过误报成生产准确率。

## 交付结果

- 列出触及的 Capability、adapter、Schema 和 fixture。
- 报告每类页面的解析决策、OCR 调用范围、去重策略、warning 与 fallback 行为。
- 报告自动化测试和人工样本结果，明确未覆盖的版面类型。
- 若结果会影响事实证据、ATS 或导出质量，路由到相邻 Skill 继续验收，不在本 Skill 内越权下结论。
