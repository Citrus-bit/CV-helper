---
id: sd-010
industry: software-data
role_family: engineering
levels: [entry, mid, senior]
difficulty: medium
type: behavioral
skills: [code-review, collaboration, engineering-quality]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 代码评审分歧 / Code review disagreement

## 问题 / Question
**中文：** 请讲一次代码评审中双方对实现方式有持续分歧的经历。你如何区分必须修复的问题和个人偏好？

**English:** Tell me about a persistent disagreement in code review. How did you separate required changes from personal preferences?

## 追问 / Follow-ups
- 中文：什么情况下你会同步讨论或请第三方裁决？ / English: When would you switch to a live discussion or seek a third opinion?
- 中文：这次分歧是否促成了团队规范变化？ / English: Did the disagreement lead to a team-standard change?

## 优秀信号 / Strong signals
- 依据正确性、安全、可维护性和团队规范分类。 / Classifies concerns by correctness, security, maintainability, and standards.
- 提供可复现证据或替代实现，而非只下结论。 / Offers reproducible evidence or alternatives rather than assertions.
- 及时收敛讨论并把重复问题沉淀为工具或规范。 / Converges promptly and turns recurring issues into tooling or guidance.

## 评分锚点 / Scoring anchors
- `1`：依赖资历、语气升级或无限阻塞合并。 / Relies on seniority, escalates tone, or blocks indefinitely.
- `3`：能理性讨论并达成决定，但团队学习有限。 / Reaches a reasoned decision with limited team learning.
- `5`：以风险和证据分层处理、保护合作，并减少未来重复争论。 / Resolves by risk and evidence, preserves collaboration, and prevents repeat debate.

## 风险项 / Risks
- 把评审速度置于安全或正确性之上。 / Prioritizes review speed over safety or correctness.
- 在公开渠道针对个人而非代码。 / Targets a person rather than the code publicly.

