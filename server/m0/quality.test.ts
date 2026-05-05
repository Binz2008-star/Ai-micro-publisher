import { describe, it, expect } from "vitest";
import { runQualityGate, THRESHOLDS } from "./quality";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const GOOD_DRAFT = `# How to Write a Polite Follow-Up Email After No Response

## Intro
Following up after no response is a common professional challenge. Done well, it shows persistence without being pushy.

## Template
Use this proven template:

\`\`\`
Subject: Following up on my previous email

Hi [Name],

I wanted to follow up on my email from [date]. I understand you're busy, and I'd appreciate any update when you have a moment.

Best regards,
[Your Name]
\`\`\`

## Examples

1. **Job application follow-up**: "Hi Sarah, I applied for the Marketing Manager role last week and wanted to check in on the timeline."
2. **Client proposal follow-up**: "Hi James, I sent over the proposal on Monday. Happy to answer any questions you might have."
3. **Meeting request follow-up**: "Hi Alex, I reached out about scheduling a 20-minute call. Would any time next week work for you?"

## Tips

- Wait at least 3-5 business days before following up.
- Keep your follow-up short and to the point.
- Reference your original email clearly.
- Offer a specific next step or question.
- Use a friendly, professional tone throughout.

## FAQ

**Q: How many times should I follow up?**
A: Generally, two follow-ups are appropriate. After that, move on or try a different channel.

**Q: Should I follow up if I never got a reply?**
A: Yes — emails get missed. A polite follow-up shows professionalism and genuine interest.
`;

const SHORT_DRAFT = `# Short

This is too short.`;

const UNSAFE_DRAFT = `# Email Tips

This guide covers violence and harm in the workplace. Kill the competition.`;

const BLOCKED_DRAFT = `# Email Tips

This template comes with legal guarantees and employment law advice.

## Template
Subject: Follow up

Hi there, I am following up.`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Quality Gate — THRESHOLDS", () => {
  it("exports correct threshold values from spec", () => {
    expect(THRESHOLDS.publishScore).toBe(75);
    expect(THRESHOLDS.safetyScore).toBe(95);
    expect(THRESHOLDS.usefulnessScore).toBe(75);
    expect(THRESHOLDS.readabilityScore).toBe(70);
  });
});

describe("Quality Gate — Good draft", () => {
  const result = runQualityGate(GOOD_DRAFT);

  it("approves a well-structured draft", () => {
    expect(result.decision).toBe("approve");
  });

  it("safety score meets threshold (>=95)", () => {
    expect(result.safetyScore).toBeGreaterThanOrEqual(THRESHOLDS.safetyScore);
  });

  it("readability score meets threshold (>=70)", () => {
    expect(result.readabilityScore).toBeGreaterThanOrEqual(THRESHOLDS.readabilityScore);
  });

  it("usefulness score meets threshold (>=75)", () => {
    expect(result.usefulnessScore).toBeGreaterThanOrEqual(THRESHOLDS.usefulnessScore);
  });

  it("publish score meets threshold (>=75)", () => {
    expect(result.publishScore).toBeGreaterThanOrEqual(THRESHOLDS.publishScore);
  });

  it("returns no required changes", () => {
    expect(result.requiredChanges).toHaveLength(0);
  });
});

describe("Quality Gate — Short draft", () => {
  const result = runQualityGate(SHORT_DRAFT);

  it("rejects a draft that is too short", () => {
    expect(result.decision).toBe("reject");
  });

  it("readability score is below threshold", () => {
    expect(result.readabilityScore).toBeLessThan(THRESHOLDS.readabilityScore);
  });

  it("includes a reason about short content", () => {
    const hasLengthReason = result.reasons.some((r) => r.toLowerCase().includes("short") || r.toLowerCase().includes("words"));
    expect(hasLengthReason).toBe(true);
  });
});

describe("Quality Gate — Unsafe draft", () => {
  const result = runQualityGate(UNSAFE_DRAFT);

  it("rejects a draft with safety risk patterns", () => {
    expect(result.decision).toBe("reject");
  });

  it("safety score is below threshold (>=95)", () => {
    expect(result.safetyScore).toBeLessThan(THRESHOLDS.safetyScore);
  });

  it("includes a safety reason", () => {
    const hasSafetyReason = result.reasons.some((r) => r.toLowerCase().includes("safety"));
    expect(hasSafetyReason).toBe(true);
  });
});

describe("Quality Gate — Blocked claims draft", () => {
  const result = runQualityGate(BLOCKED_DRAFT);

  it("rejects a draft with blocked claims", () => {
    expect(result.decision).toBe("reject");
  });

  it("safety score is penalised for blocked claims", () => {
    expect(result.safetyScore).toBeLessThan(THRESHOLDS.safetyScore);
  });
});

describe("Quality Gate — Decision structure", () => {
  it("always returns all four score fields", () => {
    const result = runQualityGate(GOOD_DRAFT);
    expect(typeof result.publishScore).toBe("number");
    expect(typeof result.safetyScore).toBe("number");
    expect(typeof result.usefulnessScore).toBe("number");
    expect(typeof result.readabilityScore).toBe("number");
  });

  it("decision is always 'approve' or 'reject'", () => {
    const good = runQualityGate(GOOD_DRAFT);
    const bad = runQualityGate(SHORT_DRAFT);
    expect(["approve", "reject"]).toContain(good.decision);
    expect(["approve", "reject"]).toContain(bad.decision);
  });

  it("scores are always between 0 and 100", () => {
    for (const draft of [GOOD_DRAFT, SHORT_DRAFT, UNSAFE_DRAFT, BLOCKED_DRAFT]) {
      const r = runQualityGate(draft);
      for (const score of [r.publishScore, r.safetyScore, r.usefulnessScore, r.readabilityScore]) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });
});
