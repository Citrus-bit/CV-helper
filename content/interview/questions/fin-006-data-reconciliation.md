---
id: fin-006
industry: finance-accounting
role_family: accounting
levels: [entry, mid, senior]
difficulty: medium
type: technical
skills: [reconciliation, data-integrity, investigation]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 财务数据对账差异 / Financial reconciliation break

## 问题 / Question

**中文：** 总账与业务系统在月末出现重大差异。你会怎样定位范围、记录调整并防止未经解释的“轧差”？

**English:** The general ledger and an operating system have a material month-end difference. How would you scope, investigate, document adjustments, and prevent unexplained netting?

## 追问 / Follow-ups

- 中文：如何判断是时点、映射、重复还是遗漏？ / English: How would you distinguish timing, mapping, duplication, and omission?
- 中文：什么情况下必须升级或扩大样本？ / English: When would you escalate or expand testing?

## 优秀信号 / Strong signals

- 冻结口径并按实体、期间、交易类型和数据血缘拆解。 / Freezes definitions and decomposes by entity, period, transaction, and lineage.
- 调整保留支持材料、审批和可逆记录。 / Keeps support, approval, and reversible records for adjustments.
- 将重复差异转为自动对账和例外控制。 / Converts repeat differences into automated reconciliation and exception controls.

## 评分锚点 / Scoring anchors

- `1`：做一笔平衡分录让数字相等。 / Posts a plug entry to make totals match.
- `3`：能定位和调整差异，但预防机制有限。 / Finds and adjusts the difference with limited prevention.
- `5`：系统分层定位、评估重大性、保留审计链并修复上游控制。 / Investigates systematically, assesses materiality, preserves audit trail, and fixes upstream controls.

## 风险项 / Risks

- 用低于重大性阈值为由忽略重复差异。 / Ignores recurring differences because each is below materiality.
- 未授权修改源系统数据。 / Changes source data without authorization.
