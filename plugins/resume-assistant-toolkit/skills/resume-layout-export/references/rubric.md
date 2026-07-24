# Resume Layout and Export Rubric

Use this rubric to select a template, review Typst changes, evaluate a real PDF preview, and decide whether an artifact may be downloaded. Reject the artifact immediately when any automatic hard gate fails. Require both a passing audit and explicit user confirmation.

## Navigation

- [Automatic hard gates](#automatic-hard-gates)
- [Non-negotiable artifact failures](#non-negotiable-artifact-failures)
- [Template fitness](#template-fitness--25-points)
- [Content and ATS integrity](#content-and-ats-integrity--25-points)
- [Typography and font reliability](#typography-and-font-reliability--15-points)
- [Visual layout quality](#visual-layout-quality--20-points)
- [Preview and integrity chain](#preview-and-integrity-chain--10-points)
- [User control and recovery](#user-control-and-recovery--5-points)
- [Final acceptance checklist](#final-acceptance-checklist)

## Automatic hard gates

Treat every `fail` result below as blocking:

| Check ID | Pass condition |
| --- | --- |
| `valid-pdf` | Parse a `%PDF-` document with at least one readable page. |
| `visual-content` | Detect meaningful non-white, high-contrast page content on every page. |
| `text-visibility` | Confirm that expected text produces visible glyph pixels, including local character bands and narrow numeric regions. |
| `searchable-text` | Extract a usable text layer rather than image-only content. |
| `content-completeness` | Find every expected AST content fragment in the exported text and visible page render. |
| `clipping` | Keep every text object inside page bounds. |
| `overlap` | Detect no significant text-object overlap. |
| `margins` | Keep every text object at least 24pt away from the left and right page edges. |
| `pagination` | Keep output within five pages; warn when it exceeds two pages. |
| `font-size` | Keep all text objects at or above 7pt. |
| `line-spacing` | Prevent visible line collisions. |
| `orphan-heading` | Keep section headings with following content. |
| `missing-glyphs` | Detect no replacement characters, tofu boxes, or dropped CJK/Latin glyphs. |
| `font-embedding` | Include embedded font programs in the PDF. |
| `ats-order` | Extract key content in the same semantic order as the AST. |
| `sha256` | Match the previewed and expected artifact SHA-256 exactly. |
| `quality-threshold` | Reach an overall automatic score of at least 85. |

Do not accept a visually plausible screenshot as evidence for any check. Inspect the actual PDF bytes, extracted text, text objects, and rasterized pages.

`ExportQualityReport.overallScore` is the automatic score defined by the canonical audit implementation. The 100-point sections below are a separate human review aid; record that score in review notes, not in the runtime report. Neither score may override an automatic hard-gate failure.

Implementation tolerances for significant overlap, meaningful visual content, visible glyphs, fragment matching, and score deductions are code-owned controls. Read and test the current audit implementation instead of inferring new thresholds from this rubric.

## Non-negotiable artifact failures

Reject the artifact when it:

- Omits, truncates, rewrites, translates, duplicates, or hides any AST content.
- Contains blank pages, white-on-white text, transparent text, decorative-line masking, clipped line endings, or narrow hidden numbers.
- Converts core text into images or produces an image-only PDF.
- Uses a font without complete required glyph coverage or without embedding it.
- Forces pagination by using text below 7pt, unsafe margins, or colliding lines.
- Produces an ATS reading order that differs materially from the Resume AST.
- Allows confirmation or download before a real PDF preview succeeds.
- Downloads bytes whose SHA differs from the previewed and audited artifact.
- Reuses confirmation after the resume revision or template changes.
- Bypasses a failure because the renderer, template, or provider is “trusted”.

## Template fitness — 25 points

### Professional

Award full credit when the template:

- Handles balanced content with clear name, headline, contact, summary, section, entry, date, and bullet hierarchy.
- Uses moderate margins and spacing without appearing cramped or sparse.
- Serves as the stable default when density signals are inconclusive.

### Minimal

Award full credit when the template:

- Uses additional whitespace to clarify light content.
- Avoids a large accidental blank region, stranded short section, or unnecessary extra page.
- Preserves enough contrast and hierarchy without decorative clutter.

### Compact

Award full credit when the template:

- Fits dense content efficiently while keeping body text at least 7pt.
- Preserves line separation, bullet scanning, date alignment, and section grouping.
- Avoids solving density through clipping, hidden text, or unreadable compression.

Deduct points when the recommendation ignores content density, target pages, locale, or an explicit user preference.

## Content and ATS integrity — 25 points

Award full credit when the artifact:

- Contains all expected AST fragments exactly once where the semantic model expects them.
- Preserves names, contact fields selected by the user, dates, section order, entry order, and bullet order.
- Exposes searchable text in a stable single-column semantic order.
- Uses local alignment grids without creating multi-column reading ambiguity.
- Preserves copy/paste text and does not rely on decorative icons to convey essential information.

Require zero missing fragments and zero material order breaks for acceptance.

## Typography and font reliability — 15 points

Award full credit when the artifact:

- Embeds fonts and covers every required Chinese and English glyph.
- Maintains body text at or above 7pt and uses readable leading.
- Uses a restrained type scale with visible hierarchy between name, section, entry, metadata, and bullet text.
- Wraps long English words, URLs, dates, and mixed Chinese/English text without collision or clipping.
- Avoids unexplained fallback changes between preview and download environments.

Test at least one Chinese-only, English-only, mixed-language, long-name, long-email, long-technology-name, and dense-bullet fixture.

## Visual layout quality — 20 points

Inspect every page of the real PDF at normal fit-to-width and at higher zoom. Award full credit when:

- Left and right content axes align consistently.
- Section spacing is intentional and repeated.
- No page contains a distracting bottom void, oversized mid-page gap, or isolated decorative area.
- Dates and metadata remain visually attached to the correct entry.
- Bullets wrap with a stable hanging indent.
- Page breaks preserve semantic groups and avoid orphan headings.
- Color contrast and visual hierarchy remain clear in grayscale.
- The redesign looks at least as usable as the original after side-by-side comparison.

Treat aesthetic review as human judgment, not as an automatic guarantee. Record concrete concerns such as “large bottom void on page 1” or “date column crowds long title” instead of returning a vague beauty score.

## Preview and integrity chain — 10 points

Award full credit only when the system:

- Displays the original and redesigned artifacts as real PDFs.
- Supports page navigation and zoom.
- Successfully rasterizes the redesigned first page before setting preview state.
- Stores the exact previewed SHA and clears it after any invalidating change.
- Reruns the audit for download and verifies the returned bytes again.

## User control and recovery — 5 points

Award full credit when the flow:

- Shows all three templates and explains the recommendation.
- Keeps warnings and blocking check IDs visible and actionable.
- Lets the user switch templates or retry rendering without losing resume state.
- Requires explicit confirmation after side-by-side review.
- Keeps download disabled until the current artifact passes every gate.

## Final acceptance checklist

- Confirm zero automatic hard-gate failures.
- Confirm automatic `overallScore >= 85` and `downloadable === hardGate.passed`; treat this as artifact eligibility, not final user authorization.
- Confirm `blockingCheckIds` is empty only for a passing artifact.
- Confirm searchable text, content completeness, font embedding, and ATS order all pass.
- Confirm preview SHA, audited SHA, and download SHA are identical.
- Confirm every page was visually reviewed against the original when available.
- Confirm the user explicitly approved the current revision and template.
- Confirm the application combines artifact eligibility, the current preview SHA, and explicit confirmation before enabling the actual download action.
- Confirm any extension failure falls back to the registered baseline without bypassing the audit.
