---
id: sd-003
industry: software-data
role_family: data
levels: [entry, mid, senior]
difficulty: hard
type: technical
skills: [data-quality, pipelines, monitoring]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 数据质量故障 / Data quality failure

## 问题 / Question
**中文：** 下游报表突然出现异常，但管道任务均显示成功。你会如何定位、控制影响并建立质量防线？

**English:** A downstream report becomes abnormal while every pipeline job reports success. How would you diagnose, contain, and prevent the data-quality failure?

## 追问 / Follow-ups
- 中文：你如何判断回填范围和正确版本？ / English: How would you determine the backfill scope and correct version?
- 中文：哪些质量检查应该放在生产者、平台和消费者侧？ / English: Which checks belong with producers, the platform, and consumers?

## 优秀信号 / Strong signals
- 从血缘、时间、分布和业务语义逐层定位。 / Uses lineage, time, distributions, and business semantics.
- 区分任务成功、数据新鲜度、完整性和正确性。 / Separates job success from freshness, completeness, and correctness.
- 建立契约、隔离、回填验证和所有者机制。 / Establishes contracts, quarantine, backfill validation, and ownership.

## 评分锚点 / Scoring anchors
- `1`：直接重跑全量任务，未保护下游。 / Reruns everything without protecting downstream users.
- `3`：能定位并修复，但预防措施较笼统。 / Can diagnose and repair with generic prevention.
- `5`：控制传播、量化影响、验证回填，并在关键边界部署质量契约。 / Contains propagation, quantifies impact, validates backfill, and deploys contracts at key boundaries.

## 风险项 / Risks
- 在未冻结错误输出前继续发布报表。 / Continues publishing known-bad outputs.
- 回填时覆盖合法的迟到数据。 / Overwrites legitimate late-arriving data during backfill.

