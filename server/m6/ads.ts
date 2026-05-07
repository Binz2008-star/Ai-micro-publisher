import { createHash } from "node:crypto";
import { parse as parseCookie } from "cookie";
import type { Request } from "express";
import { pageEvents } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { getDb, getSetting } from "../db";
import type { TrpcContext } from "../_core/context";
import type { PageStatus, PolicyStatus, QualityDecision } from "../m5/visibility";

export const DEFAULT_BOT_SCORE_AD_CUTOFF = 60;

type RequestLike = Partial<Pick<Request, "headers" | "ip" | "originalUrl" | "protocol" | "query" | "url">> & {
  socket?: { remoteAddress?: string | null };
};

export type PublicPageRecord = {
  id: number;
  status: PageStatus;
  policyStatus: PolicyStatus;
  qualityDecision: QualityDecision;
};

export type TrafficSignals = {
  userAgent: string;
  acceptLanguage: string;
  referrer: string;
  ipAddress: string;
  sessionId: string | null;
  isPreview: boolean;
  isAdmin: boolean;
  isInternal: boolean;
  country: string | null;
};

export type BotScoreDetails = {
  score: number;
  signals: string[];
};

export type AdEligibilityDecision = {
  eligible: boolean;
  botScore: number;
  isSuspicious: boolean;
  blockedReasons: string[];
  trafficSignals: string[];
  request: TrafficSignals;
};

export type PublicAdSlot = {
  enabled: boolean;
  placement: "article-inline-1" | null;
};

const BOT_SIGNATURES = [
  /bot\b/i,
  /crawler/i,
  /spider/i,
  /slurp/i,
  /headless/i,
  /selenium/i,
  /playwright/i,
  /puppeteer/i,
  /phantomjs/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /postmanruntime/i,
  /insomnia/i,
  /go-http-client/i,
  /apache-httpclient/i,
];

const TRUE_LIKE_VALUES = new Set(["1", "true", "yes", "on", "preview"]);

function getHeader(req: RequestLike | undefined, name: string): string {
  const headers = req?.headers;
  if (!headers) return "";

  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value.find((entry) => typeof entry === "string" && entry.trim().length > 0)?.trim() ?? "";
  }

  return typeof value === "string" ? value.trim() : "";
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

function parseBooleanLike(value: string | null | undefined): boolean {
  if (!value) return false;
  return TRUE_LIKE_VALUES.has(value.trim().toLowerCase());
}

function safeParseUrl(rawUrl: string): URL | null {
  if (!rawUrl) return null;

  try {
    return new URL(rawUrl);
  } catch {
    try {
      return new URL(rawUrl, "https://local.test");
    } catch {
      return null;
    }
  }
}

function isPrivateIp(ipAddress: string): boolean {
  if (!ipAddress) return false;

  const normalized = ipAddress.replace(/^::ffff:/, "");
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)
  );
}

function hashValue(value: string | null): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}

function parsePreviewHint(req: RequestLike | undefined, referrer: string): boolean {
  const explicitPreviewHeader = getHeader(req, "x-preview-mode") || getHeader(req, "x-m6-preview");
  if (parseBooleanLike(explicitPreviewHeader)) return true;

  const requestUrl = safeParseUrl(req?.originalUrl ?? req?.url ?? "");
  const requestPreview =
    requestUrl?.searchParams.get("preview") ??
    requestUrl?.searchParams.get("draft") ??
    requestUrl?.searchParams.get("mode");
  if (parseBooleanLike(requestPreview)) return true;

  const referrerUrl = safeParseUrl(referrer);
  const referrerPreview =
    referrerUrl?.searchParams.get("preview") ??
    referrerUrl?.searchParams.get("draft") ??
    referrerUrl?.searchParams.get("mode");

  return parseBooleanLike(referrerPreview);
}

export function extractTrafficSignals(
  req: RequestLike | undefined,
  userRole: "admin" | "user" | null,
): TrafficSignals {
  const userAgent = truncate(getHeader(req, "user-agent"), 512);
  const acceptLanguage = truncate(getHeader(req, "accept-language"), 128);
  const referrer = truncate(getHeader(req, "referer") || getHeader(req, "referrer"), 512);
  const forwardedFor = getHeader(req, "x-forwarded-for");
  const ipAddress = truncate(
    (forwardedFor ? forwardedFor.split(",")[0] : "").trim() ||
      getHeader(req, "x-real-ip") ||
      req?.ip?.trim() ||
      req?.socket?.remoteAddress?.trim() ||
      "",
    128,
  );
  const rawCookie = getHeader(req, "cookie");
  const parsedCookies = rawCookie ? parseCookie(rawCookie) : {};
  const sessionId = parsedCookies[COOKIE_NAME] ?? null;
  const host = getHeader(req, "host");
  const hostName = safeParseUrl(`https://${host}`)?.hostname ?? host.split(":")[0] ?? "";
  const country =
    truncate(getHeader(req, "cf-ipcountry") || getHeader(req, "x-vercel-ip-country"), 8) || null;

  return {
    userAgent,
    acceptLanguage,
    referrer,
    ipAddress,
    sessionId,
    isPreview: parsePreviewHint(req, referrer),
    isAdmin: userRole === "admin",
    isInternal:
      hostName === "localhost" ||
      hostName === "127.0.0.1" ||
      hostName === "::1" ||
      isPrivateIp(ipAddress),
    country,
  };
}

export function explainBotScore(
  signals: Pick<TrafficSignals, "userAgent" | "acceptLanguage" | "referrer">,
): BotScoreDetails {
  const userAgent = signals.userAgent.trim();
  const acceptLanguage = signals.acceptLanguage.trim();
  const referrer = signals.referrer.trim();

  if (!userAgent) {
    return {
      score: 100,
      signals: ["missing_user_agent"],
    };
  }

  if (BOT_SIGNATURES.some((pattern) => pattern.test(userAgent))) {
    return {
      score: 100,
      signals: ["automation_user_agent"],
    };
  }

  let score = 0;
  const reasons: string[] = [];

  if (!acceptLanguage) {
    score += 15;
    reasons.push("missing_accept_language");
  }

  if (!referrer) {
    score += 5;
    reasons.push("missing_referrer");
  }

  return {
    score: Math.min(100, score),
    signals: reasons,
  };
}

export function calculateBotScore(
  signals: Pick<TrafficSignals, "userAgent" | "acceptLanguage" | "referrer">,
): number {
  return explainBotScore(signals).score;
}

function normalizeCutoff(rawValue: string | null): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_BOT_SCORE_AD_CUTOFF;
  return Math.min(100, Math.max(0, parsed));
}

export function evaluateAdEligibility(input: {
  page: PublicPageRecord;
  request: TrafficSignals;
  adsPaused: boolean;
  botScoreCutoff?: number;
}): AdEligibilityDecision {
  const details = explainBotScore(input.request);
  const cutoff = input.botScoreCutoff ?? DEFAULT_BOT_SCORE_AD_CUTOFF;
  const blockedReasons: string[] = [];

  if (input.adsPaused) blockedReasons.push("ads_paused");
  if (input.request.isAdmin) blockedReasons.push("admin_session");
  if (input.request.isPreview) blockedReasons.push("preview_session");
  if (input.page.status !== "published") blockedReasons.push(`status_${input.page.status}`);
  if (input.page.policyStatus !== "approved") blockedReasons.push(`policy_${input.page.policyStatus}`);
  if (input.page.qualityDecision !== "approve") {
    blockedReasons.push(`quality_${input.page.qualityDecision ?? "none"}`);
  }
  if (details.score >= cutoff) blockedReasons.push("suspicious_session");

  return {
    eligible: blockedReasons.length === 0,
    botScore: details.score,
    isSuspicious: blockedReasons.includes("suspicious_session"),
    blockedReasons,
    trafficSignals: details.signals,
    request: input.request,
  };
}

export function buildPageEventValues(pageId: number, decision: AdEligibilityDecision) {
  const baseEvent = {
    pageId,
    sessionHash: hashValue(decision.request.sessionId),
    ipHash: hashValue(decision.request.ipAddress || null),
    userAgent: decision.request.userAgent || null,
    referrer: decision.request.referrer || null,
    botScore: decision.botScore,
    adEligible: decision.eligible,
    isAdmin: decision.request.isAdmin,
    isInternal: decision.request.isInternal,
    turnstilePassed: null,
    country: decision.request.country,
  };

  return [
    {
      ...baseEvent,
      eventType: "page_view" as const,
    },
    ...(decision.isSuspicious
      ? [
          {
            ...baseEvent,
            eventType: "bot_blocked" as const,
            adEligible: false,
          },
        ]
      : []),
  ];
}

async function logPageTraffic(pageId: number, decision: AdEligibilityDecision): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(pageEvents).values(buildPageEventValues(pageId, decision));
  } catch (error) {
    console.warn("[M6] Failed to log page traffic:", error);
  }
}

export async function resolvePublicAdSlot(
  ctx: Pick<TrpcContext, "req" | "user">,
  page: PublicPageRecord,
): Promise<{
  adSlot: PublicAdSlot;
  decision: AdEligibilityDecision;
}> {
  const request = extractTrafficSignals(ctx.req, ctx.user?.role ?? null);
  const [adsPausedValue, cutoffValue] = await Promise.all([
    getSetting("ads_paused"),
    getSetting("bot_score_ad_cutoff"),
  ]);

  const decision = evaluateAdEligibility({
    page,
    request,
    adsPaused: adsPausedValue === "true",
    botScoreCutoff: normalizeCutoff(cutoffValue),
  });

  await logPageTraffic(page.id, decision);

  return {
    adSlot: {
      enabled: decision.eligible,
      placement: decision.eligible ? "article-inline-1" : null,
    },
    decision,
  };
}
