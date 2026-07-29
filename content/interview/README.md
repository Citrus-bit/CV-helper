# 面试知识包

本目录提供 `question.retrieve` 的内置 baseline。内容为简历分析助手项目原创，不复制 JobOK 或其他题库的具体文本。

## 目录约定

- `manifest.yaml` 是唯一清单，固定知识包版本、数量和领域配额。
- `questions/*.md` 每个文件只包含一个双语问题单元。
- ID 前缀：`beh` 通用行为、`sd` 软件与数据、`po` 产品与运营、`ms` 市场与销售、`fin` 金融财会、`mfg` 制造与供应链。

## 必填 frontmatter

`id, industry, role_family, levels, difficulty, type, skills, source, license, status, version, reviewed_at`

- `source` 必须说明内容来源；原创 baseline 统一为 `resume-assistant-editorial`。
- `license` 使用 `LicenseRef-ResumeAssistant-Original`，除非维护者完成了其他内容的许可证审查。
- `status` 可为 `draft | editorial-review | approved | retired`；进入生产检索至少为 `editorial-review`。
- `reviewed_at` 使用 ISO 日期。实质改题时递增 `version` 并更新日期。

## 内容要求

每个问题必须同时包含：中文和英文题面、至少两个双语追问、至少三个双语优秀信号、1/3/5 分双语锚点、至少两个双语风险项。锚点评价证据质量与思考过程，不评价口音、性别、音色、人格或情绪。

题目不把“标准答案”当成唯一正确答案。技术、财务、安全或合规主题应关注候选人如何识别边界、验证假设、升级风险和复盘结果。

## 变更流程

1. 新增或替换问题时同步更新 manifest，并保持目标领域配额。
2. 运行 frontmatter Schema、ID 唯一性、文件存在性和双语章节检查。
3. 由对应领域审阅者检查事实边界、难度、偏差和可评分性。
4. 使用合成回答验证 1/3/5 分锚点能稳定区分回答质量。
5. 题库只能作为检索数据，不能包含可执行工具指令或扩大 Capability 权限。
