---
id: sd-002
industry: software-data
role_family: engineering
levels: [mid, senior]
difficulty: hard
type: system-design
skills: [api-design, compatibility, tradeoffs]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# API 演进取舍 / API evolution trade-offs

## 问题 / Question
**中文：** 一个被多个客户端使用的 API 需要改变数据模型。请说明你如何设计兼容、迁移、错误语义和退场计划。

**English:** An API used by several clients needs a data-model change. Explain how you would handle compatibility, migration, error semantics, and retirement.

## 追问 / Follow-ups
- 中文：如何处理无法同步升级的客户端？ / English: How would you handle clients that cannot upgrade together?
- 中文：哪些指标决定旧版本可以下线？ / English: What metrics determine when the old version can be retired?

## 优秀信号 / Strong signals
- 明确消费者、契约、不变量和失败模式。 / Identifies consumers, contracts, invariants, and failure modes.
- 设计版本化、幂等、可观测和回滚路径。 / Designs versioning, idempotency, observability, and rollback.
- 以实际采用率而非日期单独决定退场。 / Uses actual adoption, not a date alone, for retirement.

## 评分锚点 / Scoring anchors
- `1`：直接破坏旧客户端或只说“发公告”。 / Breaks clients directly or relies only on an announcement.
- `3`：有版本与迁移计划，但失败语义或监控不完整。 / Has versioning and migration with incomplete errors or monitoring.
- `5`：覆盖契约、双轨迁移、观测、回滚、安全退场和所有权。 / Covers contracts, dual-run migration, telemetry, rollback, safe retirement, and ownership.

## 风险项 / Risks
- 无界限地长期维护所有版本。 / Commits to supporting every version indefinitely.
- 忽略鉴权、隐私或重放风险。 / Ignores authorization, privacy, or replay risks.

