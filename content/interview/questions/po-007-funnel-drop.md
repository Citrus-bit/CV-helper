---
id: po-007
industry: product-operations
role_family: growth-operations
levels: [entry, mid, senior]
difficulty: medium
type: case
skills: [funnel-analysis, experimentation, diagnosis]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 漏斗突然下滑 / Sudden funnel decline

## 问题 / Question
**中文：** 简历上传到分析完成的转化率一周内下降 15%，其他总量稳定。你会按什么顺序排查？

**English:** Conversion from resume upload to completed analysis drops 15% in one week while overall volume is stable. In what order would you investigate?

## 追问 / Follow-ups
- 中文：你怎样区分埋点问题与真实体验问题？ / English: How would you separate instrumentation failure from a real experience issue?
- 中文：哪些分群最有诊断价值？ / English: Which cohorts would be most diagnostic?

## 优秀信号 / Strong signals
- 先核对定义、数据新鲜度、发布和外部变化。 / Checks definitions, freshness, releases, and external changes first.
- 按设备、浏览器、文件类型、来源和步骤定位断点。 / Segments by device, browser, file type, source, and step.
- 量化影响并采用可逆缓解，再验证恢复。 / Quantifies impact, mitigates reversibly, and verifies recovery.

## 评分锚点 / Scoring anchors
- `1`：立即改页面文案或增加优惠。 / Immediately changes copy or adds incentives.
- `3`：会检查漏斗和发布记录，能提出若干假设。 / Checks funnel and releases and forms plausible hypotheses.
- `5`：先验证数据，再用高信息分群定位根因、止损并监控恢复。 / Validates data, uses high-information cohorts, contains impact, and monitors recovery.

## 风险项 / Risks
- 同时改动多个环节导致无法归因。 / Changes multiple stages at once and loses attribution.
- 忽略失败重试造成的重复事件。 / Ignores duplicate events from retries.

