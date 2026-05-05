/**
 * M3 — Spend Tracking & Daily Limit Enforcement
 *
 * Tracks LLM generation costs and enforces the daily spend limit
 * configured in system_settings.daily_spend_limit_usd.
 *
 * Cost model: $0.002 per 1K tokens (conservative estimate for built-in LLM)
 */

import { sql, gte, and } from "drizzle-orm";
import { getDb, getSetting } from "../db";
import { generationJobs } from "../../drizzle/schema";

// ─── Cost estimation ──────────────────────────────────────────────────────────

export const COST_PER_1K_TOKENS_USD = 0.002;

export function estimateCostUsd(totalTokens: number): number {
  return parseFloat(((totalTokens / 1000) * COST_PER_1K_TOKENS_USD).toFixed(6));
}

// ─── Daily spend aggregation ──────────────────────────────────────────────────

export async function getDailySpendUsd(dateStr?: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const today = dateStr ?? new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const startOfDay = new Date(today + "T00:00:00.000Z");

  try {
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(estimated_cost_usd), 0)` })
      .from(generationJobs)
      .where(
        and(
          gte(generationJobs.createdAt, startOfDay),
          sql`DATE(createdAt) = ${today}`,
        )
      );

    return parseFloat(String(result[0]?.total ?? 0));
  } catch (err) {
    console.error("[SpendTracker] Failed to get daily spend:", err);
    return 0;
  }
}

// ─── Spend limit check ────────────────────────────────────────────────────────

export interface SpendCheckResult {
  allowed: boolean;
  currentSpendUsd: number;
  limitUsd: number;
  remainingUsd: number;
  reason?: string;
}

export async function checkDailySpendLimit(): Promise<SpendCheckResult> {
  const limitStr = await getSetting("daily_spend_limit_usd");
  const limitUsd = parseFloat(limitStr ?? "5.00");

  const currentSpendUsd = await getDailySpendUsd();
  const remainingUsd = Math.max(0, limitUsd - currentSpendUsd);
  const allowed = currentSpendUsd < limitUsd;

  return {
    allowed,
    currentSpendUsd: parseFloat(currentSpendUsd.toFixed(6)),
    limitUsd,
    remainingUsd: parseFloat(remainingUsd.toFixed(6)),
    reason: allowed ? undefined : `Daily spend limit reached: $${currentSpendUsd.toFixed(4)} / $${limitUsd.toFixed(2)}`,
  };
}

// ─── Spend summary ────────────────────────────────────────────────────────────

export interface SpendSummary {
  todayUsd: number;
  limitUsd: number;
  remainingUsd: number;
  percentUsed: number;
  totalJobsToday: number;
  avgCostPerJobUsd: number;
}

export async function getSpendSummary(): Promise<SpendSummary> {
  const db = await getDb();
  const limitStr = await getSetting("daily_spend_limit_usd");
  const limitUsd = parseFloat(limitStr ?? "5.00");

  if (!db) {
    return { todayUsd: 0, limitUsd, remainingUsd: limitUsd, percentUsed: 0, totalJobsToday: 0, avgCostPerJobUsd: 0 };
  }

  const today = new Date().toISOString().split("T")[0];

  try {
    const result = await db
      .select({
        total: sql<number>`COALESCE(SUM(estimated_cost_usd), 0)`,
        count: sql<number>`COUNT(*)`,
      })
      .from(generationJobs)
      .where(sql`DATE(createdAt) = ${today}`);

    const todayUsd = parseFloat(String(result[0]?.total ?? 0));
    const totalJobsToday = Number(result[0]?.count ?? 0);
    const remainingUsd = Math.max(0, limitUsd - todayUsd);
    const percentUsed = limitUsd > 0 ? Math.min(100, (todayUsd / limitUsd) * 100) : 0;
    const avgCostPerJobUsd = totalJobsToday > 0 ? todayUsd / totalJobsToday : 0;

    return {
      todayUsd: parseFloat(todayUsd.toFixed(6)),
      limitUsd,
      remainingUsd: parseFloat(remainingUsd.toFixed(6)),
      percentUsed: parseFloat(percentUsed.toFixed(1)),
      totalJobsToday,
      avgCostPerJobUsd: parseFloat(avgCostPerJobUsd.toFixed(6)),
    };
  } catch (err) {
    console.error("[SpendTracker] Failed to get spend summary:", err);
    return { todayUsd: 0, limitUsd, remainingUsd: limitUsd, percentUsed: 0, totalJobsToday: 0, avgCostPerJobUsd: 0 };
  }
}
