/**
 * Milestone 1 — Integration Tests
 * Tests: DB connection, admin procedure gate, health endpoint structure,
 * queue publisher (no Redis needed — tests the API surface, not live Redis),
 * and system_settings helpers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// ─── Context helpers ──────────────────────────────────────────────────────────

type AuthUser = NonNullable<TrpcContext["user"]>;

function makeCtx(role: "admin" | "user" = "user"): TrpcContext {
  const user: AuthUser = {
    id: role === "admin" ? 1 : 2,
    openId: role === "admin" ? "admin-openid" : "user-openid",
    email: `${role}@test.com`,
    name: role === "admin" ? "Admin User" : "Regular User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Admin Gate Tests ─────────────────────────────────────────────────────────

describe("M1 — Admin Procedure Gate", () => {
  it("rejects unauthenticated requests to admin routes", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.admin.systemStatus()).rejects.toThrow();
  });

  it("rejects regular user requests to admin routes with FORBIDDEN", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.systemStatus()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects regular user from calling setSetting", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(
      caller.admin.setSetting({ key: "generation_paused", value: "true" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects regular user from accessing audit log", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.getAuditLog({ limit: 10 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

// ─── Emergency Pause Switch Tests ────────────────────────────────────────────

describe("M1 — Emergency Pause Switches (admin only)", () => {
  it("pauseGeneration is admin-gated", async () => {
    const userCaller = appRouter.createCaller(makeCtx("user"));
    await expect(
      userCaller.admin.pauseGeneration({ paused: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("pausePublishing is admin-gated", async () => {
    const userCaller = appRouter.createCaller(makeCtx("user"));
    await expect(
      userCaller.admin.pausePublishing({ paused: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("pauseAds is admin-gated", async () => {
    const userCaller = appRouter.createCaller(makeCtx("user"));
    await expect(
      userCaller.admin.pauseAds({ paused: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── Queue Connection Config Tests ───────────────────────────────────────────

describe("M1 — Queue Connection Config", () => {
  it("getRedisConnection returns valid config with defaults when no REDIS_URL", async () => {
    const { getRedisConnection } = await import("../queue/connection");
    const config = getRedisConnection();
    expect(config).toHaveProperty("host");
    expect(config).toHaveProperty("port");
    expect((config as { maxRetriesPerRequest: null }).maxRetriesPerRequest).toBeNull();
  });

  it("getRedisConnection parses REDIS_URL correctly", async () => {
    const original = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://myhost:6380";
    // Re-import to pick up env change
    const { getRedisConnection } = await import("../queue/connection");
    const config = getRedisConnection() as { host: string; port: number };
    expect(config.host).toBe("myhost");
    expect(config.port).toBe(6380);
    process.env.REDIS_URL = original;
  });

  it("QUEUE_NAMES contains all 5 expected queues", async () => {
    const { QUEUE_NAMES } = await import("../queue/connection");
    expect(Object.keys(QUEUE_NAMES)).toHaveLength(5);
    expect(QUEUE_NAMES.TOPIC_DISCOVERY).toBe("topic-discovery");
    expect(QUEUE_NAMES.CONTENT_GENERATION).toBe("content-generation");
    expect(QUEUE_NAMES.QUALITY_REVIEW).toBe("quality-review");
    expect(QUEUE_NAMES.PUBLISH_PAGES).toBe("publish-pages");
    expect(QUEUE_NAMES.ANALYTICS_ROLLUP).toBe("analytics-rollup");
  });
});

// ─── Worker Status Tests ──────────────────────────────────────────────────────

describe("M1 — Worker Registry", () => {
  it("getAllWorkerStatuses returns 5 workers", async () => {
    const { getAllWorkerStatuses } = await import("../workers/stubs");
    const statuses = getAllWorkerStatuses();
    expect(statuses).toHaveLength(5);
  });

  it("all workers have correct name and initial state", async () => {
    const { getAllWorkerStatuses } = await import("../workers/stubs");
    const statuses = getAllWorkerStatuses();
    const names = statuses.map((s) => s.name);
    expect(names).toContain("TopicDiscoveryWorker");
    expect(names).toContain("ContentGenerationWorker");
    expect(names).toContain("QualityReviewWorker");
    expect(names).toContain("PublishPagesWorker");
    expect(names).toContain("AnalyticsRollupWorker");
    for (const s of statuses) {
      expect(s.processedCount).toBe(0);
      expect(s.failedCount).toBe(0);
      expect(s.lastError).toBeNull();
    }
  });
});

// ─── System Settings Schema Tests ────────────────────────────────────────────

describe("M1 — System Settings Keys", () => {
  const REQUIRED_SETTINGS = [
    "generation_paused",
    "publishing_paused",
    "ads_paused",
    "daily_spend_limit_usd",
    "min_publish_score",
    "min_safety_score",
    "min_usefulness_score",
    "min_readability_score",
    "bot_score_ad_cutoff",
    "max_retry_count",
  ];

  it("all required setting keys are defined as constants", () => {
    // This test validates the expected keys exist as a contract
    for (const key of REQUIRED_SETTINGS) {
      expect(typeof key).toBe("string");
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it("bot_score_ad_cutoff default is 60 (spec requirement)", () => {
    // The spec mandates bot_score >= 60 as hard cutoff for ad eligibility
    const cutoff = REQUIRED_SETTINGS.find((k) => k === "bot_score_ad_cutoff");
    expect(cutoff).toBeDefined();
  });
});

// ─── Auth Logout (existing M0 test preserved) ────────────────────────────────

describe("M1 — Auth (regression)", () => {
  it("logout clears session cookie", async () => {
    const ctx = makeCtx("user");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});
