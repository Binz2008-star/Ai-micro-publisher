/**
 * M4 — Quality Review Admin Router
 * Admin-only procedures for quality review management:
 *   - quality.listPending: list drafts awaiting review
 *   - quality.reviewPage: run quality review on a single page
 *   - quality.reviewAll: run quality review on all pending drafts
 *   - quality.getReviewDetail: get full review result for a page
 *   - quality.manualOverride: admin manually sets decision
 *   - quality.stats: counts by decision/status
 */

import { z } from "zod";
import { desc, eq, sql, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, logAdminAction } from "../db";
import { contentPages } from "../../drizzle/schema";
import { reviewPage, reviewAllPendingPages } from "../m4/runner";

// ─── adminProcedure ───────────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const qualityRouter = router({
  /** List pages pending quality review */
  listPending: adminProcedure
    .input(
      z.object({
        status: z.enum(["draft", "reviewing", "approved", "rejected", "all"]).default("all"),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { pages: [], total: 0 };

      const where = input.status !== "all" ? eq(contentPages.status, input.status) : undefined;

      const [pages, countResult] = await Promise.all([
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
          coherenceScore: contentPages.coherenceScore,
          factualGroundingScore: contentPages.factualGroundingScore,
          readabilityScore: contentPages.readabilityScore,
          originalityScore: contentPages.originalityScore,
          qualityDecision: contentPages.qualityDecision,
          qualityReasons: contentPages.qualityReasons,
          rejectionReason: contentPages.rejectionReason,
          version: contentPages.version,
          createdAt: contentPages.createdAt,
        })
          .from(contentPages)
          .where(where)
          .orderBy(desc(contentPages.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` }).from(contentPages).where(where),
      ]);

      return { pages, total: Number(countResult[0]?.count ?? 0) };
    }),

  /** Quality review stats */
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return {};

    const rows = await db
      .select({
        status: contentPages.status,
        decision: contentPages.qualityDecision,
        count: sql<number>`count(*)`,
      })
      .from(contentPages)
      .groupBy(contentPages.status, contentPages.qualityDecision);

    const stats: Record<string, number> = {
      draft: 0, reviewing: 0, approved: 0, rejected: 0, published: 0, archived: 0,
    };
    for (const row of rows) {
      stats[row.status] = (stats[row.status] ?? 0) + Number(row.count);
    }
    stats.total = Object.values(stats).reduce((a, b) => a + b, 0);
    return stats;
  }),

  /** Run quality review on a single page */
  reviewPage: adminProcedure
    .input(z.object({ pageId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await logAdminAction({
        userId: ctx.user.id,
        action: "trigger_quality_review",
        target: `page_${input.pageId}`,
        details: { pageId: input.pageId },
      });

      const result = await reviewPage(input.pageId);
      return { success: true, result };
    }),

  /** Run quality review on all pending drafts */
  reviewAll: adminProcedure.mutation(async ({ ctx }) => {
    await logAdminAction({
      userId: ctx.user.id,
      action: "trigger_quality_review_all",
      target: "all_pending",
      details: {},
    });

    const results = await reviewAllPendingPages();
    const approved = results.filter((r) => r.decision === "approve").length;
    const rejected = results.filter((r) => r.decision === "reject" || r.decision === "reject_stage1").length;
    const retry = results.filter((r) => r.decision === "retry").length;
    const merge = results.filter((r) => r.decision === "merge").length;

    return {
      success: true,
      summary: { total: results.length, approved, rejected, retry, merge },
      results: results.map((r) => ({
        pageId: r.pageId,
        decision: r.decision,
        publishScore: r.publishScore,
        safetyScore: r.safetyScore,
        usefulnessScore: r.usefulnessScore,
        coherenceScore: r.coherenceScore,
        factualGroundingScore: r.factualGroundingScore,
        readabilityScore: r.readabilityScore,
        originalityScore: r.originalityScore,
        policyStatus: r.policyStatus,
        reasons: r.reasons.slice(0, 3),
        suggestMerge: r.suggestMerge,
        mergeTargetSlug: r.mergeTargetSlug,
      })),
    };
  }),

  /** Get full review detail for a page */
  getReviewDetail: adminProcedure
    .input(z.object({ pageId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db.select().from(contentPages).where(eq(contentPages.id, input.pageId)).limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Page not found" });
      return rows[0];
    }),

  /** Admin manually overrides quality decision */
  manualOverride: adminProcedure
    .input(
      z.object({
        pageId: z.number(),
        decision: z.enum(["approve", "retry", "merge", "reject"]),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const newStatus =
        input.decision === "approve" ? "approved" :
        input.decision === "reject" ? "rejected" :
        "reviewing";

      await db.update(contentPages).set({
        qualityDecision: input.decision,
        status: newStatus,
        rejectionReason: input.reason ?? undefined,
      }).where(eq(contentPages.id, input.pageId));

      await logAdminAction({
        userId: ctx.user.id,
        action: "manual_quality_override",
        target: `page_${input.pageId}`,
        details: { decision: input.decision, reason: input.reason },
      });

      return { success: true };
    }),
});
