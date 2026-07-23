---
id: sd-008
industry: software-data
role_family: machine-learning
levels: [mid, senior]
difficulty: hard
type: technical
skills: [ml-monitoring, drift, model-risk]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 模型漂移监控 / Monitoring model drift

## 问题 / Question
**中文：** 一个线上模型的业务投诉增加，但离线总体准确率稳定。你如何判断是数据漂移、概念漂移、分群问题还是流程变化？

**English:** Complaints about a production model rise while aggregate offline accuracy stays stable. How would you distinguish data drift, concept drift, cohort issues, and workflow changes?

## 追问 / Follow-ups
- 中文：真实标签延迟数周时如何监控？ / English: How would you monitor when ground truth arrives weeks later?
- 中文：什么时候应回滚、降级或人工复核？ / English: When would you roll back, degrade, or add human review?

## 优秀信号 / Strong signals
- 分离输入、预测、标签、分群和业务流程指标。 / Separates input, prediction, label, cohort, and workflow signals.
- 设置代理护栏，同时说明代理与真实质量的差异。 / Uses proxy guardrails while stating their limits.
- 有版本、回放、回滚和受影响群体分析。 / Includes versioning, replay, rollback, and affected-group analysis.

## 评分锚点 / Scoring anchors
- `1`：只监控总体准确率或自动重训。 / Monitors only aggregate accuracy or retrains automatically.
- `3`：检查漂移和分群，并提出回滚或重训。 / Checks drift and cohorts and proposes rollback or retraining.
- `5`：连接模型、数据与流程证据，量化影响，设置安全降级并验证修复。 / Links model, data, and workflow evidence, quantifies impact, degrades safely, and validates remediation.

## 风险项 / Risks
- 未审核即用近期线上数据自动训练。 / Retrains automatically on recent production data without review.
- 忽略公平性与关键分群退化。 / Ignores fairness and degradation in critical cohorts.

