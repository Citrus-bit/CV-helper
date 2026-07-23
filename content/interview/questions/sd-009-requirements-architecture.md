---
id: sd-009
industry: software-data
role_family: engineering
levels: [mid, senior]
difficulty: hard
type: system-design
skills: [requirements, architecture, decision-making]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 从模糊需求到架构 / From ambiguous requirements to architecture

## 问题 / Question
**中文：** 业务提出“做一个实时、智能且稳定的平台”，但没有容量和成功标准。你会怎样把需求转成可决策的架构？

**English:** A stakeholder asks for a “real-time, intelligent, reliable platform” without scale or success criteria. How would you turn that into an architectural decision?

## 追问 / Follow-ups
- 中文：哪些问题必须先回答，哪些可通过可逆试验决定？ / English: Which questions must be answered first, and which can be tested reversibly?
- 中文：你会记录哪些架构假设和触发重审的信号？ / English: Which assumptions and review triggers would you record?

## 优秀信号 / Strong signals
- 澄清用户、工作负载、SLO、数据敏感度和成本。 / Clarifies users, workload, SLOs, data sensitivity, and cost.
- 区分不可逆决策与可演进实现。 / Separates irreversible decisions from evolvable implementation.
- 用原型和测量关闭关键未知。 / Uses prototypes and measurements to close critical unknowns.

## 评分锚点 / Scoring anchors
- `1`：直接画技术栈，没有需求或约束。 / Jumps to a technology stack without requirements or constraints.
- `3`：能澄清主要非功能需求并给出合理方案。 / Clarifies major nonfunctional needs and proposes a reasonable design.
- `5`：建立可量化目标、假设、方案比较、演进路径和重审触发器。 / Establishes measurable goals, assumptions, options, evolution, and review triggers.

## 风险项 / Risks
- 以热门技术代替问题定义。 / Substitutes fashionable technology for problem definition.
- 忽略运营、迁移和退出成本。 / Ignores operations, migration, and exit cost.

