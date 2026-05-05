/**
 * M3 — Generation Admin Router
 * Admin-only procedures for content generation management:
 *   - generation.listJobs: paginated job audit log
 *   - generation.spendSummary: today's spend vs limit
 *   - generation.triggerGeneration: run generation for a topic or batch
 *   - generation.getPageDraft: preview a generated draft
 *   - generation.listDrafts: list all drafts with status
 */

import { z } from "zod";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, logAdminAction } from "../db";
import { generationJobs, contentPages, topics } from "../../drizzle/schema";
import { runContentGeneration } from "../m3/worker";
import { getSpendSummary, checkDailySpendLimit } from "../m3/spend";
import { generateBrief } from "../m3/brief";

// ─── adminProcedure ───────────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const generationRouter = router({
  /** Paginated generation job audit log */
  listJobs: adminProcedure
    .input(
      z.object({
        status: z.enum(["queued", "running", "completed", "failed", "skipped", "all"]).default("all"),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { jobs: [], total: 0 };

      const where = input.status !== "all" ? eq(generationJobs.status, input.status) : undefined;

      const [jobs, countResult] = await Promise.all([
        db.select().from(generationJobs)
          .where(where)
          .orderBy(desc(generationJobs.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` }).from(generationJobs).where(where),
      ]);

      return { jobs, total: Number(countResult[0]?.count ?? 0) };
    }),

  /** Today's spend summary */
  spendSummary: adminProcedure.query(async () => {
    const [summary, spendCheck] = await Promise.all([
      getSpendSummary(),
      checkDailySpendLimit(),
    ]);
    return { ...summary, limitReached: !spendCheck.allowed };
  }),

  /** Preview a generated draft */
  getPageDraft: adminProcedure
    .input(z.object({ pageId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(contentPages)
        .where(eq(contentPages.id, input.pageId)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      return rows[0];
    }),

  /** List all drafts with topic info */
  listDrafts: adminProcedure
    .input(
      z.object({
        status: z.enum(["draft", "reviewing", "approved", "published", "archived", "rejected", "all"]).default("all"),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { drafts: [], total: 0 };

      const where = input.status !== "all" ? eq(contentPages.status, input.status) : undefined;

      const [drafts, countResult] = await Promise.all([
        db.select({
          id: contentPages.id,
          topicId: contentPages.topicId,
          slug: contentPages.slug,
          title: contentPages.title,
          status: contentPages.status,
          policyStatus: contentPages.policyStatus,
          publishScore: contentPages.publishScore,
          safetyScore: contentPages.safetyScore,
          usefulnessScore: contentPages.usefulnessScore,
          readabilityScore: contentPages.readabilityScore,
          version: contentPages.version,
          qualityDecision: contentPages.qualityDecision,
          createdAt: contentPages.createdAt,
        })
          .from(contentPages)
          .where(where)
          .orderBy(desc(contentPages.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` }).from(contentPages).where(where),
      ]);

      return { drafts, total: Number(countResult[0]?.count ?? 0) };
    }),

  /** Preview a brief for a topic (without generating) */
  previewBrief: adminProcedure
    .input(z.object({ topicId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const topicRows = await db.select().from(topics).where(eq(topics.id, input.topicId)).limit(1);
      const topic = topicRows[0];
      if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "Topic not found" });

      const brief = generateBrief(topic.keyword, []);
      return { topic, brief };
    }),

  /** Trigger content generation for a topic or batch */
  triggerGeneration: adminProcedure
    .input(
      z.object({
        topicId: z.number().optional(),
        batchSize: z.number().min(1).max(10).default(3),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await logAdminAction({
        userId: ctx.user.id,
        action: "trigger_generation",
        target: input.topicId ? `topic_${input.topicId}` : "batch",
        details: { topicId: input.topicId, batchSize: input.batchSize },
      });

      const results = await runContentGeneration({
        topicId: input.topicId,
        batchSize: input.batchSize,
      });

      const succeeded = results.filter((r) => r.success).length;
      const totalCost = results.reduce((s, r) => s + r.estimatedCostUsd, 0);

      return {
        success: true,
        results: results.map((r) => ({
          topicId: r.topicId,
          pageId: r.pageId,
          success: r.success,
          totalTokens: r.totalTokens,
          estimatedCostUsd: r.estimatedCostUsd,
          latencyMs: r.latencyMs,
          errorMessage: r.errorMessage,
          version: r.version,
        })),
        summary: {
          succeeded,
          failed: results.length - succeeded,
          totalCostUsd: parseFloat(totalCost.toFixed(6)),
        },
      };
    }),
});
