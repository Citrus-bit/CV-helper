---
name: resume-layout-export
description: Recommend, render, preview, audit, and export ATS-friendly resume PDFs through three Typst templates with strict content, font, visual, integrity, and user-confirmation gates. Use when Codex must choose or refine resume layout, generate Professional/Minimal/Compact PDFs, compare a redesign with the original, diagnose PDF export defects, or decide whether a resume artifact is safe to download.
---

# Resume Layout Export

## Load the shared contract

Read the shared [capability map](../resume-assistant-orchestrator/references/capability-map.md) before choosing an entry point. Read the shared [extension protocol](../resume-assistant-orchestrator/references/extension-protocol.md) before adding or replacing a renderer, template pack, font pack, audit rule pack, or visual-review adapter.

Use the canonical `layout.recommend`, `resume.render`, and `export.audit` capabilities. Preserve the Resume AST input, template IDs, artifact hash, quality report, baseline fallback, cancellation, deadline, and revision semantics. Do not create a second export path that bypasses the registry or quality gate.

Read [references/rubric.md](references/rubric.md) whenever selecting a template, editing Typst, inspecting a preview, or approving a PDF artifact.

## Preserve the rendering boundary

- Render only the current canonical Resume AST and explicitly selected contact fields.
- Do not parse the original PDF inside the render capability or expose it to a layout extension.
- Do not change, summarize, omit, translate, or invent resume content to make a layout fit.
- Keep document processing offline, deterministic, resource-limited, cancellable, and isolated from provider credentials.
- Compile Typst from structured data; do not perform a generic PDF-to-LaTeX or PDF-to-Typst round trip.
- Treat template files, fonts, and PDF bytes as untrusted inputs until validated.
- Tie every render and report to `resumeId`, `resumeRevision`, template ID, and SHA-256.

## Recommend one of three templates

Offer all three canonical templates and recommend one from content density, target page count, locale, and user preference:

| Template | Select when | Protect |
| --- | --- | --- |
| `professional` | Content density is balanced or no strong preference exists. | Clear hierarchy, moderate spacing, stable default presentation. |
| `minimal` | Content is light and benefits from more whitespace. | Calm hierarchy without creating large accidental voids or extra pages. |
| `compact` | Content is dense and needs efficient pagination. | Readability, at least 7pt text, and sufficient line spacing. |

Return the recommended template, density class, estimated page count, ranked alternatives, and concise reasons. Treat the recommendation as guidance; preserve the user's explicit template choice.

Never force a target page count by dropping content, shrinking text below the quality threshold, collapsing line spacing into collisions, or reducing safe margins.

## Render real PDFs with Typst

1. Freeze the AST revision and enumerate expected content fragments before rendering.
2. Load only an allowlisted `professional`, `minimal`, or `compact` Typst template.
3. Use embedded fonts with complete Chinese and English glyph coverage and predictable fallbacks.
4. Keep a single-column semantic reading order even when using grids for local alignment.
5. Compile to an actual searchable PDF, not an HTML imitation, screenshot, canvas snapshot, or placeholder.
6. Record template, byte length, page count, SHA-256, and source version.
7. Reject invalid PDF headers, empty documents, missing text layers, unknown templates, path escapes, timeouts, and oversized artifacts.

## Preview the exact artifact

- Show the original PDF and the selected redesigned PDF as real PDF documents.
- Support page navigation and zoom, and compare all pages when the page count changes.
- Render at least the redesigned first page to a browser canvas before marking it previewed.
- Reject blank, transparent, pure-color, or visually empty preview canvases.
- Store the previewed artifact hash; require the downloaded artifact to use the same hash.
- Clear preview and confirmation state after any AST revision, template change, or rerender.
- Keep preview failure recoverable through an explicit retry without losing the selected template or current resume revision.

## Apply the export hard gate

Run `export.audit` independently after rendering. Do not trust the renderer, preview state, client report, filename, or MIME type as proof of quality.

Require all of the following:

- Readable PDF structure and non-empty pages.
- Searchable text and complete coverage of expected AST fragments.
- Visible text glyphs confirmed through raster and text-mask comparisons.
- No clipping, unsafe margins, significant text overlap, or line collisions.
- No body text below 7pt and no orphaned section heading at a page end.
- No replacement glyphs or missing CJK/Latin characters.
- Embedded fonts and stable ATS linear reading order.
- Valid page-count policy, exact SHA-256 integrity, and an overall score of at least 85.

Treat every failed check as blocking. Return `downloadable: false`, `hardGate.passed: false`, and all blocking check IDs. Never downgrade a failed hard gate to a warning.

Treat warnings as explicit review items. In particular, require closer comparison when the redesigned PDF has more pages than the original or exceeds two pages.

Use the current `src/lib/server/export.ts` implementation and canonical `ExportQualityReport` Schema as the authority for numeric tolerances and the automatic score. Do not recreate overlap, visual-content, glyph-visibility, fragment-matching, or score formulas inside a template or Skill. Change those thresholds only with versioned fixtures that prove the previous and proposed behavior.

## Remediate without damaging content

Apply this order when a candidate fails:

1. Switch among `professional`, `minimal`, and `compact` according to the failed checks.
2. Adjust template spacing, wrapping, and hierarchy within the readability and margin limits.
3. Rerender and rerun the complete audit against the same AST revision.
4. Ask the user to accept a separate content edit when no layout-only change can pass.
5. Keep the artifact blocked when no safe candidate passes.

Never remove AST fragments, hide text, convert text to images, use white-on-white text, overlap decorative shapes with text, or repeatedly shrink typography to manufacture a pass.

## Require explicit user confirmation

Enable confirmation only after the selected artifact has been rendered as a real PDF, previewed successfully, and passed the current audit. Require the user to compare the redesign with the original and explicitly confirm the selected template.

On download:

1. Verify the current resume revision and selected template.
2. Verify the previewed SHA-256.
3. Rerun `export.audit` against the exact PDF bytes.
4. Verify the response SHA-256 again before creating the local download.
5. Refuse download when any revision, template, hash, audit, preview, or confirmation value is stale or missing.

Do not claim that an automatic score proves subjective beauty. State the enforceable promise: failed artifacts cannot be downloaded, and the user must approve the real side-by-side preview.

Interpret `ExportQualityReport.downloadable` as server-side artifact eligibility: it mirrors the automatic hard-gate result. Actual download authorization additionally requires the current preview hash and explicit user confirmation in the application state. Do not conflate those states or add a parallel field without a canonical contract change.

## Return a complete quality result

Return an `ExportQualityReport` containing the resume and revision IDs, template, artifact SHA-256, source and output page counts, searchable/content-complete flags, overall score, check list, hard-gate result, blocking check IDs, downloadability, and generation time.

Apply the hard failures, template criteria, visual review, and acceptance checklist in [references/rubric.md](references/rubric.md). Preserve the last valid candidate and fall back through the registered baseline when an extension fails; never bypass the audit or user confirmation to preserve availability.
