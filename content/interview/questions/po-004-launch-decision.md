---
id: po-004
industry: product-operations
role_family: product
levels: [mid, senior]
difficulty: hard
type: situational
skills: [launch-management, risk, decision-making]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 上线或延期 / Launch or delay

## 问题 / Question

**中文：** 重要发布日期将至，核心功能完成，但监控不足且一个低概率问题可能造成高影响。你如何作出上线决定？

**English:** A major launch date is near. Core functionality is ready, but monitoring is weak and a low-probability issue could have high impact. How do you decide?

## 追问 / Follow-ups

- 中文：哪些条件属于不可妥协的上线门槛？ / English: Which conditions are non-negotiable launch gates?
- 中文：如何设计灰度、回滚和决策负责人？ / English: How would you design rollout, rollback, and decision ownership?

## 优秀信号 / Strong signals

- 量化影响、可检测性、可逆性和暴露范围。 / Quantifies impact, detectability, reversibility, and exposure.
- 提出灰度、限流、人工兜底和清晰停止条件。 / Proposes staged rollout, limits, manual fallback, and stop conditions.
- 明确最终决策权和用户沟通。 / Clarifies final decision rights and user communication.

## 评分锚点 / Scoring anchors

- `1`：只因日期已承诺就全量上线。 / Launches fully because the date was promised.
- `3`：识别风险并建议灰度或延期，但门槛不够具体。 / Identifies risk and suggests staging or delay with vague gates.
- `5`：以风险矩阵和硬门槛决策，限定暴露、实时观测且可快速回滚。 / Decides with risk and hard gates, limits exposure, observes live, and can roll back quickly.

## 风险项 / Risks

- 把“低概率”误解为无需处理。 / Treats low probability as no need to act.
- 在没有验证恢复路径时依赖回滚。 / Relies on an untested rollback.
