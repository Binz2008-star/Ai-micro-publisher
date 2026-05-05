/**
 * M2 — Topic Scoring Engine
 *
 * Converts editorial judgment into computable rules.
 * Each dimension scores 0–100. The opportunity_score is a weighted composite.
 *
 * Dimensions (from spec):
 *   trend_score           — how trending the keyword is right now
 *   search_intent_score   — how clearly informational/utility the intent is
 *   content_gap_score     — how underserved the topic is
 *   expected_ad_value_score — estimated CPM/CPC potential
 *   freshness_score       — how recently the topic appeared
 *   policy_risk_score     — inverse: 100 = safe, 0 = high risk
 *   duplication_score     — inverse: 100 = unique, 0 = already covered
 *
 * opportunity_score = weighted composite (0–100)
 */

// ─── Policy risk blocklist ────────────────────────────────────────────────────

export const POLICY_RISK_KEYWORDS = [
  // Medical / legal / financial advice
  "medical advice", "legal advice", "financial advice", "investment advice",
  "diagnosis", "treatment", "prescription", "lawsuit", "legal case",
  // Harmful / dangerous
  "how to hack", "how to crack", "how to pirate", "how to steal",
  "bomb", "weapon", "explosive", "poison", "drug synthesis",
  "suicide", "self-harm", "eating disorder",
  // Adult / explicit
  "porn", "adult content", "explicit", "nsfw", "xxx",
  // Politically sensitive
  "election fraud", "vote rigging", "conspiracy",
  // Copyright risk
  "lyrics", "full movie", "download copyrighted",
  // Spam / scam
  "get rich quick", "make money fast", "pyramid scheme", "mlm",
];

export const HIGH_RISK_CATEGORIES = [
  "politics", "religion", "abortion", "gun control", "immigration policy",
  "racial", "gender identity", "cryptocurrency speculation",
];

// ─── High-value ad categories (CPM estimate) ─────────────────────────────────

const HIGH_VALUE_AD_KEYWORDS = [
  "insurance", "mortgage", "loan", "credit card", "attorney", "lawyer",
  "software", "saas", "cloud", "hosting", "vpn", "antivirus",
  "health", "fitness", "weight loss", "supplement",
  "travel", "hotel", "flight", "vacation",
  "finance", "invest", "trading", "crypto",
  "education", "course", "certification", "degree",
  "business", "startup", "marketing", "seo",
  "email", "productivity", "template", "tool",
];

// ─── Scoring functions ────────────────────────────────────────────────────────

export function scorePolicyRisk(keyword: string): number {
  const lower = keyword.toLowerCase();

  for (const blocked of POLICY_RISK_KEYWORDS) {
    if (lower.includes(blocked)) return 5; // Near-zero: very high risk
  }

  for (const cat of HIGH_RISK_CATEGORIES) {
    if (lower.includes(cat)) return 30; // Moderate risk
  }

  // Check for sensitive patterns
  if (/\b(how to (kill|hurt|harm|attack|cheat|steal|fraud))\b/i.test(lower)) return 5;
  if (/\b(illegal|illicit|banned|prohibited)\b/i.test(lower)) return 20;
  if (/\b(sex|nude|naked|erotic)\b/i.test(lower)) return 10;

  return 90; // Default: low risk
}

export function scoreSearchIntent(keyword: string): number {
  const lower = keyword.toLowerCase();

  // Strong utility intent signals
  if (/^(how to|what is|why does|when to|where to|best way to|guide to|tips for|steps to|tutorial)/i.test(lower)) return 90;
  if (/\b(template|example|checklist|guide|tutorial|tips|steps|how|what|why|when|best)\b/i.test(lower)) return 80;

  // Comparison / review intent (good for ads)
  if (/\b(vs|versus|compare|review|best|top|alternative)\b/i.test(lower)) return 70;

  // Navigational (lower value for content pages)
  if (/\b(login|sign in|download|app|website|official)\b/i.test(lower)) return 30;

  // Transactional (good for ads, but harder to rank)
  if (/\b(buy|price|cost|cheap|discount|deal|coupon)\b/i.test(lower)) return 50;

  return 60; // Default: moderate intent
}

export function scoreExpectedAdValue(keyword: string): number {
  const lower = keyword.toLowerCase();
  let score = 40; // Base

  for (const kw of HIGH_VALUE_AD_KEYWORDS) {
    if (lower.includes(kw)) {
      score = Math.min(100, score + 30);
      break;
    }
  }

  // Long-tail keywords tend to have higher conversion
  const wordCount = keyword.split(/\s+/).length;
  if (wordCount >= 4) score = Math.min(100, score + 10);
  if (wordCount >= 6) score = Math.min(100, score + 5);

  return score;
}

export function scoreFreshness(discoveredAt: Date): number {
  const ageMs = Date.now() - discoveredAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours < 1) return 100;
  if (ageHours < 6) return 90;
  if (ageHours < 24) return 75;
  if (ageHours < 72) return 55;
  if (ageHours < 168) return 35; // 1 week
  return 15;
}

export function scoreDuplication(keyword: string, existingKeywords: string[]): number {
  const lower = keyword.toLowerCase().trim();

  // Exact match
  if (existingKeywords.some((k) => k.toLowerCase().trim() === lower)) return 0;

  // Near-duplicate: >70% word overlap
  const words = new Set(lower.split(/\s+/));
  for (const existing of existingKeywords) {
    const existingWords = new Set(existing.toLowerCase().split(/\s+/));
    const intersection = Array.from(words).filter((w) => existingWords.has(w)).length;
    const union = new Set([...Array.from(words), ...Array.from(existingWords)]).size;
    const similarity = intersection / union;
    if (similarity > 0.7) return 10;
    if (similarity > 0.5) return 40;
  }

  return 90; // Unique
}

export function scoreContentGap(keyword: string, existingKeywords: string[]): number {
  // Simple proxy: if we have many similar topics, gap is smaller
  const lower = keyword.toLowerCase();
  const relatedCount = existingKeywords.filter((k) => {
    const kLower = k.toLowerCase();
    return kLower.includes(lower.split(" ")[0]) || lower.includes(kLower.split(" ")[0]);
  }).length;

  if (relatedCount === 0) return 90;
  if (relatedCount <= 2) return 70;
  if (relatedCount <= 5) return 50;
  return 25;
}

export function scoreTrend(source: string, trendSignal: number): number {
  // trendSignal is a 0–100 value from the source (RSS position, upvotes, etc.)
  const sourceMultiplier: Record<string, number> = {
    "hackernews": 1.0,
    "reddit": 0.9,
    "google_trends": 1.1,
    "seasonal": 0.8,
    "seeded": 0.6,
    "internal": 0.7,
  };
  const multiplier = sourceMultiplier[source.toLowerCase()] ?? 0.7;
  return Math.min(100, Math.round(trendSignal * multiplier));
}

// ─── Composite opportunity score ──────────────────────────────────────────────

export interface TopicScores {
  trendScore: number;
  searchIntentScore: number;
  contentGapScore: number;
  expectedAdValueScore: number;
  freshnessScore: number;
  policyRiskScore: number;
  duplicationScore: number;
  opportunityScore: number;
}

export interface ScoredTopic extends TopicScores {
  keyword: string;
  source: string;
  language: string;
  status: "candidate" | "rejected";
  rejectionReason: string | null;
}

export function computeOpportunityScore(scores: Omit<TopicScores, "opportunityScore">): number {
  // Weights from spec rationale: policy_risk and duplication are gates, not just weights
  const {
    trendScore,
    searchIntentScore,
    contentGapScore,
    expectedAdValueScore,
    freshnessScore,
    policyRiskScore,
    duplicationScore,
  } = scores;

  // Hard gates: if policy risk is too high or topic is duplicate, score is very low
  if (policyRiskScore < 20) return Math.min(policyRiskScore, 10);
  if (duplicationScore < 10) return 5;

  const weighted =
    trendScore * 0.20 +
    searchIntentScore * 0.20 +
    contentGapScore * 0.15 +
    expectedAdValueScore * 0.15 +
    freshnessScore * 0.10 +
    policyRiskScore * 0.10 +
    duplicationScore * 0.10;

  return Math.round(Math.min(100, weighted));
}

// ─── Minimum thresholds for acceptance ───────────────────────────────────────

export const ACCEPTANCE_THRESHOLDS = {
  opportunityScore: 40,
  policyRiskScore: 50,
  duplicationScore: 20,
} as const;

export function shouldAcceptTopic(scores: TopicScores): {
  accept: boolean;
  reason: string | null;
} {
  if (scores.policyRiskScore < ACCEPTANCE_THRESHOLDS.policyRiskScore) {
    return { accept: false, reason: `Policy risk too high (score ${scores.policyRiskScore} < ${ACCEPTANCE_THRESHOLDS.policyRiskScore})` };
  }
  if (scores.duplicationScore < ACCEPTANCE_THRESHOLDS.duplicationScore) {
    return { accept: false, reason: `Topic is a near-duplicate (duplication score ${scores.duplicationScore})` };
  }
  if (scores.opportunityScore < ACCEPTANCE_THRESHOLDS.opportunityScore) {
    return { accept: false, reason: `Opportunity score too low (${scores.opportunityScore} < ${ACCEPTANCE_THRESHOLDS.opportunityScore})` };
  }
  return { accept: true, reason: null };
}

// ─── Full topic scorer ────────────────────────────────────────────────────────

export function scoreTopic(
  keyword: string,
  source: string,
  trendSignal: number,
  existingKeywords: string[],
  discoveredAt: Date = new Date(),
): ScoredTopic {
  const trendScore = scoreTrend(source, trendSignal);
  const searchIntentScore = scoreSearchIntent(keyword);
  const contentGapScore = scoreContentGap(keyword, existingKeywords);
  const expectedAdValueScore = scoreExpectedAdValue(keyword);
  const freshnessScore = scoreFreshness(discoveredAt);
  const policyRiskScore = scorePolicyRisk(keyword);
  const duplicationScore = scoreDuplication(keyword, existingKeywords);

  const scores = {
    trendScore,
    searchIntentScore,
    contentGapScore,
    expectedAdValueScore,
    freshnessScore,
    policyRiskScore,
    duplicationScore,
  };

  const opportunityScore = computeOpportunityScore(scores);
  const { accept, reason } = shouldAcceptTopic({ ...scores, opportunityScore });

  return {
    keyword,
    source,
    language: "en",
    ...scores,
    opportunityScore,
    status: accept ? "candidate" : "rejected",
    rejectionReason: reason,
  };
}
