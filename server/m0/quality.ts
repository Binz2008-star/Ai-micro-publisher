/**
 * Milestone 0 — Quality Gate
 *
 * Scores a generated draft across four dimensions and returns a structured
 * approve/reject decision. Thresholds from the spec:
 *   publish_score  >= 75
 *   safety_score   >= 95
 *   usefulness_score >= 75
 *   readability_score >= 70
 */

export interface QualityScores {
  publishScore: number;
  safetyScore: number;
  usefulnessScore: number;
  readabilityScore: number;
}

export interface QualityResult extends QualityScores {
  decision: "approve" | "reject";
  reasons: string[];
  requiredChanges: string[];
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

export const THRESHOLDS = {
  publishScore: 75,
  safetyScore: 95,
  usefulnessScore: 75,
  readabilityScore: 70,
} as const;

// ─── Blocked content patterns ─────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /legal guarantee/i,
  /employment law advice/i,
  /guaranteed to work/i,
  /i am not responsible/i,
  /consult a lawyer/i,
];

const SAFETY_RISK_PATTERNS = [
  /harm|violence|illegal|exploit|scam|fraud|abuse|hate|discriminat/i,
  /\b(kill|murder|attack|threaten)\b/i,
];

// ─── Heuristic Scorers ────────────────────────────────────────────────────────

function scoreReadability(text: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;

  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;

  // Penalise very long sentences
  if (avgWordsPerSentence > 30) {
    score -= 20;
    reasons.push(`Average sentence length is ${avgWordsPerSentence.toFixed(0)} words (>30)`);
  } else if (avgWordsPerSentence > 22) {
    score -= 10;
    reasons.push(`Average sentence length is ${avgWordsPerSentence.toFixed(0)} words (>22)`);
  }

  // Penalise very short content
  if (words.length < 150) {
    score -= 25;
    reasons.push(`Content too short: ${words.length} words (<150)`);
  } else if (words.length < 250) {
    score -= 10;
    reasons.push(`Content is brief: ${words.length} words (<250)`);
  }

  // Reward headings
  const headings = (text.match(/^#{1,3}\s.+/gm) || []).length;
  if (headings < 2) {
    score -= 10;
    reasons.push("Fewer than 2 headings found");
  }

  // Penalise excessive caps
  const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);
  if (capsRatio > 0.15) {
    score -= 10;
    reasons.push("Excessive capitalisation detected");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function scoreSafety(text: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;

  for (const pattern of SAFETY_RISK_PATTERNS) {
    if (pattern.test(text)) {
      score -= 40;
      reasons.push(`Safety risk pattern detected: ${pattern.source}`);
    }
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      score -= 15;
      reasons.push(`Blocked claim detected: ${pattern.source}`);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function scoreUsefulness(text: string, requiredSections: readonly string[]): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;

  const lower = text.toLowerCase();

  // Check for required sections
  const missingSections: string[] = [];
  for (const section of requiredSections) {
    const sectionKeyword = section.replace(/_/g, " ");
    if (!lower.includes(sectionKeyword) && !lower.includes(`## ${sectionKeyword}`)) {
      missingSections.push(section);
    }
  }

  if (missingSections.length > 0) {
    const penalty = missingSections.length * 8;
    score -= penalty;
    reasons.push(`Missing sections: ${missingSections.join(", ")}`);
  }

  // Check for actionable content (lists, numbered steps)
  const hasList = /^[-*]\s.+/m.test(text) || /^\d+\.\s.+/m.test(text);
  if (!hasList) {
    score -= 15;
    reasons.push("No actionable list or numbered steps found");
  }

  // Check for FAQ section
  const hasFaq = /faq|frequently asked|question/i.test(text);
  if (!hasFaq) {
    score -= 10;
    reasons.push("No FAQ section detected");
  }

  // Check for template/example
  const hasTemplate = /subject:|dear |hi |hello |follow.?up|template|example/i.test(text);
  if (!hasTemplate) {
    score -= 10;
    reasons.push("No email template or example detected");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

function scorePublishReadiness(
  text: string,
  readability: number,
  safety: number,
  usefulness: number,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  // Composite weighted score
  const composite = Math.round(readability * 0.3 + safety * 0.3 + usefulness * 0.4);

  // Additional publish-readiness checks
  let bonus = 0;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 350 && wordCount <= 600) {
    bonus += 5; // Ideal length range
  }

  const hasMetaLikeTitle = /^#\s.+/m.test(text);
  if (!hasMetaLikeTitle) {
    reasons.push("No H1 title found in draft");
  }

  return { score: Math.max(0, Math.min(100, composite + bonus)), reasons };
}

// ─── Main Gate ────────────────────────────────────────────────────────────────

export function runQualityGate(
  draftText: string,
  requiredSections: readonly string[] = ["intro", "template", "examples", "tips", "faq"],
): QualityResult {
  const allReasons: string[] = [];
  const requiredChanges: string[] = [];

  const readabilityResult = scoreReadability(draftText);
  const safetyResult = scoreSafety(draftText);
  const usefulnessResult = scoreUsefulness(draftText, requiredSections);
  const publishResult = scorePublishReadiness(
    draftText,
    readabilityResult.score,
    safetyResult.score,
    usefulnessResult.score,
  );

  allReasons.push(...readabilityResult.reasons, ...safetyResult.reasons, ...usefulnessResult.reasons, ...publishResult.reasons);

  // Determine decision
  const failedThresholds: string[] = [];

  if (publishResult.score < THRESHOLDS.publishScore) {
    failedThresholds.push(`publish_score ${publishResult.score} < ${THRESHOLDS.publishScore}`);
    requiredChanges.push("Improve overall content quality and structure");
  }
  if (safetyResult.score < THRESHOLDS.safetyScore) {
    failedThresholds.push(`safety_score ${safetyResult.score} < ${THRESHOLDS.safetyScore}`);
    requiredChanges.push("Remove unsafe or blocked content");
  }
  if (usefulnessResult.score < THRESHOLDS.usefulnessScore) {
    failedThresholds.push(`usefulness_score ${usefulnessResult.score} < ${THRESHOLDS.usefulnessScore}`);
    requiredChanges.push("Add missing sections and actionable content");
  }
  if (readabilityResult.score < THRESHOLDS.readabilityScore) {
    failedThresholds.push(`readability_score ${readabilityResult.score} < ${THRESHOLDS.readabilityScore}`);
    requiredChanges.push("Shorten sentences and improve structure");
  }

  const decision: "approve" | "reject" = failedThresholds.length === 0 ? "approve" : "reject";

  if (failedThresholds.length > 0) {
    allReasons.push(`Failed thresholds: ${failedThresholds.join("; ")}`);
  }

  return {
    decision,
    publishScore: publishResult.score,
    safetyScore: safetyResult.score,
    usefulnessScore: usefulnessResult.score,
    readabilityScore: readabilityResult.score,
    reasons: allReasons,
    requiredChanges,
  };
}
