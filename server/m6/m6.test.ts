import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOT_SCORE_AD_CUTOFF,
  buildPageEventValues,
  calculateBotScore,
  evaluateAdEligibility,
  extractTrafficSignals,
} from "./ads";

function makeRequest(overrides?: {
  headers?: Record<string, string>;
  originalUrl?: string;
}) {
  return {
    protocol: "https",
    ip: "203.0.113.9",
    originalUrl: overrides?.originalUrl ?? "/api/trpc/publishing.getPage",
    headers: {
      host: "publisher.example.com",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "accept-language": "en-US,en;q=0.9",
      referer: "https://publisher.example.com/p/remote-work-productivity-tips",
      ...overrides?.headers,
    },
  };
}

function makePage(overrides?: Partial<{
  status: "draft" | "reviewing" | "approved" | "published" | "archived" | "rejected";
  policyStatus: "pending" | "approved" | "flagged" | "rejected";
  qualityDecision: "approve" | "retry" | "merge" | "reject" | null;
}>) {
  return {
    id: 7,
    status: "published" as const,
    policyStatus: "approved" as const,
    qualityDecision: "approve" as const,
    ...overrides,
  };
}

describe("M6 bot score calculation", () => {
  it("keeps normal browser traffic below the ad cutoff", () => {
    const request = extractTrafficSignals(makeRequest(), "user");
    expect(calculateBotScore(request)).toBeLessThan(DEFAULT_BOT_SCORE_AD_CUTOFF);
  });

  it("hard-blocks obvious automation user agents", () => {
    const request = extractTrafficSignals(
      makeRequest({
        headers: {
          "user-agent": "curl/8.7.1",
          "accept-language": "",
          referer: "",
        },
      }),
      null,
    );
    expect(calculateBotScore(request)).toBe(100);
  });
});

describe("M6 ad eligibility", () => {
  it("allows ads only for fully public, human sessions", () => {
    const request = extractTrafficSignals(makeRequest(), "user");
    const result = evaluateAdEligibility({
      page: makePage(),
      request,
      adsPaused: false,
    });
    expect(result.eligible).toBe(true);
    expect(result.blockedReasons).toEqual([]);
  });

  it("never serves ads when ads are paused", () => {
    const request = extractTrafficSignals(makeRequest(), "user");
    const result = evaluateAdEligibility({
      page: makePage(),
      request,
      adsPaused: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockedReasons).toContain("ads_paused");
  });

  it("never serves ads to admin sessions", () => {
    const request = extractTrafficSignals(makeRequest(), "admin");
    const result = evaluateAdEligibility({
      page: makePage(),
      request,
      adsPaused: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockedReasons).toContain("admin_session");
  });

  it("never serves ads to preview sessions", () => {
    const request = extractTrafficSignals(
      makeRequest({
        headers: {
          referer: "https://publisher.example.com/p/remote-work-productivity-tips?preview=1",
        },
      }),
      "user",
    );
    const result = evaluateAdEligibility({
      page: makePage(),
      request,
      adsPaused: false,
    });
    expect(request.isPreview).toBe(true);
    expect(result.eligible).toBe(false);
    expect(result.blockedReasons).toContain("preview_session");
  });

  it("never serves ads to draft pages", () => {
    const request = extractTrafficSignals(makeRequest(), "user");
    const result = evaluateAdEligibility({
      page: makePage({ status: "draft", qualityDecision: null, policyStatus: "pending" }),
      request,
      adsPaused: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockedReasons).toContain("status_draft");
  });

  it("never serves ads to retry decisions", () => {
    const request = extractTrafficSignals(makeRequest(), "user");
    const result = evaluateAdEligibility({
      page: makePage({ qualityDecision: "retry" }),
      request,
      adsPaused: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockedReasons).toContain("quality_retry");
  });

  it("never serves ads to rejected pages", () => {
    const request = extractTrafficSignals(makeRequest(), "user");
    const result = evaluateAdEligibility({
      page: makePage({ status: "rejected", policyStatus: "rejected", qualityDecision: "reject" }),
      request,
      adsPaused: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockedReasons).toContain("status_rejected");
    expect(result.blockedReasons).toContain("quality_reject");
  });

  it("never serves ads to suspicious sessions and emits bot logging events", () => {
    const request = extractTrafficSignals(
      makeRequest({
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; HeadlessChrome; +https://example.com/bot)",
          "accept-language": "",
          referer: "",
        },
      }),
      "user",
    );
    const result = evaluateAdEligibility({
      page: makePage(),
      request,
      adsPaused: false,
    });
    const events = buildPageEventValues(7, result);
    expect(result.eligible).toBe(false);
    expect(result.isSuspicious).toBe(true);
    expect(result.blockedReasons).toContain("suspicious_session");
    expect(events.map((event) => event.eventType)).toEqual(["page_view", "bot_blocked"]);
    expect(events.every((event) => event.adEligible === false)).toBe(true);
  });
});
