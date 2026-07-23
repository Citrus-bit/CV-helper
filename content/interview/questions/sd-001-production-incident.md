---
id: sd-001
industry: software-data
role_family: engineering
levels: [mid, senior]
difficulty: hard
type: technical-behavioral
skills: [incident-response, observability, reliability]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 生产事故处置 / Production incident response

## 问题 / Question
**中文：** 请讲一次你参与处理生产事故的经历。你如何在信息不完整时止损、验证恢复并推动复盘？

**English:** Describe a production incident you handled. How did you contain impact, verify recovery, and drive learning with incomplete information?

## 追问 / Follow-ups
- 中文：哪个指标让你判断可以恢复流量？ / English: Which signal told you it was safe to restore traffic?
- 中文：事故期间你如何分配技术处置与对外沟通？ / English: How did you divide technical response and communication?

## 优秀信号 / Strong signals
- 先保护用户并采用可逆的缓解措施。 / Protects users first with reversible mitigation.
- 区分相关性与根因，以时间线和观测验证假设。 / Separates correlation from cause and tests hypotheses with telemetry.
- 复盘聚焦系统条件、所有者和截止时间。 / Produces system-focused actions with owners and deadlines.

## 评分锚点 / Scoring anchors
- `1`：凭直觉改生产环境，没有验证或沟通。 / Changes production by intuition without validation or communication.
- `3`：恢复了服务并找到可能原因，但验证或跟进有限。 / Restores service and finds a likely cause with limited validation or follow-through.
- `5`：有序止损、证据化诊断、验证恢复，并关闭高价值复盘行动。 / Contains systematically, diagnoses with evidence, verifies recovery, and closes high-value actions.

## 风险项 / Risks
- 泄露真实客户、漏洞或内部拓扑。 / Reveals customer data, vulnerabilities, or internal topology.
- 把事故完全归咎于某个人。 / Attributes the incident entirely to one person.

