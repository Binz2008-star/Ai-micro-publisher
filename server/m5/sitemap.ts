/**
 * M5 — Sitemap Generator
 *
 * Generates XML sitemap for all published pages.
 * Archived/rejected pages are excluded.
 * Noindex behavior is enforced via robots meta tag on the page level.
 */

import { eq, and, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { contentPages } from "../../drizzle/schema";

export interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: string;
}

export async function generateSitemapEntries(baseUrl: string): Promise<SitemapEntry[]> {
  const db = await getDb();
  if (!db) return [];

  const publishedPages = await db
    .select({
      slug: contentPages.slug,
      publishedAt: contentPages.publishedAt,
      updatedAt: contentPages.updatedAt,
    })
    .from(contentPages)
    .where(
      and(
        eq(contentPages.status, "published"),
        eq(contentPages.policyStatus, "approved"),
        isNotNull(contentPages.publishedAt),
      )
    )
    .limit(1000);

  return publishedPages.map((page) => ({
    loc: `${baseUrl}/p/${page.slug}`,
    lastmod: (page.publishedAt ?? page.updatedAt).toISOString().split("T")[0],
    changefreq: "weekly",
    priority: "0.8",
  }));
}

export function buildSitemapXml(entries: SitemapEntry[], baseUrl: string): string {
  const urlElements = entries
    .map(
      (e) =>
        `  <url>\n    <loc>${escapeXml(e.loc)}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlElements}
</urlset>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
