---
id: sd-006
industry: software-data
role_family: data
levels: [mid, senior]
difficulty: hard
type: case
skills: [experimentation, causality, statistics]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 实验与因果判断 / Experimentation and causality

## 问题 / Question
**中文：** 一次 A/B 测试显示核心指标上涨，但实验组样本量和渠道构成与对照组不同。你如何判断能否发布？

**English:** An A/B test improves the primary metric, but sample size and channel mix differ between groups. How would you decide whether to launch?

## 追问 / Follow-ups
- 中文：你会检查哪些随机化或样本比例异常？ / English: Which randomization or sample-ratio issues would you test?
- 中文：短期收益与长期护栏冲突时如何处理？ / English: What if short-term gains conflict with long-term guardrails?

## 优秀信号 / Strong signals
- 先验证分流、暴露定义、样本比例和数据完整性。 / Validates assignment, exposure, sample ratio, and data integrity first.
- 讨论效应大小、置信区间、异质性和护栏。 / Considers effect size, uncertainty, heterogeneity, and guardrails.
- 对有偏结果选择重跑或缩小结论，而非挑指标。 / Reruns or narrows claims rather than cherry-picking metrics.

## 评分锚点 / Scoring anchors
- `1`：只因 p 值显著就发布。 / Launches solely because a p-value is significant.
- `3`：识别样本问题并做基本分群或重跑。 / Identifies sample issues and performs basic segmentation or rerun.
- `5`：系统验证实验有效性、业务效应和护栏，并给出带不确定性的决策。 / Validates experiment integrity, business effect, guardrails, and makes an uncertainty-aware decision.

## 风险项 / Risks
- 事后不断切分直到获得显著结果。 / Slices repeatedly after the fact until significance appears.
- 忽略隐私、干扰或长期行为变化。 / Ignores privacy, interference, or long-term behavior.

