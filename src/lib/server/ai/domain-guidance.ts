import "server-only";

export const DOMAIN_GUIDANCE_VERSION = "2026.07.29";

export type DomainGuidanceId =
  | "operations"
  | "cloud-gtm"
  | "game-operations-publishing"
  | "global-communications"
  | "game-audio-business-development";

type DomainGuidance = Readonly<{
  id: DomainGuidanceId;
  label: string;
  minimumScore: number;
  priority: number;
  signals: readonly Readonly<{ term: string; weight: number }>[];
  guidance: readonly string[];
}>;

const DOMAIN_GUIDANCE: readonly DomainGuidance[] = [
  {
    id: "game-audio-business-development",
    label: "game audio business development",
    minimumScore: 4,
    priority: 50,
    signals: [
      { term: "游戏音频", weight: 6 },
      { term: "游戏音乐", weight: 5 },
      { term: "音频服务", weight: 5 },
      { term: "音频商务", weight: 5 },
      { term: "wwise", weight: 4 },
      { term: "fmod", weight: 4 },
      { term: "曲库", weight: 3 },
      { term: "版权合作", weight: 3 },
      { term: "音效", weight: 2 },
      { term: "配音", weight: 2 },
      { term: "商务拓展", weight: 2 },
      { term: "business development", weight: 2 },
      { term: "audio", weight: 1 },
      { term: "游戏", weight: 1 },
    ],
    guidance: [
      "First distinguish custom audio services, music licensing, platform or ecosystem partnerships, and overseas or VO delivery; do not collapse them into generic sales.",
      "Look for a defensible chain from client type and need scenario through discovery, brief or demo, solution and quote, contract coordination, delivery, acceptance, payment, and repeat business. Mention only stages supported by the supplied evidence.",
      "For licensing, probe usage, media or platform, territory, term, exclusivity, and rights-chain coordination without implying legal authority. Treat Wwise, FMOD, BGM, SFX, VO, and audio QA as proficiency claims that require explicit support.",
      "Useful interview probes cover stakeholder mapping, requirement translation, scope and schedule trade-offs, feedback handoff, delivery risk, and the candidate's exact decision authority.",
    ],
  },
  {
    id: "game-operations-publishing",
    label: "game operations and publishing",
    minimumScore: 4,
    priority: 40,
    signals: [
      { term: "游戏运营", weight: 6 },
      { term: "游戏发行", weight: 6 },
      { term: "版本运营", weight: 4 },
      { term: "游戏行业", weight: 3 },
      { term: "宣发", weight: 3 },
      { term: "moba", weight: 3 },
      { term: "fps", weight: 2 },
      { term: "tps", weight: 2 },
      { term: "游戏", weight: 2 },
      { term: "版本节点", weight: 2 },
      { term: "用户召回", weight: 2 },
      { term: "素材投放", weight: 2 },
      { term: "dau", weight: 1 },
      { term: "留存率", weight: 1 },
    ],
    guidance: [
      "Separate user, event, content, product, community, and publishing work. Evaluate version cadence, target segments, event mechanics, channel adaptation, feedback loops, and cross-functional milestones only where the resume supports them.",
      "Prefer a clear operating chain: objective or user problem, audience segment, mechanism or content action, channel and collaborators, observed result, and review or reusable SOP.",
      "Game enthusiasm, play time, genre familiarity, or rank is not operating impact by itself. DAU or MAU, retention, participation, completion, engagement, conversion, and content metrics must come from supplied evidence and retain their original measurement scope.",
      "Useful interview probes test the candidate's hypothesis, chosen mechanism, dependencies, data interpretation, personal contribution, failure analysis, and next iteration.",
    ],
  },
  {
    id: "cloud-gtm",
    label: "cloud business and go-to-market",
    minimumScore: 4,
    priority: 40,
    signals: [
      { term: "云商务", weight: 6 },
      { term: "云计算", weight: 5 },
      { term: "go-to-market", weight: 5 },
      { term: "gtm", weight: 4 },
      { term: "inside sales", weight: 4 },
      { term: "salesforce", weight: 3 },
      { term: "bant", weight: 3 },
      { term: "pipeline", weight: 3 },
      { term: "isv", weight: 3 },
      { term: "商机", weight: 2 },
      { term: "销售漏斗", weight: 2 },
      { term: "伙伴生态", weight: 2 },
      { term: "线索", weight: 1 },
      { term: "qualification", weight: 1 },
      { term: "outbound", weight: 1 },
    ],
    guidance: [
      "Distinguish lead generation, qualification, opportunity progression, partner or ecosystem work, solution validation, and existing-account expansion instead of calling all activity GTM.",
      "Use funnel language only at the evidenced stage: Lead, MQL or SAL, SQL, Opportunity, Pipeline, Win Rate, ARR or ACV, renewal, upsell, and cross-sell are not interchangeable. Do not turn pipeline contribution into owned revenue.",
      "Look for target segment, inbound or outbound source, discovery and qualification method, customer pain point, value proposition, stakeholders, objection handling, next stage, and measurable conversion or cycle outcome.",
      "Useful interview probes test lead-quality judgment, BANT or another real qualification method, CRM discipline, POC or solution handoff, partner enablement, forecast assumptions, and loss review.",
    ],
  },
  {
    id: "global-communications",
    label: "global and corporate communications",
    minimumScore: 4,
    priority: 40,
    signals: [
      { term: "global communications", weight: 6 },
      { term: "corporate communications", weight: 6 },
      { term: "media relations", weight: 5 },
      { term: "全球传播", weight: 6 },
      { term: "企业传播", weight: 5 },
      { term: "国际传播", weight: 4 },
      { term: "媒体关系", weight: 4 },
      { term: "public relations", weight: 3 },
      { term: "press release", weight: 3 },
      { term: "editorial review", weight: 3 },
      { term: "英文内容", weight: 3 },
      { term: "fact-checking", weight: 2 },
      { term: "cross-market", weight: 2 },
      { term: "localization", weight: 1 },
    ],
    guidance: [
      "Prove English-language delivery through actual outputs and editorial judgment, not a generic claim of English fluency. Identify the deliverable, audience or market, workflow stage, reviewers, channel, and publication or adoption result.",
      "Relevant work may include drafting, copyediting, proofreading, fact-checking, messaging, media research, cross-market adaptation, social content, campaign reporting, and stakeholder review cycles, but use a term only when the evidence supports that exact activity.",
      "Calibrate ownership verbs carefully: led, owned, and drove require decision authority; supported, contributed to, coordinated, edited, and reviewed are often more accurate.",
      "Useful interview probes cover a difficult editorial choice, factual verification, terminology consistency, cultural nuance, approval conflict, deadline control, and how communications impact was measured.",
    ],
  },
  {
    id: "operations",
    label: "operations and product operations",
    minimumScore: 4,
    priority: 10,
    signals: [
      { term: "产品运营", weight: 6 },
      { term: "用户运营", weight: 6 },
      { term: "活动运营", weight: 6 },
      { term: "内容运营", weight: 6 },
      { term: "渠道运营", weight: 6 },
      { term: "社群运营", weight: 6 },
      { term: "增长运营", weight: 6 },
      { term: "运营", weight: 2 },
      { term: "用户分层", weight: 3 },
      { term: "内容矩阵", weight: 3 },
      { term: "转化漏斗", weight: 3 },
      { term: "北极星指标", weight: 3 },
      { term: "aarrr", weight: 3 },
      { term: "rfm", weight: 3 },
      { term: "a/b test", weight: 2 },
      { term: "gmv", weight: 1 },
    ],
    guidance: [
      "First identify the actual subfamily: user, event, content, community, channel or GTM, product, commerce, data, or localization operations. Align the title, summary, evidence order, and terminology to that subfamily.",
      "Prefer business problem and objective, target users, the candidate's exact action and method, collaborators, measurable or otherwise verifiable result, and reflection or reusable process. Do not replace a weak description with unsupported jargon.",
      "DAU or MAU, retention, conversion, GMV, ROI, LTV, CAC, RFM, AARRR, cohort analysis, experimentation, and feature adoption have distinct meanings. Use only metrics, tools, and methods explicitly supported by the resume or confirmed facts.",
      "Useful interview probes cover metric definitions and baselines, segmentation logic, experiment design, prioritization, cross-functional influence, failure recovery, and what changed after the review.",
    ],
  },
];

function searchableText(value: unknown): string {
  return (JSON.stringify(value) ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US");
}

export function selectDomainGuidance(value: unknown): DomainGuidance | null {
  const corpus = searchableText(value);
  const candidates = DOMAIN_GUIDANCE.map((guide) => ({
    guide,
    score: guide.signals.reduce(
      (score, signal) => score + (corpus.includes(signal.term) ? signal.weight : 0),
      0,
    ),
  }))
    .filter(({ guide, score }) => score >= guide.minimumScore)
    .sort(
      (left, right) =>
        right.score - left.score || right.guide.priority - left.guide.priority,
    );

  return candidates[0]?.guide ?? null;
}

export function domainGuidanceInstruction(
  value: unknown,
  use: "resume" | "interview",
): string {
  const guide = selectDomainGuidance(value);
  if (!guide) return "";

  return [
    `Optional domain editorial context (${DOMAIN_GUIDANCE_VERSION}; ${guide.label}):`,
    "This curated context is a review rubric, not evidence about the candidate and not permission to add keywords, methods, tools, responsibilities, ownership, or metrics.",
    ...guide.guidance,
    use === "resume"
      ? "For resume work, use a domain term only when it already appears in supplied evidence or confirmed facts. Otherwise ask a precise clarification or omit it."
      : "For interview work, these concepts may frame questions and evaluation criteria, but never assert that the candidate performed them; accept other sound approaches when the answer explains its reasoning.",
  ].join(" ");
}
