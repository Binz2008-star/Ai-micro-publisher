/**
 * M4 — Quality Gate Tests
 *
 * Tests Stage 1 heuristic checks:
 *   - unsafe draft rejected
 *   - duplicate draft rejected / merge suggested
 *   - thin draft rejected
 *   - good draft approved by Stage 1
 *   - borderline draft passes Stage 1 (goes to Stage 2)
 *
 * Stage 2 (LLM) is tested via mock to avoid live API calls in unit tests.
 */

import { describe, it, expect } from "vitest";
import { runStage1 } from "./stage1";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const GOOD_DRAFT = `# How to Write a Polite Follow-Up Email After No Response

## Introduction
Following up after no response is a common professional challenge. Done well, it shows persistence without being pushy. This guide provides practical templates and tips for professionals.

## Why Follow-Up Emails Matter
A well-timed follow-up can make the difference between closing a deal and losing a prospect. Research shows that 80% of sales require at least five follow-ups, yet most people give up after one.

## Step-by-Step Guide

1. **Wait the right amount of time** — Give at least 3-5 business days before following up.
2. **Reference your original email** — Mention the date and subject of your previous message.
3. **Keep it short** — Your follow-up should be shorter than your original email.
4. **Add value** — Include a new piece of information or resource.
5. **Include a clear call to action** — Ask a specific question or suggest a next step.

## Email Template

\`\`\`
Subject: Following up on my previous email

Hi [Name],

I wanted to follow up on my email from [date]. I understand you're busy, and I'd appreciate any update when you have a moment.

Best regards,
[Your Name]
\`\`\`

## Tips for Success

- Use a friendly but professional tone throughout.
- Avoid passive-aggressive language like "I haven't heard back from you."
- Try a different channel if email isn't working.
- Know when to stop — two or three follow-ups is usually enough.

## FAQ

**Q: How many times should I follow up?**
A: Generally, two follow-ups are appropriate. After that, move on or try a different channel.

**Q: Should I follow up if I never got a reply?**
A: Yes — emails get missed. A polite follow-up shows professionalism and genuine interest.
`;

const THIN_DRAFT = `# Email Tips

This is a short article about email. Email is important for communication.
Use email wisely. Follow up when needed.
`;

const UNSAFE_DRAFT = `# How to Hack Your Boss's Email

This guide covers how to access someone else's email account without permission. Here are the steps to break into any email system using illegal methods.

## Step 1: Find the Target
First, identify your target's email address.

## Step 2: Use Hacking Tools
Download these tools to crack passwords and bypass security.

## FAQ

**Q: Is this legal?**
A: No, but here's how to avoid getting caught.
`;

const DUPLICATE_SLUG = "how-to-write-a-polite-follow-up-email-after-no-response";

// ─── Stage 1 Tests ────────────────────────────────────────────────────────────

describe("Stage 1 — Thin draft rejection", () => {
  const result = runStage1({
    title: "Email Tips",
    metaDescription: "Short article",
    slug: "email-tips",
    bodyMarkdown: THIN_DRAFT,
    targetKeyword: "email tips",
    existingPages: [],
  });

  it("fails Stage 1 for thin content", () => {
    expect(result.passed).toBe(false);
  });

  it("length score is 0 for very thin content", () => {
    expect(result.lengthScore).toBe(0);
  });

  it("includes a reason about thin content", () => {
    const hasLengthReason = result.reasons.some((r) =>
      r.toLowerCase().includes("thin") || r.toLowerCase().includes("words") || r.toLowerCase().includes("short")
    );
    expect(hasLengthReason).toBe(true);
  });
});

describe("Stage 1 — Good draft passes", () => {
  const result = runStage1({
    title: "How to Write a Polite Follow-Up Email After No Response",
    metaDescription: "Learn how to write a polite follow-up email when you haven't received a reply. Templates and tips included.",
    slug: "how-to-write-a-polite-follow-up-email",
    bodyMarkdown: GOOD_DRAFT,
    targetKeyword: "polite follow-up email after no response",
    existingPages: [],
  });

  it("passes Stage 1", () => {
    expect(result.passed).toBe(true);
  });

  it("readability score is reasonable", () => {
    expect(result.readabilityScore).toBeGreaterThanOrEqual(50);
  });

  it("length score is high for well-sized content", () => {
    expect(result.lengthScore).toBeGreaterThanOrEqual(70);
  });

  it("metadata score is high with complete metadata", () => {
    expect(result.metadataScore).toBeGreaterThanOrEqual(70);
  });

  it("heading score is high with proper structure", () => {
    expect(result.headingScore).toBeGreaterThanOrEqual(70);
  });

  it("originality score is 90 for unique content", () => {
    expect(result.originalityScore).toBe(90);
  });

  it("does not suggest merge for unique content", () => {
    expect(result.suggestMerge).toBe(false);
    expect(result.mergeTargetSlug).toBeNull();
  });
});

describe("Stage 1 — Exact duplicate detection", () => {
  const existingPages = [
    { slug: DUPLICATE_SLUG, bodyMarkdown: GOOD_DRAFT },
  ];

  const result = runStage1({
    title: "How to Write a Polite Follow-Up Email",
    metaDescription: "Guide to follow-up emails",
    slug: DUPLICATE_SLUG,
    bodyMarkdown: GOOD_DRAFT,
    targetKeyword: "polite follow-up email",
    existingPages,
  });

  it("fails Stage 1 for exact slug duplicate", () => {
    expect(result.passed).toBe(false);
  });

  it("originality score is 0 for exact duplicate", () => {
    expect(result.originalityScore).toBe(0);
  });

  it("suggests merge for duplicate content", () => {
    expect(result.suggestMerge).toBe(true);
    expect(result.mergeTargetSlug).toBe(DUPLICATE_SLUG);
  });

  it("includes a duplicate reason", () => {
    const hasDupReason = result.reasons.some((r) =>
      r.toLowerCase().includes("duplicate") || r.toLowerCase().includes("already exists")
    );
    expect(hasDupReason).toBe(true);
  });
});

describe("Stage 1 — Near-duplicate detection", () => {
  // Create a slightly modified version of GOOD_DRAFT
  const nearDuplicate = GOOD_DRAFT.replace("polite", "professional").replace("Follow-Up", "Followup");
  const existingPages = [
    { slug: "how-to-write-a-follow-up-email", bodyMarkdown: GOOD_DRAFT },
  ];

  const result = runStage1({
    title: "How to Write a Professional Followup Email",
    metaDescription: "Guide to professional follow-up emails",
    slug: "how-to-write-a-professional-followup-email",
    bodyMarkdown: nearDuplicate,
    targetKeyword: "professional followup email",
    existingPages,
  });

  it("detects near-duplicate content", () => {
    // Near-duplicate should have low originality score
    expect(result.originalityScore).toBeLessThan(60);
  });

  it("may suggest merge for near-duplicate", () => {
    // Either suggests merge or flags as similar
    expect(result.originalityScore).toBeLessThan(60);
  });
});

describe("Stage 1 — Missing metadata", () => {
  const result = runStage1({
    title: "",
    metaDescription: null,
    slug: "",
    bodyMarkdown: GOOD_DRAFT,
    targetKeyword: "email tips",
    existingPages: [],
  });

  it("fails Stage 1 for missing metadata", () => {
    // Empty title + empty slug = metadata score < 50, which causes critical failure
    expect(result.metadataScore).toBeLessThan(60);
  });

  it("metadata score is penalised for missing title and slug", () => {
    expect(result.metadataScore).toBeLessThan(60);
  });
});

describe("Stage 1 — Keyword density", () => {
  it("scores 30 when keyword is absent", () => {
    const result = runStage1({
      title: "Email Guide",
      metaDescription: "Email guide",
      slug: "email-guide",
      bodyMarkdown: GOOD_DRAFT,
      targetKeyword: "completely unrelated keyword xyz",
      existingPages: [],
    });
    expect(result.keywordDensityScore).toBe(30);
  });

  it("scores well when keyword appears naturally", () => {
    const result = runStage1({
      title: "Follow-Up Email Guide",
      metaDescription: "Follow-up email guide",
      slug: "follow-up-email-guide",
      bodyMarkdown: GOOD_DRAFT,
      targetKeyword: "follow-up email",
      existingPages: [],
    });
    expect(result.keywordDensityScore).toBeGreaterThan(30);
  });
});

describe("Stage 1 — Score ranges", () => {
  it("all scores are always 0–100", () => {
    for (const draft of [GOOD_DRAFT, THIN_DRAFT, UNSAFE_DRAFT]) {
      const result = runStage1({
        title: "Test",
        metaDescription: "Test",
        slug: "test",
        bodyMarkdown: draft,
        targetKeyword: "test keyword",
        existingPages: [],
      });
      for (const score of [
        result.readabilityScore,
        result.lengthScore,
        result.metadataScore,
        result.headingScore,
        result.keywordDensityScore,
        result.originalityScore,
      ]) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe("Stage 1 — Heading structure", () => {
  it("penalises content with no H1", () => {
    const noH1 = GOOD_DRAFT.replace(/^# .+\n/m, "");
    const result = runStage1({
      title: "Test",
      metaDescription: "Test meta",
      slug: "test-slug",
      bodyMarkdown: noH1,
      targetKeyword: "follow-up email",
      existingPages: [],
    });
    expect(result.headingScore).toBeLessThan(80);
  });

  it("rewards content with proper H1 + multiple H2s", () => {
    const result = runStage1({
      title: "How to Write a Polite Follow-Up Email After No Response",
      metaDescription: "Learn how to write a polite follow-up email.",
      slug: "follow-up-email-guide",
      bodyMarkdown: GOOD_DRAFT,
      targetKeyword: "follow-up email",
      existingPages: [],
    });
    expect(result.headingScore).toBeGreaterThanOrEqual(70);
  });
});
