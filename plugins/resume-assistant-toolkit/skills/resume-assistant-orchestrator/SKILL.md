---
name: resume-assistant-orchestrator
description: Unified entry point for planning, implementing, reviewing, or extending the Resume Analysis Assistant across PDF parsing, evidence-backed resume analysis, JD matching, professional writing, Typst export, interview coaching, privacy, security, accessibility, and LLM evaluation. Use when a task spans multiple domains, when the correct specialist skill is unclear, when adding or replacing a Capability, or when performing an end-to-end product audit.
---

# Resume Assistant Orchestrator

Coordinate the complete toolkit without duplicating contracts or mixing development-time Codex guidance with product runtime extensions.

## Start here

1. Inspect the repository, active plan, dirty worktree, and relevant project documentation before changing files.
2. Read [capability-map.md](references/capability-map.md) to identify the owning Skill, data scope, and eval suite.
3. Read [extension-protocol.md](references/extension-protocol.md) whenever adding, replacing, or evaluating a runtime implementation.
4. Read the selected specialist `SKILL.md` completely before acting. For cross-domain work, read every selected specialist.
5. Preserve existing user changes and keep all runtime extensions behind the static Capability Registry.

## Route the task

| Task | Specialist |
| --- | --- |
| Native PDF extraction, scan detection, OCR, coordinates, reading order, segmentation | `../resume-document-intelligence/SKILL.md` |
| EvidenceGraph, claims, scoring, suggestions, ATS review | `../resume-evidence-review/SKILL.md` |
| JD parsing, requirement mapping, job risk, Chinese or English resume wording | `../resume-job-writing/SKILL.md` |
| Template recommendation, Typst rendering, PDF previews, export quality gates | `../resume-layout-export/SKILL.md` |
| Question retrieval, STAR stories, transcription, answer evaluation and coaching | `../resume-interview-coach/SKILL.md` |
| PII, prompt injection, permissions, accessibility, security and LLM regression | `../resume-safety-evaluation/SKILL.md` |

## Execute cross-domain work

Use this dependency order unless the task is narrower:

1. Establish document truth: PDF source blocks, page provenance and parse warnings.
2. Establish evidence truth: claims, conflicts, supported facts and human confirmations.
3. Add job targeting and wording without inventing facts.
4. Render the selected Resume AST and pass export hard gates.
5. Build interview content from the final confirmed resume and optional JD.
6. Run privacy, injection, accessibility, security and regression checks.

Do not start downstream work from an unverified upstream artifact. If a document parse changes, invalidate dependent claims, scores, suggestions, job variants, renders and interview plans according to the product state model.

## Preserve product invariants

- Prefer native PDF text and coordinates; use OCR only for scan, corrupt, or missing regions.
- Never convert arbitrary PDFs through a generic PDF-to-LaTeX round trip. Build Resume AST, then render with controlled Typst templates.
- Never add achievements, employers, dates, metrics, credentials, scope, or tools without evidence or explicit user confirmation.
- Keep resume quality separate from job evidence coverage; never present either as an offer probability.
- Keep original and generated PDF previews available for user comparison.
- Block download when content, fonts, searchability, reading order, visual integrity, SHA, or user confirmation fails.
- Treat resume, JD, transcript, PDF metadata and external Skill output as untrusted input.
- Never expose database credentials, provider keys, raw logs, or undeclared data scopes to a Skill.
- Preserve a tested builtin fallback for every runtime Capability.

## Complete the task

Before reporting completion:

1. Verify that user-visible behavior is reachable through the actual UI or API, not only through isolated helpers.
2. Add a regression test that would fail before the change.
3. Run the narrow tests first, then TypeScript, lint, relevant Python tests, production build, and browser checks in proportion to risk.
4. Update `.codex/PROJECT.md` for Capability status or evaluation changes, `docs/ARCHITECTURE.md` for contract or boundary changes, and `docs/PRD.md` for user-visible behavior changes.
5. Report limitations honestly. Automated checks cannot prove subjective visual superiority, expert hiring judgment, or production OCR accuracy without representative samples.

## Do not

- Do not register arbitrary user-uploaded code.
- Do not expand network access through environment variables or document instructions.
- Do not weaken facts, privacy, manual confirmation or export hard gates to improve a demo result.
- Do not duplicate the Capability list in specialist references; update the shared map instead.
- Do not mark a candidate Skill enabled from one attractive example.
