/**
 * Admin Router — M1
 * Provides admin-only tRPC procedures:
 *   - system.status: health + worker + settings overview
 *   - system.getSetting / setSetting: runtime config management
 *   - system.getAuditLog: recent admin actions
 *
 * All procedures require role === 'admin'. Actions are audit-logged.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getSetting, setSetting, getAllSettings, logAdminAction, pingDatabase } from "../db";
import { getQueueHealth } from "../queue/publisher";
import { getAllWorkerStatuses } from "../workers/stubs";
import { adminAuditLog } from "../../drizzle/schema";

// ─── adminProcedure middleware ────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
  return next({ ctx });
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const adminRouter = router({
  /** Full system status: DB, queue, workers, settings */
  systemStatus: adminProcedure.query(async () => {
    const [dbResult, queueResult, settings] = await Promise.allSettled([
      pingDatabase(),
      getQueueHealth(),
      getAllSettings(),
    ]);

    return {
      database:
        dbResult.status === "fulfilled"
          ? dbResult.value
          : { ok: false, latencyMs: 0, error: "Check failed" },
      queue:
        queueResult.status === "fulfilled"
          ? queueResult.value
          : { connected: false, queues: {}, error: "Check failed" },
      workers: getAllWorkerStatuses(),
      settings: settings.status === "fulfilled" ? settings.value : {},
      timestamp: new Date().toISOString(),
    };
  }),

  /** Get a single runtime setting */
  getSetting: adminProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input }) => {
      const value = await getSetting(input.key);
      return { key: input.key, value };
    }),

  /** Update a runtime setting and log the action */
  setSetting: adminProcedure
    .input(z.object({ key: z.string(), value: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const previous = await getSetting(input.key);
      await setSetting(input.key, input.value, ctx.user.id);
      await logAdminAction({
        userId: ctx.user.id,
        action: "set_setting",
        target: input.key,
        details: { previous, newValue: input.value },
      });
      return { success: true, key: input.key, value: input.value };
    }),

  /** Emergency pause switches — independent toggles */
  pauseGeneration: adminProcedure
    .input(z.object({ paused: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await setSetting("generation_paused", String(input.paused), ctx.user.id);
      await logAdminAction({
        userId: ctx.user.id,
        action: input.paused ? "pause_generation" : "resume_generation",
        target: "generation_paused",
        details: { paused: input.paused },
      });
      return { success: true, generationPaused: input.paused };
    }),

  pausePublishing: adminProcedure
    .input(z.object({ paused: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await setSetting("publishing_paused", String(input.paused), ctx.user.id);
      await logAdminAction({
        userId: ctx.user.id,
        action: input.paused ? "pause_publishing" : "resume_publishing",
        target: "publishing_paused",
        details: { paused: input.paused },
      });
      return { success: true, publishingPaused: input.paused };
    }),

  pauseAds: adminProcedure
    .input(z.object({ paused: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await setSetting("ads_paused", String(input.paused), ctx.user.id);
      await logAdminAction({
        userId: ctx.user.id,
        action: input.paused ? "pause_ads" : "resume_ads",
        target: "ads_paused",
        details: { paused: input.paused },
      });
      return { success: true, adsPaused: input.paused };
    }),

  /** Recent audit log entries */
  getAuditLog: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { entries: [] };
      const entries = await db
        .select()
        .from(adminAuditLog)
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(input.limit);
      return { entries };
    }),
});
