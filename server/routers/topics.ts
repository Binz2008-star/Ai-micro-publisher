/**
 * M2 — Topics Admin Router
 * Provides admin-only procedures for topic candidate management:
 *   - topics.list: paginated list with filters
 *   - topics.accept: manually accept a candidate
 *   - topics.reject: manually reject a candidate with reason
 *   - topics.runDiscovery: trigger a discovery run manually
 *   - topics.stats: summary counts by status
 */

import { z } from "zod";
import { desc, eq, sql, and, or, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb, logAdminAction } from "../db";
import { topics } from "../../drizzle/schema";
import { runTopicDiscovery } from "../m2/worker";

// ─── adminProcedure ───────────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const topicsRouter = router({
  /** List topic candidates with pagination and status filter */
  list: adminProcedure
    .input(
      z.object({
        status: z.enum(["candidate", "accepted", "rejected", "generating", "done", "all"]).default("all"),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        sortBy: z.enum(["opportunityScore", "createdAt", "trendScore"]).default("opportunityScore"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { topics: [], total: 0 };

      const conditions = [];
      if (input.status !== "all") {
        conditions.push(eq(topics.status, input.status));
      }
      if (input.search) {
        conditions.push(like(topics.keyword, `%${input.search}%`));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countResult] = await Promise.all([
        db
          .select()
          .from(topics)
          .where(whereClause)
          .orderBy(desc(topics[input.sortBy as keyof typeof topics] as Parameters<typeof desc>[0]))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(topics)
          .where(whereClause),
      ]);

      return {
        topics: rows,
        total: Number(countResult[0]?.count ?? 0),
      };
    }),

  /** Summary stats by status */
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { candidate: 0, accepted: 0, rejected: 0, generating: 0, done: 0, total: 0 };

    const rows = await db
      .select({
        status: topics.status,
        count: sql<number>`count(*)`,
      })
      .from(topics)
      .groupBy(topics.status);

    const stats: Record<string, number> = { candidate: 0, accepted: 0, rejected: 0, generating: 0, done: 0 };
    for (const row of rows) {
      stats[row.status] = Number(row.count);
    }
    stats.total = Object.values(stats).reduce((a, b) => a + b, 0);
    return stats;
  }),

  /** Manually accept a topic candidate */
  accept: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.update(topics).set({ status: "accepted" }).where(eq(topics.id, input.id));
      await logAdminAction({
        userId: ctx.user.id,
        action: "accept_topic",
        target: String(input.id),
        details: { topicId: input.id },
      });
      return { success: true };
    }),

  /** Manually reject a topic candidate */
  reject: adminProcedure
    .input(z.object({ id: z.number(), reason: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db
        .update(topics)
        .set({ status: "rejected", rejectionReason: input.reason })
        .where(eq(topics.id, input.id));

      await logAdminAction({
        userId: ctx.user.id,
        action: "reject_topic",
        target: String(input.id),
        details: { topicId: input.id, reason: input.reason },
      });
      return { success: true };
    }),

  /** Trigger a manual topic discovery run */
  runDiscovery: adminProcedure
    .input(
      z.object({
        sources: z.array(z.string()).default(["seeded", "seasonal", "hackernews", "reddit"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await logAdminAction({
        userId: ctx.user.id,
        action: "trigger_topic_discovery",
        target: "discovery_worker",
        details: { sources: input.sources },
      });

      const results = await runTopicDiscovery(input.sources);
      return { success: true, results };
    }),

  /** Public endpoint: get published topics for internal linking (no auth needed) */
  listPublished: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { topics: [] };
      const rows = await db
        .select({ id: topics.id, keyword: topics.keyword, opportunityScore: topics.opportunityScore })
        .from(topics)
        .where(eq(topics.status, "done"))
        .orderBy(desc(topics.opportunityScore))
        .limit(input.limit);
      return { topics: rows };
    }),
});
