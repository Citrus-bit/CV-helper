---
id: ms-010
industry: marketing-sales
role_family: marketing
levels: [mid, senior]
difficulty: hard
type: technical-case
skills: [attribution, analytics, experimentation]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 多渠道归因不确定性 / Multi-channel attribution uncertainty

## 问题 / Question

**中文：** 搜索、内容、活动和销售触达都声称促成同一批客户。数据标识不完整时，你如何支持预算决策？

**English:** Search, content, events, and sales outreach all claim the same customers. With incomplete identifiers, how would you support budget decisions?

## 追问 / Follow-ups

- 中文：你会如何表达模型无法回答的部分？ / English: How would you communicate what the model cannot answer?
- 中文：哪些增量实验在实际业务中可行？ / English: Which incrementality tests are operationally feasible?

## 优秀信号 / Strong signals

- 说明触点归因、相关性和增量因果的区别。 / Distinguishes touch attribution, correlation, and incremental causality.
- 结合数据质量、敏感性分析和地区/时间留出实验。 / Combines data-quality review, sensitivity analysis, and geo/time holdouts.
- 用区间和边际决策而非伪精确单一数字。 / Uses ranges and marginal decisions rather than false precision.

## 评分锚点 / Scoring anchors

- `1`：把最后触点报告视为真实贡献。 / Treats last-touch reporting as true contribution.
- `3`：比较多个模型并承认限制，但实验计划有限。 / Compares models and states limits with limited experimental design.
- `5`：三角验证观测与实验、量化不确定性，并使预算调整可学习。 / Triangulates observation and experiments, quantifies uncertainty, and makes budget changes learnable.

## 风险项 / Risks

- 为提高匹配率而违反隐私规则拼接身份。 / Violates privacy rules to improve identity matching.
- 用模型复杂度掩盖脆弱假设。 / Uses model complexity to hide fragile assumptions.
