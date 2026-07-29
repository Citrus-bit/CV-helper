---
id: sd-007
industry: software-data
role_family: engineering
levels: [mid, senior]
difficulty: hard
type: system-design
skills: [security, privacy, threat-modeling]
source: resume-assistant-editorial
license: LicenseRef-ResumeAssistant-Original
status: editorial-review
version: "1.0.0"
reviewed_at: "2026-07-22"
---

# 敏感文件处理设计 / Designing sensitive-file processing

## 问题 / Question

**中文：** 设计一个处理用户简历和录音的服务。你会如何做威胁建模、最小权限、保留策略和删除验证？

**English:** Design a service that processes resumes and recordings. How would you approach threat modeling, least privilege, retention, and deletion verification?

## 追问 / Follow-ups

- 中文：不可信 PDF 与业务网络之间如何隔离？ / English: How would you isolate untrusted PDFs from the business network?
- 中文：怎样证明日志和备份中没有长期残留正文？ / English: How would you verify content does not persist in logs or backups?

## 优秀信号 / Strong signals

- 从资产、攻击者、入口和影响建立威胁模型。 / Models assets, adversaries, entry points, and impact.
- 使用短时对象权限、禁网沙箱、加密和数据最小化。 / Uses short-lived access, no-egress sandboxing, encryption, and minimization.
- 将删除定义为跨主存储、缓存、日志和备份的可审计流程。 / Treats deletion as an auditable process across stores, caches, logs, and backups.

## 评分锚点 / Scoring anchors

- `1`：只说“使用 HTTPS 和加密”。 / Mentions only HTTPS and encryption.
- `3`：覆盖鉴权、隔离和 TTL，但验证与故障路径有限。 / Covers auth, isolation, and TTL with limited verification and failure handling.
- `5`：完整威胁模型、最小化、隔离、密钥边界、删除证明和事件响应。 / Provides a full threat model, minimization, isolation, key boundaries, deletion evidence, and response plan.

## 风险项 / Risks

- 在日志中记录文件正文或完整模型提示。 / Logs document content or full model prompts.
- 把供应商合规声明当作自身控制的替代。 / Treats a vendor claim as a substitute for internal controls.
