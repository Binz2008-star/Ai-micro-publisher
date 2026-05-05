/**
 * M2 — Topic Discovery Worker
 *
 * Replaces the M1 stub. Runs every 30 minutes (controlled by scheduler).
 * Sources: seeded keywords, RSS feeds, seasonal calendar.
 * Scores each topic, deduplicates against existing, upserts into DB.
 */

import { Job } from "bullmq";
import { BaseWorker } from "../workers/base";
import { QUEUE_NAMES } from "../queue/connection";
import { getDb } from "../db";
import { topics } from "../../drizzle/schema";
import { sql } from "drizzle-orm";
import {
  scoreTopic,
  shouldAcceptTopic,
  ACCEPTANCE_THRESHOLDS,
} from "./scoring";
import {
  SEEDED_KEYWORDS,
  RSS_FEEDS,
  getCurrentSeasonalTopics,
  normalizeKeyword,
  isValidKeyword,
  type RssFeedConfig,
} from "./sources";

// ─── RSS Parser ───────────────────────────────────────────────────────────────

interface RssItem {
  title: string;
  trendSignal: number;
}

async function fetchRssFeed(feed: RssFeedConfig): Promise<RssItem[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: { "User-Agent": "AI-Micro-Publisher/1.0 (topic-discovery)" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[TopicDiscovery] RSS fetch failed for ${feed.name}: ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const items: RssItem[] = [];

    // Simple XML title extractor — no external parser needed
    const titleRegex = /<item[^>]*>[\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi;
    let match;
    let position = 0;

    while ((match = titleRegex.exec(xml)) !== null && items.length < feed.maxItems) {
      const rawTitle = match[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
      if (rawTitle && rawTitle.length > 5) {
        // Trend signal decreases with position (top items are more trending)
        const positionPenalty = Math.min(30, position * 3);
        items.push({
          title: rawTitle,
          trendSignal: Math.max(20, feed.trendSignalBase - positionPenalty),
        });
        position++;
      }
    }

    console.log(`[TopicDiscovery] Fetched ${items.length} items from ${feed.name}`);
    return items;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("abort")) {
      console.warn(`[TopicDiscovery] RSS error for ${feed.name}: ${msg}`);
    }
    return [];
  }
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getExistingKeywords(): Promise<string[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({ keyword: topics.keyword }).from(topics).limit(500);
    return rows.map((r) => r.keyword);
  } catch {
    return [];
  }
}

async function upsertTopic(scored: ReturnType<typeof scoreTopic>): Promise<"inserted" | "updated" | "skipped"> {
  const db = await getDb();
  if (!db) return "skipped";

  try {
    await db.insert(topics).values({
      keyword: scored.keyword,
      source: scored.source,
      language: scored.language,
      trendScore: scored.trendScore,
      searchIntentScore: scored.searchIntentScore,
      contentGapScore: scored.contentGapScore,
      expectedAdValueScore: scored.expectedAdValueScore,
      freshnessScore: scored.freshnessScore,
      policyRiskScore: scored.policyRiskScore,
      duplicationScore: scored.duplicationScore,
      opportunityScore: scored.opportunityScore,
      status: scored.status,
      rejectionReason: scored.rejectionReason,
    }).onDuplicateKeyUpdate({
      set: {
        trendScore: scored.trendScore,
        freshnessScore: scored.freshnessScore,
        opportunityScore: scored.opportunityScore,
        status: scored.status,
        rejectionReason: scored.rejectionReason,
        // updatedAt is auto-updated by MySQL
      },
    });
    return "inserted";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Duplicate")) return "updated";
    console.error(`[TopicDiscovery] Upsert error for "${scored.keyword}":`, msg);
    return "skipped";
  }
}

// ─── Discovery run ────────────────────────────────────────────────────────────

export interface DiscoveryRunResult {
  source: string;
  discovered: number;
  accepted: number;
  rejected: number;
  errors: string[];
}

async function runDiscovery(source: string): Promise<DiscoveryRunResult> {
  const result: DiscoveryRunResult = { source, discovered: 0, accepted: 0, rejected: 0, errors: [] };
  const existingKeywords = await getExistingKeywords();

  let rawItems: Array<{ keyword: string; trendSignal: number }> = [];

  if (source === "seeded") {
    rawItems = SEEDED_KEYWORDS.map(({ keyword, trendSignal }) => ({ keyword, trendSignal }));
  } else if (source === "seasonal") {
    rawItems = getCurrentSeasonalTopics();
  } else {
    // RSS feed
    const feed = RSS_FEEDS.find((f) => f.source === source || f.name === source);
    if (!feed) {
      // Try all feeds for this source type
      const matchingFeeds = RSS_FEEDS.filter((f) => f.source === source);
      for (const f of matchingFeeds) {
        const items = await fetchRssFeed(f);
        rawItems.push(...items.map(({ title, trendSignal }) => ({ keyword: title, trendSignal })));
      }
    } else {
      const items = await fetchRssFeed(feed);
      rawItems = items.map(({ title, trendSignal }) => ({ keyword: title, trendSignal }));
    }
  }

  result.discovered = rawItems.length;

  for (const { keyword: rawKeyword, trendSignal } of rawItems) {
    const keyword = normalizeKeyword(rawKeyword);
    if (!isValidKeyword(keyword)) continue;

    const scored = scoreTopic(keyword, source, trendSignal, existingKeywords);
    await upsertTopic(scored);

    if (scored.status === "candidate") {
      result.accepted++;
      existingKeywords.push(keyword); // Update local cache to prevent intra-run duplicates
    } else {
      result.rejected++;
    }
  }

  return result;
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export class TopicDiscoveryWorker extends BaseWorker {
  constructor() {
    super(QUEUE_NAMES.TOPIC_DISCOVERY, "TopicDiscoveryWorker", "generation_paused");
  }

  protected async processJob(job: Job): Promise<void> {
    const source = (job.data as { source?: string }).source ?? "seeded";
    console.log(`[TopicDiscoveryWorker] Running discovery for source: ${source}`);

    const result = await runDiscovery(source);

    console.log(
      `[TopicDiscoveryWorker] Discovery complete — source: ${result.source}, ` +
      `discovered: ${result.discovered}, accepted: ${result.accepted}, rejected: ${result.rejected}`
    );

    if (result.errors.length > 0) {
      console.warn(`[TopicDiscoveryWorker] Errors:`, result.errors);
    }
  }
}

// ─── Direct run (for tRPC trigger) ───────────────────────────────────────────

export async function runTopicDiscovery(sources?: string[]): Promise<DiscoveryRunResult[]> {
  const targetSources = sources ?? ["seeded", "seasonal", "hackernews", "reddit"];
  const results: DiscoveryRunResult[] = [];

  for (const source of targetSources) {
    const result = await runDiscovery(source);
    results.push(result);
  }

  return results;
}
