---
id: sd-004
industry: software-data
role_family: engineering
levels: [mid, senior]
difficulty: hard
type: technical-behavioral
skills: [refactoring, risk-management, testing]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 高风险遗留系统重构 / Refactoring a risky legacy system

## 问题 / Question

**中文：** 请讲一次你改造缺少测试、文档或清晰边界的遗留系统。你如何控制行为变化和交付风险？

**English:** Tell me about changing a legacy system with weak tests, documentation, or boundaries. How did you control behavioral and delivery risk?

## 追问 / Follow-ups

- 中文：你先建立了哪些特征测试或观测？ / English: What characterization tests or telemetry did you establish first?
- 中文：你如何决定停止重构而交付业务价值？ / English: How did you decide when to stop refactoring and ship value?

## 优秀信号 / Strong signals

- 先识别真实行为、依赖和变更热点。 / Maps actual behavior, dependencies, and change hotspots first.
- 使用小步迁移、双写/影子或功能开关降低风险。 / Uses incremental migration, shadowing, or flags to reduce risk.
- 将技术改善与缺陷率、交付速度或运营成本关联。 / Connects technical work to defects, delivery, or operating cost.

## 评分锚点 / Scoring anchors

- `1`：大爆炸重写且无兼容或回滚计划。 / Proposes a big-bang rewrite without compatibility or rollback.
- `3`：逐步重构并补测试，但价值或退出标准不清楚。 / Refactors incrementally and adds tests but lacks value or exit criteria.
- `5`：以行为基线、可逆迁移和业务指标持续验证，并控制范围。 / Uses behavioral baselines, reversible migration, business metrics, and disciplined scope.

## 风险项 / Risks

- 把个人技术偏好包装成业务必要性。 / Frames a personal technology preference as a business necessity.
- 忽略数据迁移和运维人员。 / Ignores data migration and operators.
