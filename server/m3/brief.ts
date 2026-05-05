/**
 * M3 — Structured Brief Generator
 *
 * Converts a topic keyword into a structured content brief.
 * The brief drives the LLM prompt to produce consistent, high-quality drafts.
 * Reuses the M0 brief structure, but dynamically generated from topic metadata.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContentBrief {
  topic: string;
  targetKeyword: string;
  userIntent: "utility" | "informational" | "comparison" | "template";
  pageType: "article" | "template" | "guide" | "comparison" | "faq";
  audience: string;
  language: string;
  tone: string;
  maxWords: number;
  requiredSections: string[];
  blockedClaims: string[];
  internalLinks: string[];
}

// ─── Intent detection ─────────────────────────────────────────────────────────

export function detectIntent(keyword: string): ContentBrief["userIntent"] {
  const lower = keyword.toLowerCase();
  if (/^how to|steps to|guide to|tutorial|tips for/i.test(lower)) return "utility";
  if (/\btemplate\b|\bexample\b|\bsample\b|\bchecker\b/i.test(lower)) return "template";
  if (/\bvs\b|\bversus\b|\bcompare\b|\bdifference between\b|\bbest\b/i.test(lower)) return "comparison";
  return "informational";
}

export function detectPageType(keyword: string, intent: ContentBrief["userIntent"]): ContentBrief["pageType"] {
  const lower = keyword.toLowerCase();
  if (intent === "template" || /\btemplate\b|\bexample\b|\bsample\b/i.test(lower)) return "template";
  if (intent === "comparison" || /\bvs\b|\bversus\b|\bcompare\b/i.test(lower)) return "comparison";
  if (/\bfaq\b|\bquestion\b|\bwhat is\b|\bwhy\b/i.test(lower)) return "faq";
  if (/\bguide\b|\btutorial\b|\bhow to\b/i.test(lower)) return "guide";
  return "article";
}

// ─── Section generator ────────────────────────────────────────────────────────

export function generateRequiredSections(
  intent: ContentBrief["userIntent"],
  pageType: ContentBrief["pageType"],
): string[] {
  const base = ["intro", "faq"];

  const sectionMap: Record<string, string[]> = {
    utility: ["intro", "why-it-matters", "step-by-step", "tips", "common-mistakes", "faq"],
    template: ["intro", "template", "examples", "tips", "faq"],
    comparison: ["intro", "overview", "comparison-table", "pros-cons", "recommendation", "faq"],
    informational: ["intro", "key-concepts", "details", "examples", "summary", "faq"],
  };

  const pageTypeOverrides: Partial<Record<string, string[]>> = {
    guide: ["intro", "prerequisites", "step-by-step", "tips", "troubleshooting", "faq"],
    faq: ["intro", "questions-and-answers", "summary"],
  };

  return pageTypeOverrides[pageType] ?? sectionMap[intent] ?? base;
}

// ─── Blocked claims by category ───────────────────────────────────────────────

const GLOBAL_BLOCKED_CLAIMS = [
  "legal guarantees",
  "employment law advice",
  "medical advice",
  "financial advice",
  "investment advice",
  "guaranteed results",
];

function getBlockedClaims(keyword: string): string[] {
  const lower = keyword.toLowerCase();
  const claims = [...GLOBAL_BLOCKED_CLAIMS];

  if (/health|fitness|diet|weight|medical|symptom/i.test(lower)) {
    claims.push("medical diagnosis", "treatment recommendations", "prescription advice");
  }
  if (/finance|invest|stock|crypto|tax|money/i.test(lower)) {
    claims.push("specific investment advice", "tax advice", "financial planning advice");
  }
  if (/legal|law|attorney|lawsuit|contract/i.test(lower)) {
    claims.push("legal counsel", "specific legal advice");
  }

  return claims;
}

// ─── Audience detection ───────────────────────────────────────────────────────

function detectAudience(keyword: string): string {
  const lower = keyword.toLowerCase();
  if (/developer|programmer|engineer|coding|software|javascript|python|react|git|rebase|merge|docker|api|backend|frontend|typescript|nodejs/i.test(lower)) {
    return "software developers and engineers";
  }
  if (/manager|team|leadership|management|executive/i.test(lower)) {
    return "managers and team leaders";
  }
  if (/student|learn|beginner|starter|introduction/i.test(lower)) {
    return "beginners and learners";
  }
  if (/freelance|freelancer|contractor|self-employed/i.test(lower)) {
    return "freelancers and independent contractors";
  }
  if (/startup|founder|entrepreneur|business owner/i.test(lower)) {
    return "startup founders and entrepreneurs";
  }
  return "general professionals";
}

// ─── Tone detection ───────────────────────────────────────────────────────────

function detectTone(intent: ContentBrief["userIntent"], audience: string): string {
  if (intent === "utility" || intent === "template") return "clear, practical, and actionable";
  if (intent === "comparison") return "objective, balanced, and informative";
  if (audience.includes("developer")) return "technical but accessible";
  return "clear, helpful, and professional";
}

// ─── Word count by page type ──────────────────────────────────────────────────

function getMaxWords(pageType: ContentBrief["pageType"]): number {
  const wordCounts: Record<string, number> = {
    template: 500,
    guide: 700,
    comparison: 600,
    faq: 400,
    article: 550,
  };
  return wordCounts[pageType] ?? 550;
}

// ─── Main brief generator ─────────────────────────────────────────────────────

export function generateBrief(
  keyword: string,
  existingTopicKeywords: string[] = [],
): ContentBrief {
  const normalizedKeyword = keyword.trim();
  const intent = detectIntent(normalizedKeyword);
  const pageType = detectPageType(normalizedKeyword, intent);
  const audience = detectAudience(normalizedKeyword);
  const tone = detectTone(intent, audience);
  const requiredSections = generateRequiredSections(intent, pageType);
  const blockedClaims = getBlockedClaims(normalizedKeyword);

  // Generate internal link suggestions from existing topics
  const internalLinks = existingTopicKeywords
    .filter((k) => {
      const kLower = k.toLowerCase();
      const kwLower = normalizedKeyword.toLowerCase();
      // Find related but not identical topics
      const firstWord = kwLower.split(" ")[0];
      return kLower !== kwLower && kLower.includes(firstWord);
    })
    .slice(0, 3);

  return {
    topic: normalizedKeyword,
    targetKeyword: normalizedKeyword,
    userIntent: intent,
    pageType,
    audience,
    language: "en",
    tone,
    maxWords: getMaxWords(pageType),
    requiredSections,
    blockedClaims,
    internalLinks,
  };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildSystemPrompt(): string {
  return `You are a professional content writer producing helpful, practical web pages for a micro-publishing platform.

Your output must be clean Markdown suitable for direct web rendering.
Do not include any preamble, meta-commentary, or "Here is your article" framing.
Start directly with the H1 title.
Write in a clear, professional, and helpful tone.
Every article must be genuinely useful to the target audience.`;
}

export function buildUserPrompt(brief: ContentBrief): string {
  return `Write a helpful ${brief.pageType} page about: "${brief.topic}"
Target keyword: ${brief.targetKeyword}
Audience: ${brief.audience}
Tone: ${brief.tone}
Max words: ${brief.maxWords}
Language: ${brief.language}

CRITICAL keyword requirement:
- The exact phrase "${brief.targetKeyword}" MUST appear naturally in the body text at least 2-3 times
- Include it in the introduction, at least one section heading or paragraph, and near the conclusion
- Do NOT keyword-stuff — use it naturally as a real writer would

CRITICAL audience requirement:
- Write specifically for ${brief.audience} — use their vocabulary, context, and real-world scenarios
- Do NOT write for a generic audience

Required sections (use ## headings):
${brief.requiredSections.map((s) => `- ${s}`).join("\n")}

Do NOT include:
${brief.blockedClaims.map((c) => `- ${c}`).join("\n")}

Format requirements:
- Start with a single H1 (# Title) that includes or paraphrases the target keyword
- Use ## for each required section
- Include at least one numbered list or bullet list
- Keep total length between ${Math.round(brief.maxWords * 0.8)} and ${brief.maxWords} words
- End with a short FAQ section (at least 2 Q&A pairs) where at least one question uses the target keyword
${brief.internalLinks.length > 0 ? `\nNaturally reference these related topics where relevant:\n${brief.internalLinks.map((l) => `- ${l}`).join("\n")}` : ""}`;
}

// ─── Slug generator ───────────────────────────────────────────────────────────

export function generateSlug(keyword: string): string {
  return keyword
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}
