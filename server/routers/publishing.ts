/**
 * M5 — Publishing Admin Router
 * Admin-only procedures for page publishing:
 *   - publishing.publishPage: publish a single approved page
 *   - publishing.publishAll: publish all approved pages
 *   - publishing.archivePage: archive a page (noindex)
 *   - publishing.listPublished: list all published pages
 *   - publishing.getPage: get a single published page with structured data
 */

import { z } from "zod";
import { desc, eq, and, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb, logAdminAction } from "../db";
import { contentPages } from "../../drizzle/schema";
import { publishPage, publishAllApproved, archivePage } from "../m5/publisher";
import { generateSitemapEntries } from "../m5/sitemap";
import { isPlaceholderBaseUrl, resolveBaseUrlInfo } from "../m5/baseUrl";
import { shouldNoindexPage } from "../m5/visibility";
import { resolvePublicAdSlot } from "../m6/ads";

// ─── adminProcedure ───────────────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const publishingRouter = router({
  /** Publish a single approved page */
  publishPage: adminProcedure
    .input(z.object({ pageId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { baseUrl } = resolveBaseUrlInfo(ctx.req);

      await logAdminAction({
        userId: ctx.user.id,
        action: "publish_page",
        target: `page_${input.pageId}`,
        details: { pageId: input.pageId },
      });

      const result = await publishPage(input.pageId, baseUrl);
      return { success: true, result };
    }),

  /** Publish all approved pages */
  publishAll: adminProcedure.mutation(async ({ ctx }) => {
    const { baseUrl } = resolveBaseUrlInfo(ctx.req);

    await logAdminAction({
      userId: ctx.user.id,
      action: "publish_all_approved",
      target: "all_approved",
      details: {},
    });

    const results = await publishAllApproved(baseUrl);
    return {
      success: true,
      baseUrl,
      published: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }),

  /** Archive a page (sets noindex, removes from sitemap) */
  archivePage: adminProcedure
    .input(z.object({ pageId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await logAdminAction({
        userId: ctx.user.id,
        action: "archive_page",
        target: `page_${input.pageId}`,
        details: { reason: input.reason },
      });

      await archivePage(input.pageId);
      return { success: true };
    }),

  /** List all published pages */
  listPublished: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input, ctx }) => {
      const { baseUrl, source } = resolveBaseUrlInfo(ctx.req);
      const db = await getDb();
      if (!db) return { baseUrl, source, pages: [] };

      const pages = await db
        .select({
          id: contentPages.id,
          slug: contentPages.slug,
          title: contentPages.title,
          metaDescription: contentPages.metaDescription,
          status: contentPages.status,
          policyStatus: contentPages.policyStatus,
          publishScore: contentPages.publishScore,
          safetyScore: contentPages.safetyScore,
          publishedAt: contentPages.publishedAt,
          version: contentPages.version,
        })
        .from(contentPages)
        .where(eq(contentPages.status, "published"))
        .orderBy(desc(contentPages.publishedAt))
        .limit(input.limit);

      return {
        baseUrl,
        source,
        pages: pages.map((p) => ({ ...p, publicUrl: `${baseUrl}/p/${p.slug}` })),
      };
    }),

  /** Publishing config/debug details */
  getConfig: adminProcedure.query(({ ctx }) => {
    const { baseUrl, source } = resolveBaseUrlInfo(ctx.req);
    return {
      baseUrl,
      source,
      usingPlaceholderBaseUrl: isPlaceholderBaseUrl(baseUrl),
    };
  }),

  /** Get a single page with structured data and M6 ad eligibility */
  getPage: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input, ctx }) => {
      const { baseUrl } = resolveBaseUrlInfo(ctx.req);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db
        .select()
        .from(contentPages)
        .where(
          and(
            eq(contentPages.slug, input.slug),
            or(
              eq(contentPages.status, "published"),
              eq(contentPages.status, "archived"),
            ),
          )
        )
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Page not found or not published" });

      const page = rows[0];
      const { adSlot } = await resolvePublicAdSlot(ctx, {
        id: page.id,
        status: page.status,
        policyStatus: page.policyStatus,
        qualityDecision: page.qualityDecision,
      });

      return {
        ...page,
        publicUrl: `${baseUrl}/p/${page.slug}`,
        canonicalUrl: `${baseUrl}/p/${page.slug}`,
        noindex: shouldNoindexPage(page.status, page.policyStatus),
        adSlot,
      };
    }),

  /** Get sitemap entries for all published pages */
  getSitemapEntries: publicProcedure.query(async ({ ctx }) => {
    const { baseUrl, source } = resolveBaseUrlInfo(ctx.req);
    const entries = await generateSitemapEntries(baseUrl);
    return { baseUrl, source, entries, count: entries.length };
  }),
});
