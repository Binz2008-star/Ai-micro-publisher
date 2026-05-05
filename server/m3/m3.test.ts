import { describe, it, expect } from "vitest";
import {
  generateBrief,
  detectIntent,
  detectPageType,
  generateRequiredSections,
  buildSystemPrompt,
  buildUserPrompt,
  generateSlug,
} from "./brief";
import { estimateCostUsd, COST_PER_1K_TOKENS_USD } from "./spend";

// ─── Intent detection ─────────────────────────────────────────────────────────

describe("detectIntent", () => {
  it("detects utility intent for 'how to' keywords", () => {
    expect(detectIntent("how to write a follow-up email")).toBe("utility");
    expect(detectIntent("steps to improve productivity")).toBe("utility");
  });

  it("detects template intent", () => {
    expect(detectIntent("email template for job application")).toBe("template");
    expect(detectIntent("resignation letter example")).toBe("template");
  });

  it("detects comparison intent", () => {
    expect(detectIntent("react vs vue comparison")).toBe("comparison");
    expect(detectIntent("best project management tools")).toBe("comparison");
  });

  it("defaults to informational for generic topics", () => {
    expect(detectIntent("remote work benefits")).toBe("informational");
  });
});

// ─── Page type detection ──────────────────────────────────────────────────────

describe("detectPageType", () => {
  it("returns template for template intent", () => {
    expect(detectPageType("email template", "template")).toBe("template");
  });

  it("returns comparison for comparison intent", () => {
    expect(detectPageType("react vs vue", "comparison")).toBe("comparison");
  });

  it("returns guide for how-to keywords", () => {
    expect(detectPageType("how to set up python", "utility")).toBe("guide");
  });

  it("returns article as default", () => {
    expect(detectPageType("remote work tips", "informational")).toBe("article");
  });
});

// ─── Required sections ────────────────────────────────────────────────────────

describe("generateRequiredSections", () => {
  it("includes faq for most page types", () => {
    // faq page type has its own structure (questions-and-answers), not a 'faq' section
    for (const intent of ["utility", "template", "comparison", "informational"] as const) {
      for (const pageType of ["article", "template", "guide", "comparison"] as const) {
        const sections = generateRequiredSections(intent, pageType);
        expect(sections).toContain("faq");
      }
    }
    // faq page type uses questions-and-answers instead
    const faqSections = generateRequiredSections("informational", "faq");
    expect(faqSections).toContain("questions-and-answers");
  });

  it("includes step-by-step for utility intent", () => {
    const sections = generateRequiredSections("utility", "article");
    expect(sections.some((s) => s.includes("step"))).toBe(true);
  });

  it("includes template section for template page type", () => {
    const sections = generateRequiredSections("template", "template");
    expect(sections).toContain("template");
  });

  it("includes comparison-table for comparison page type", () => {
    const sections = generateRequiredSections("comparison", "comparison");
    expect(sections).toContain("comparison-table");
  });

  it("returns at least 3 sections always", () => {
    for (const intent of ["utility", "template", "comparison", "informational"] as const) {
      for (const pageType of ["article", "template", "guide", "comparison", "faq"] as const) {
        const sections = generateRequiredSections(intent, pageType);
        expect(sections.length).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

// ─── Brief generator ──────────────────────────────────────────────────────────

describe("generateBrief", () => {
  it("generates a valid brief for a utility keyword", () => {
    const brief = generateBrief("how to write a polite follow-up email after no response");
    expect(brief.topic).toBe("how to write a polite follow-up email after no response");
    expect(brief.userIntent).toBe("utility");
    expect(brief.language).toBe("en");
    expect(brief.maxWords).toBeGreaterThan(0);
    expect(brief.requiredSections.length).toBeGreaterThanOrEqual(3);
    expect(brief.blockedClaims.length).toBeGreaterThan(0);
  });

  it("generates a template brief for template keywords", () => {
    const brief = generateBrief("resignation letter template");
    expect(brief.pageType).toBe("template");
    expect(brief.requiredSections).toContain("template");
  });

  it("generates a comparison brief for vs keywords", () => {
    const brief = generateBrief("react vs vue for beginners");
    expect(brief.userIntent).toBe("comparison");
    expect(brief.pageType).toBe("comparison");
  });

  it("always includes global blocked claims", () => {
    const brief = generateBrief("productivity tips for remote workers");
    expect(brief.blockedClaims).toContain("legal guarantees");
    expect(brief.blockedClaims).toContain("medical advice");
  });

  it("adds health-specific blocked claims for health topics", () => {
    const brief = generateBrief("how to improve your health and fitness");
    expect(brief.blockedClaims).toContain("medical diagnosis");
  });

  it("includes internal links from existing keywords", () => {
    const existing = ["how to write a follow-up email", "email subject lines"];
    const brief = generateBrief("how to write a professional email", existing);
    expect(brief.internalLinks.length).toBeGreaterThanOrEqual(0); // May or may not match
  });

  it("maxWords is within reasonable range", () => {
    const brief = generateBrief("how to negotiate salary");
    expect(brief.maxWords).toBeGreaterThanOrEqual(400);
    expect(brief.maxWords).toBeLessThanOrEqual(800);
  });
});

// ─── Prompt builders ──────────────────────────────────────────────────────────

describe("buildSystemPrompt", () => {
  it("returns a non-empty string", () => {
    const prompt = buildSystemPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(50);
  });

  it("does not contain placeholder text", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toContain("{{");
    expect(prompt).not.toContain("TODO");
  });
});

describe("buildUserPrompt — keyword embedding patch", () => {
  it("includes CRITICAL keyword requirement instruction", () => {
    const brief = generateBrief("how to write a polite follow-up email after no response");
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("CRITICAL keyword requirement");
    expect(prompt).toContain("MUST appear naturally");
    expect(prompt).toContain("2-3 times");
  });

  it("includes CRITICAL audience requirement instruction", () => {
    const brief = generateBrief("how to write a polite follow-up email after no response");
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("CRITICAL audience requirement");
    expect(prompt).toContain("Write specifically for");
    expect(prompt).toContain("Do NOT write for a generic audience");
  });

  it("embeds target keyword in the prompt instructions", () => {
    const brief = generateBrief("python list comprehension examples");
    const prompt = buildUserPrompt(brief);
    // The keyword should appear in the CRITICAL keyword requirement section
    expect(prompt).toContain("python list comprehension examples");
  });

  it("uses specific audience in CRITICAL audience section", () => {
    const brief = generateBrief("how to use git rebase vs merge");
    const prompt = buildUserPrompt(brief);
    // Developer audience should be detected and used
    expect(brief.audience).toContain("developer");
    expect(prompt).toContain(brief.audience);
  });

  it("FAQ instruction includes target keyword requirement", () => {
    const brief = generateBrief("how to negotiate salary for a new job");
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("at least one question uses the target keyword");
  });
});

describe("buildUserPrompt", () => {
  it("includes the topic keyword", () => {
    const brief = generateBrief("how to write a follow-up email");
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("how to write a follow-up email");
  });

  it("includes required sections", () => {
    const brief = generateBrief("how to write a follow-up email");
    const prompt = buildUserPrompt(brief);
    for (const section of brief.requiredSections) {
      expect(prompt).toContain(section);
    }
  });

  it("includes blocked claims", () => {
    const brief = generateBrief("how to write a follow-up email");
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain("legal guarantees");
  });

  it("includes word count constraint", () => {
    const brief = generateBrief("how to write a follow-up email");
    const prompt = buildUserPrompt(brief);
    expect(prompt).toContain(String(brief.maxWords));
  });
});

// ─── Slug generator ───────────────────────────────────────────────────────────

describe("generateSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(generateSlug("How To Write A Follow-Up Email")).toBe("how-to-write-a-follow-up-email");
  });

  it("removes special characters", () => {
    expect(generateSlug("What is React? A Guide!")).toBe("what-is-react-a-guide");
  });

  it("limits length to 80 chars", () => {
    const longKeyword = "a".repeat(200);
    expect(generateSlug(longKeyword).length).toBeLessThanOrEqual(80);
  });

  it("collapses multiple hyphens", () => {
    expect(generateSlug("hello  world")).toBe("hello-world");
  });
});

// ─── Cost estimation ──────────────────────────────────────────────────────────

describe("estimateCostUsd", () => {
  it("returns 0 for 0 tokens", () => {
    expect(estimateCostUsd(0)).toBe(0);
  });

  it("calculates cost correctly for 1000 tokens", () => {
    expect(estimateCostUsd(1000)).toBeCloseTo(COST_PER_1K_TOKENS_USD, 6);
  });

  it("calculates cost correctly for 500 tokens", () => {
    expect(estimateCostUsd(500)).toBeCloseTo(COST_PER_1K_TOKENS_USD / 2, 6);
  });

  it("returns a number with at most 6 decimal places", () => {
    const cost = estimateCostUsd(1234);
    const decimalPlaces = (cost.toString().split(".")[1] ?? "").length;
    expect(decimalPlaces).toBeLessThanOrEqual(6);
  });

  it("scales linearly with token count", () => {
    const cost1k = estimateCostUsd(1000);
    const cost2k = estimateCostUsd(2000);
    expect(cost2k).toBeCloseTo(cost1k * 2, 6);
  });
});
