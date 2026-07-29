export const RESUME_DESIGN_GUIDE = {
  version: "resume-design@2026-07-29",
  targetPages: 1,
  sources: [
    {
      name: "Harvard College Guide to Creating a Strong Resume",
      url: "https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/",
    },
    {
      name: "Harvard College Resume Example (Tech)",
      url: "https://careerservices.fas.harvard.edu/resources/harvard-college-resume-example-tech/",
    },
  ],
  principles: [
    "Use a restrained single-column layout with a clear name-and-contact header.",
    "Order sections by relevance and entries in reverse chronological order.",
    "Keep typography, date alignment, spacing, emphasis, and capitalization consistent.",
    "Balance information density with enough white space for rapid recruiter scanning.",
    "Use specific active language and lead bullets with action, method, and supported result.",
    "Prefer concise one- or two-line bullets and remove repetition before shrinking type.",
    "Keep the PDF ATS-readable: selectable text, conventional headings, and no decorative graphics.",
  ],
} as const;

export const RESUME_AI_EDITOR_BRIEF = [
  `Follow local style guide ${RESUME_DESIGN_GUIDE.version}.`,
  "Use a one-page-first editorial standard: prioritize the strongest relevant evidence, concise summaries, and one- or two-line bullets.",
  "Favor a restrained single-column hierarchy, conventional section labels, reverse chronological entries, consistent date alignment, and balanced white space.",
  "Write for rapid recruiter and ATS scanning with specific active language and action-method-result ordering.",
  "Remove filler and repetition before shortening supported evidence; never invent facts or silently discard a distinct verified achievement.",
].join(" ");

export function resumeLayoutGoal(sourcePages: number) {
  return {
    targetPages: RESUME_DESIGN_GUIDE.targetPages,
    sourcePages,
    priority: "prefer" as const,
    styleGuideVersion: RESUME_DESIGN_GUIDE.version,
    principles: RESUME_DESIGN_GUIDE.principles,
  };
}
