# Capability ownership map

Use this file as the single development-time map for the 30 runtime Capability IDs. Confirm implementation details against `src/lib/capabilities/types.ts`, `src/lib/capabilities/catalog.ts`, and `.codex/PROJECT.md` before changing production code.

## Dependency flow

`document → evidence/resume → job/writing → layout/export → interview → safety/evaluation`

Safety checks also wrap every stage that handles external content, providers, files, audio, or rendered artifacts.

## Document intelligence

| Capability | Purpose | Maximum data scope | Eval suite |
| --- | --- | --- | --- |
| `document.parse` | Extract native PDF text, coordinates and page signals | `original_pdf` | `eval.document.parse.v1` |
| `document.ocr` | Recover missing text only from required page regions | `page_image` | `eval.document.ocr.v1` |
| `document.segment` | Restore reading order and semantic blocks | `source_blocks` | `eval.document.segment.v1` |

Owner: `resume-document-intelligence`.

## Evidence and resume review

| Capability | Purpose | Maximum data scope | Eval suite |
| --- | --- | --- | --- |
| `evidence.mine` | Extract traceable claims and supporting blocks | `resume_ast`, `source_blocks` | `eval.evidence.mine.v1` |
| `claim.assess` | Classify evidence support and confirmation needs | `evidence_graph` | `eval.claim.assess.v1` |
| `claim.conflict` | Detect factual or numeric contradictions | `evidence_graph` | `eval.claim.conflict.v1` |
| `resume.score` | Produce an explainable six-dimension quality score | `resume_ast`, `evidence_graph` | `eval.resume.score.v1` |
| `resume.suggest` | Produce block-level, evidence-constrained changes | `resume_ast`, `evidence_graph` | `eval.resume.suggest.v1` |
| `resume.atsAudit` | Detect machine-readability and structural risks | `resume_ast`, `source_blocks` | `eval.resume.ats.v1` |

Owner: `resume-evidence-review`.

## Job targeting and professional writing

| Capability | Purpose | Maximum data scope | Eval suite |
| --- | --- | --- | --- |
| `jd.parse` | Convert a JD into explicit, typed requirements | `job_description` | `eval.jd.parse.v1` |
| `job.match` | Map each requirement to evidence and gaps | `job_description`, `evidence_graph` | `eval.job.match.v1` |
| `job.riskDetect` | Flag recruitment, legality and ambiguity risks | `job_description` | `eval.job.risk.v1` |
| `copy.rewrite.zh` | Improve Chinese wording without adding facts | `resume_ast` | `eval.copy.zh.v1` |
| `copy.rewrite.en` | Improve English wording without adding facts | `resume_ast` | `eval.copy.en.v1` |
| `copy.consistency` | Align tense, punctuation, terms and locale style | `resume_ast` | `eval.copy.consistency.v1` |

Owner: `resume-job-writing`.

## Layout and export

| Capability | Purpose | Maximum data scope | Eval suite |
| --- | --- | --- | --- |
| `layout.recommend` | Select template and density from Resume AST | `resume_ast` | `eval.layout.recommend.v1` |
| `resume.render` | Compile a controlled Resume AST to PDF | `resume_ast` | `eval.resume.render.v1` |
| `export.audit` | Enforce content, visual, font and ATS quality gates | `rendered_document`, `resume_ast` | `eval.export.audit.v1` |

Owner: `resume-layout-export`.

## Interview and speech

| Capability | Purpose | Maximum data scope | Eval suite |
| --- | --- | --- | --- |
| `question.retrieve` | Retrieve licensed, relevant question units | `anonymous_metadata` | `eval.question.retrieve.v1` |
| `interview.plan` | Build a timed plan with bounded follow-ups | `anonymous_metadata` | `eval.interview.plan.v1` |
| `story.build` | Build a STAR story from confirmed claims | `resume_ast`, `evidence_graph` | `eval.story.build.v1` |
| `speech.transcribe` | Normalize consented browser speech text | `selected_text` | `eval.speech.transcribe.v1` |
| `answer.evaluate` | Evaluate relevance, structure, evidence, role competency and clarity | `interview_content`, `evidence_graph` | `eval.answer.evaluate.v1` |
| `answer.coach` | Give grounded, actionable coaching | `interview_content`, `evidence_graph` | `eval.answer.coach.v1` |
| `resumeInterview.check` | Compare interview claims with resume evidence | `interview_content`, `evidence_graph` | `eval.consistency.interview.v1` |

Owner: `resume-interview-coach`.

## Safety and evaluation

| Capability | Purpose | Maximum data scope | Eval suite |
| --- | --- | --- | --- |
| `pii.redact` | Remove unrelated personal data before external processing | `selected_text` | `eval.security.pii.v1` |
| `prompt.guard` | Keep untrusted document instructions from changing policy | `selected_text` | `eval.security.prompt.v1` |
| `accessibility.audit` | Check WCAG-oriented interaction requirements | `ui_render_tree` | `eval.quality.a11y.v1` |
| `security.audit` | Check runtime, worker and extension boundaries | `system_metadata` | `eval.quality.security.v1` |
| `llm.eval` | Compare candidates on fixed, redacted fixtures | `eval_fixtures` | `eval.quality.llm.v1` |

Owner: `resume-safety-evaluation`.

## Runtime contract reminders

- Contract version: `1.0`.
- Baseline implementation: `builtin.<capabilityId>@1.0.0`.
- Extension kinds: `adapter`, `rule_pack`, `knowledge_pack`, `prompt_policy`.
- Network policies: `none`, `provider_only`, `allowlist`.
- Provider gateway allowlist: `resume.score`, `resume.suggest`, `jd.parse`, `job.match`, `copy.rewrite.zh`, `copy.rewrite.en`, `interview.plan`, `answer.evaluate`, `answer.coach`.
- Frontend availability modes: `baseline`, `enhanced`, `unavailable`.
- A runtime result must include structured data, confidence, evidence references, warnings, source version, duration, usage when applicable, and `usedFallback`.
