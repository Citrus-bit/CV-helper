---
id: sd-005
industry: software-data
role_family: engineering
levels: [entry, mid, senior]
difficulty: medium
type: technical
skills: [performance, profiling, measurement]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 性能问题定位 / Performance diagnosis

## 问题 / Question

**中文：** 某关键流程在高峰期变慢，但平均延迟变化不大。你会如何定义问题、采样并验证优化有效？

**English:** A critical workflow slows during peaks while average latency barely changes. How would you define, profile, and validate the problem?

## 追问 / Follow-ups

- 中文：你会优先看哪些分位数和分群？ / English: Which percentiles and cohorts would you inspect first?
- 中文：怎样避免基准测试与生产行为脱节？ / English: How would you keep benchmarks representative of production?

## 优秀信号 / Strong signals

- 关注用户路径、尾延迟、负载和资源饱和。 / Focuses on user paths, tail latency, load, and saturation.
- 先测量瓶颈再选择缓存、算法或扩容。 / Measures the bottleneck before choosing caching, algorithms, or capacity.
- 同时验证性能、正确性、成本和回归。 / Validates performance, correctness, cost, and regressions.

## 评分锚点 / Scoring anchors

- `1`：直接扩容或缓存，没有测量假设。 / Immediately scales or caches without measurement.
- `3`：能用 profiler 找到瓶颈并验证改善。 / Uses profiling to find a bottleneck and validate improvement.
- `5`：定义用户 SLO、分解尾延迟、控制实验，并评估成本与新瓶颈。 / Defines user SLOs, decomposes tail latency, controls tests, and assesses cost and shifted bottlenecks.

## 风险项 / Risks

- 只优化平均值而忽视受影响用户。 / Optimizes the mean while missing affected users.
- 通过关闭安全或一致性检查换取速度。 / Gains speed by disabling safety or consistency checks.
