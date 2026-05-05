/**
 * M5 — SEO Publishing Service
 *
 * Publishes approved pages:
 *   - Sets status = 'published', published_at = now()
 *   - Generates FAQ structured data (JSON-LD)
 *   - Generates Article structured data (JSON-LD)
 *   - Adds to sitemap (via sitemap table / in-memory list)
 *   - Supports archive/noindex for low-performing or rejected pages
 *
 * Controlled mode only — no Redis/BullMQ workers.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { contentPages, topics } from "../../drizzle/schema";
import { DEFAULT_BASE_URL } from "./baseUrl";

// ─── Structured data generators ───────────────────────────────────────────────

export function generateFaqSchema(bodyMarkdown: string, pageUrl: string): object | null {
  // Extract Q&A pairs from FAQ section
  const faqSection = bodyMarkdown.match(/## faq[\s\S]*$/im)?.[0] ?? "";
  if (!faqSection) return null;

  const qaPairs: Array<{ question: string; answer: string }> = [];

  // Match **Q: ...** A: ... or Q: ... A: ... patterns
  const qaRegex = /\*{0,2}Q[:\s]+([^\n]+)\*{0,2}\s*\n+\*{0,2}A[:\s]+([^\n]+)/gi;
  let match;
  while ((match = qaRegex.exec(faqSection)) !== null) {
    const question = match[1].trim().replace(/\*+/g, "");
    const answer = match[2].trim().replace(/\*+/g, "");
    if (question && answer) {
      qaPairs.push({ question, answer });
    }
  }

  if (qaPairs.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": qaPairs.map(({ question, answer }) => ({
      "@type": "Question",
      "name": question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": answer,
      },
    })),
  };
}

export function generateArticleSchema(
  title: string,
  metaDescription: string | null,
  slug: string,
  publishedAt: Date,
  baseUrl: string,
): object {
  const pageUrl = `${baseUrl}/p/${slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": metaDescription ?? title,
    "url": pageUrl,
    "datePublished": publishedAt.toISOString(),
    "dateModified": publishedAt.toISOString(),
    "author": {
      "@type": "Organization",
      "name": "AI Micro-Publisher",
    },
    "publisher": {
      "@type": "Organization",
      "name": "AI Micro-Publisher",
    },
  };
}

// ─── Publish a single page ────────────────────────────────────────────────────

export interface PublishResult {
  pageId: number;
  slug: string;
  title: string;
  publicUrl: string;
  canonicalUrl: string;
  publishedAt: Date;
  structuredData: object;
  success: boolean;
  error: string | null;
}

export async function publishPage(
  pageId: number,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<PublishResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const rows = await db.select().from(contentPages).where(eq(contentPages.id, pageId)).limit(1);
  const page = rows[0];
  if (!page) throw new Error(`Page ${pageId} not found`);

  if (page.status !== "approved") {
    throw new Error(`Page ${pageId} is not approved (status: ${page.status}, decision: ${page.qualityDecision}). Only approved pages may be published.`);
  }

  const publishedAt = new Date();
  const publicUrl = `${baseUrl}/p/${page.slug}`;
  const canonicalUrl = publicUrl;

  // Generate structured data
  const faqSchema = generateFaqSchema(page.bodyMarkdown, publicUrl);
  const articleSchema = generateArticleSchema(
    page.title,
    page.metaDescription,
    page.slug,
    publishedAt,
    baseUrl,
  );

  const structuredData = faqSchema
    ? [articleSchema, faqSchema]
    : [articleSchema];

  // Update page: set published status, published_at, and structured data
  await db.update(contentPages).set({
    status: "published",
    publishedAt,
    structuredData,
  }).where(eq(contentPages.id, pageId));

  // Update topic status to 'done'
  if (page.topicId) {
    await db.update(topics).set({ status: "done" }).where(eq(topics.id, page.topicId));
  }

  return {
    pageId,
    slug: page.slug,
    title: page.title,
    publicUrl,
    canonicalUrl,
    publishedAt,
    structuredData,
    success: true,
    error: null,
  };
}

// ─── Archive a page (noindex) ─────────────────────────────────────────────────

export async function archivePage(pageId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db.update(contentPages).set({
    status: "archived",
    policyStatus: "rejected",
  }).where(eq(contentPages.id, pageId));
}

// ─── Publish all approved pages ───────────────────────────────────────────────

export async function publishAllApproved(baseUrl?: string): Promise<PublishResult[]> {
  const db = await getDb();
  if (!db) return [];

  const approvedPages = await db
    .select({ id: contentPages.id })
    .from(contentPages)
    .where(and(
      eq(contentPages.status, "approved"),
      eq(contentPages.qualityDecision, "approve"),
    ))
    .limit(50);

  const results: PublishResult[] = [];
  for (const { id } of approvedPages) {
    try {
      const result = await publishPage(id, baseUrl);
      results.push(result);
    } catch (err) {
      results.push({
        pageId: id,
        slug: "",
        title: "",
        publicUrl: "",
        canonicalUrl: "",
        publishedAt: new Date(),
        structuredData: {},
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
