import { describe, it, expect } from "vitest";
import {
  scorePolicyRisk,
  scoreSearchIntent,
  scoreExpectedAdValue,
  scoreFreshness,
  scoreDuplication,
  scoreContentGap,
  scoreTrend,
  computeOpportunityScore,
  shouldAcceptTopic,
  scoreTopic,
  ACCEPTANCE_THRESHOLDS,
  POLICY_RISK_KEYWORDS,
} from "./scoring";
import { normalizeKeyword, isValidKeyword } from "./sources";

// ─── Policy Risk ──────────────────────────────────────────────────────────────

describe("scorePolicyRisk", () => {
  it("returns very low score for blocked keywords", () => {
    expect(scorePolicyRisk("medical advice for diabetes")).toBeLessThan(20);
    expect(scorePolicyRisk("legal advice for landlords")).toBeLessThan(20);
    expect(scorePolicyRisk("how to hack a website")).toBeLessThan(20);
  });

  it("returns moderate score for high-risk categories", () => {
    const score = scorePolicyRisk("politics and the election");
    expect(score).toBeLessThan(50);
    expect(score).toBeGreaterThan(0);
  });

  it("returns high score for safe utility topics", () => {
    expect(scorePolicyRisk("how to write a follow-up email")).toBeGreaterThanOrEqual(80);
    expect(scorePolicyRisk("best productivity tips for remote work")).toBeGreaterThanOrEqual(80);
    expect(scorePolicyRisk("python list comprehension examples")).toBeGreaterThanOrEqual(80);
  });

  it("returns 0–100 always", () => {
    for (const kw of [...POLICY_RISK_KEYWORDS, "safe topic", "how to code"]) {
      const score = scorePolicyRisk(kw);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ─── Search Intent ────────────────────────────────────────────────────────────

describe("scoreSearchIntent", () => {
  it("scores 'how to' topics highest", () => {
    expect(scoreSearchIntent("how to write a resignation letter")).toBeGreaterThanOrEqual(85);
  });

  it("scores navigational intent low", () => {
    expect(scoreSearchIntent("gmail login page")).toBeLessThan(50);
  });

  it("scores comparison intent moderately", () => {
    const score = scoreSearchIntent("react vs vue comparison");
    expect(score).toBeGreaterThanOrEqual(60);
    expect(score).toBeLessThanOrEqual(85);
  });

  it("returns 0–100 always", () => {
    for (const kw of ["how to", "buy now", "login", "best tools", "random keyword"]) {
      const score = scoreSearchIntent(kw);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ─── Ad Value ─────────────────────────────────────────────────────────────────

describe("scoreExpectedAdValue", () => {
  it("scores high-value categories higher", () => {
    expect(scoreExpectedAdValue("best insurance for freelancers")).toBeGreaterThan(60);
    expect(scoreExpectedAdValue("how to get a mortgage")).toBeGreaterThan(60);
  });

  it("scores long-tail keywords higher", () => {
    const short = scoreExpectedAdValue("email tips");
    const longTail = scoreExpectedAdValue("how to write a professional follow-up email after no response");
    expect(longTail).toBeGreaterThanOrEqual(short);
  });

  it("returns 0–100 always", () => {
    for (const kw of ["insurance", "random", "how to code", "buy laptop"]) {
      const score = scoreExpectedAdValue(kw);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ─── Freshness ────────────────────────────────────────────────────────────────

describe("scoreFreshness", () => {
  it("scores very recent topics highest", () => {
    const now = new Date();
    expect(scoreFreshness(now)).toBe(100);
  });

  it("scores older topics lower", () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(scoreFreshness(oneWeekAgo)).toBeLessThan(scoreFreshness(new Date()));
    expect(scoreFreshness(oneMonthAgo)).toBeLessThanOrEqual(scoreFreshness(oneWeekAgo));
  });

  it("returns 0–100 always", () => {
    for (const d of [new Date(), new Date(Date.now() - 1e9), new Date(0)]) {
      const score = scoreFreshness(d);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ─── Duplication ──────────────────────────────────────────────────────────────

describe("scoreDuplication", () => {
  it("returns 0 for exact duplicates", () => {
    const existing = ["how to write a follow-up email", "python tips"];
    expect(scoreDuplication("how to write a follow-up email", existing)).toBe(0);
  });

  it("returns low score for near-duplicates", () => {
    const existing = ["how to write a follow-up email after no response"];
    const score = scoreDuplication("how to write a follow up email after no response", existing);
    expect(score).toBeLessThan(50);
  });

  it("returns high score for unique topics", () => {
    const existing = ["python tips", "javascript guide"];
    expect(scoreDuplication("how to negotiate salary", existing)).toBeGreaterThanOrEqual(80);
  });

  it("returns 90 for empty existing list", () => {
    expect(scoreDuplication("any topic", [])).toBe(90);
  });
});

// ─── Opportunity Score ────────────────────────────────────────────────────────

describe("computeOpportunityScore", () => {
  it("returns very low score when policy risk is too high", () => {
    const score = computeOpportunityScore({
      trendScore: 80,
      searchIntentScore: 80,
      contentGapScore: 80,
      expectedAdValueScore: 80,
      freshnessScore: 80,
      policyRiskScore: 10, // High risk
      duplicationScore: 90,
    });
    expect(score).toBeLessThanOrEqual(10);
  });

  it("returns very low score for duplicates", () => {
    const score = computeOpportunityScore({
      trendScore: 80,
      searchIntentScore: 80,
      contentGapScore: 80,
      expectedAdValueScore: 80,
      freshnessScore: 80,
      policyRiskScore: 90,
      duplicationScore: 0, // Exact duplicate
    });
    expect(score).toBeLessThanOrEqual(10);
  });

  it("returns high score for ideal topics", () => {
    const score = computeOpportunityScore({
      trendScore: 85,
      searchIntentScore: 90,
      contentGapScore: 80,
      expectedAdValueScore: 75,
      freshnessScore: 95,
      policyRiskScore: 90,
      duplicationScore: 90,
    });
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("always returns 0–100", () => {
    for (let i = 0; i < 10; i++) {
      const score = computeOpportunityScore({
        trendScore: Math.random() * 100,
        searchIntentScore: Math.random() * 100,
        contentGapScore: Math.random() * 100,
        expectedAdValueScore: Math.random() * 100,
        freshnessScore: Math.random() * 100,
        policyRiskScore: Math.random() * 100,
        duplicationScore: Math.random() * 100,
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ─── shouldAcceptTopic ────────────────────────────────────────────────────────

describe("shouldAcceptTopic", () => {
  it("rejects topics with low policy risk score", () => {
    const result = shouldAcceptTopic({
      trendScore: 80, searchIntentScore: 80, contentGapScore: 80,
      expectedAdValueScore: 80, freshnessScore: 80,
      policyRiskScore: 10, duplicationScore: 90, opportunityScore: 70,
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("Policy risk");
  });

  it("rejects duplicate topics", () => {
    const result = shouldAcceptTopic({
      trendScore: 80, searchIntentScore: 80, contentGapScore: 80,
      expectedAdValueScore: 80, freshnessScore: 80,
      policyRiskScore: 90, duplicationScore: 5, opportunityScore: 70,
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("duplicate");
  });

  it("rejects low opportunity score topics", () => {
    const result = shouldAcceptTopic({
      trendScore: 20, searchIntentScore: 20, contentGapScore: 20,
      expectedAdValueScore: 20, freshnessScore: 20,
      policyRiskScore: 90, duplicationScore: 90, opportunityScore: 10,
    });
    expect(result.accept).toBe(false);
    expect(result.reason).toContain("Opportunity score");
  });

  it("accepts good topics", () => {
    const result = shouldAcceptTopic({
      trendScore: 80, searchIntentScore: 85, contentGapScore: 75,
      expectedAdValueScore: 70, freshnessScore: 90,
      policyRiskScore: 90, duplicationScore: 90, opportunityScore: 80,
    });
    expect(result.accept).toBe(true);
    expect(result.reason).toBeNull();
  });
});

// ─── scoreTopic (integration) ─────────────────────────────────────────────────

describe("scoreTopic", () => {
  it("scores and accepts a safe utility topic", () => {
    const result = scoreTopic(
      "how to write a professional follow-up email",
      "seeded",
      75,
      [],
    );
    expect(result.decision ?? result.status).toBe("candidate");
    expect(result.policyRiskScore).toBeGreaterThanOrEqual(80);
    expect(result.opportunityScore).toBeGreaterThanOrEqual(ACCEPTANCE_THRESHOLDS.opportunityScore);
  });

  it("rejects a high-risk topic", () => {
    const result = scoreTopic("how to hack a website", "seeded", 80, []);
    expect(result.status).toBe("rejected");
    expect(result.policyRiskScore).toBeLessThan(ACCEPTANCE_THRESHOLDS.policyRiskScore);
  });

  it("rejects a duplicate topic", () => {
    const existing = ["how to write a follow-up email"];
    const result = scoreTopic("how to write a follow-up email", "seeded", 75, existing);
    expect(result.status).toBe("rejected");
    expect(result.duplicationScore).toBeLessThan(ACCEPTANCE_THRESHOLDS.duplicationScore);
  });

  it("returns all 7 score dimensions", () => {
    const result = scoreTopic("productivity tips for remote workers", "seeded", 70, []);
    expect(typeof result.trendScore).toBe("number");
    expect(typeof result.searchIntentScore).toBe("number");
    expect(typeof result.contentGapScore).toBe("number");
    expect(typeof result.expectedAdValueScore).toBe("number");
    expect(typeof result.freshnessScore).toBe("number");
    expect(typeof result.policyRiskScore).toBe("number");
    expect(typeof result.duplicationScore).toBe("number");
    expect(typeof result.opportunityScore).toBe("number");
  });
});

// ─── Keyword normalization ────────────────────────────────────────────────────

describe("normalizeKeyword", () => {
  it("lowercases and trims", () => {
    expect(normalizeKeyword("  How To Write  ")).toBe("how to write");
  });

  it("removes leading articles", () => {
    expect(normalizeKeyword("The best email templates")).toBe("best email templates");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeKeyword("how   to   code")).toBe("how to code");
  });
});

describe("isValidKeyword", () => {
  it("rejects single-word keywords", () => {
    expect(isValidKeyword("email")).toBe(false);
  });

  it("rejects very short keywords", () => {
    expect(isValidKeyword("hi")).toBe(false);
  });

  it("accepts multi-word utility keywords", () => {
    expect(isValidKeyword("how to write a follow-up email")).toBe(true);
  });
});
