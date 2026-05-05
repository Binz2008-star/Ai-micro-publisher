/**
 * M3 — Content Generation Worker
 *
 * Replaces the M1 stub. For each accepted topic:
 *   1. Check daily spend limit
 *   2. Generate structured brief from topic keyword
 *   3. Call LLM to produce draft
 *   4. Store draft in content_pages with version tracking
 *   5. Record generation_jobs audit entry (model, tokens, cost, latency, errors)
 *   6. Update topic status to 'generating' → 'done' (or back to 'accepted' on failure)
 */

import { Job } from "bullmq";
import { eq, desc } from "drizzle-orm";
import { BaseWorker } from "../workers/base";
import { QUEUE_NAMES } from "../queue/connection";
import { getDb } from "../db";
import { topics, contentPages, generationJobs } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { generateBrief, buildSystemPrompt, buildUserPrompt, generateSlug } from "./brief";
import { estimateCostUsd, checkDailySpendLimit } from "./spend";
import { nanoid } from "nanoid";

// ─── Single generation ────────────────────────────────────────────────────────

export interface GenerationResult {
  topicId: number;
  pageId: number | null;
  jobId: number | null;
  success: boolean;
  draftContent: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  errorMessage: string | null;
  version: number;
}

export async function generateDraftForTopic(topicId: number): Promise<GenerationResult> {
  const db = await getDb();
  if (!db) {
    return {
      topicId, pageId: null, jobId: null, success: false,
      draftContent: null, promptTokens: 0, completionTokens: 0, totalTokens: 0,
      estimatedCostUsd: 0, latencyMs: 0, errorMessage: "Database unavailable", version: 0,
    };
  }

  // 1. Check daily spend limit
  const spendCheck = await checkDailySpendLimit();
  if (!spendCheck.allowed) {
    console.warn(`[ContentGeneration] Daily spend limit reached: ${spendCheck.reason}`);
    return {
      topicId, pageId: null, jobId: null, success: false,
      draftContent: null, promptTokens: 0, completionTokens: 0, totalTokens: 0,
      estimatedCostUsd: 0, latencyMs: 0, errorMessage: spendCheck.reason ?? "Spend limit reached",
      version: 0,
    };
  }

  // 2. Load topic
  const topicRows = await db.select().from(topics).where(eq(topics.id, topicId)).limit(1);
  const topic = topicRows[0];
  if (!topic) {
    return {
      topicId, pageId: null, jobId: null, success: false,
      draftContent: null, promptTokens: 0, completionTokens: 0, totalTokens: 0,
      estimatedCostUsd: 0, latencyMs: 0, errorMessage: `Topic ${topicId} not found`, version: 0,
    };
  }

  // 3. Get existing keywords for internal linking
  const existingRows = await db.select({ keyword: topics.keyword }).from(topics)
    .where(eq(topics.status, "done")).limit(20);
  const existingKeywords = existingRows.map((r) => r.keyword);

  // 4. Generate brief
  const brief = generateBrief(topic.keyword, existingKeywords);
  const slug = generateSlug(topic.keyword);

  // 5. Check for existing draft (version tracking)
  const existingPages = await db.select({ version: contentPages.version })
    .from(contentPages).where(eq(contentPages.topicId, topicId))
    .orderBy(desc(contentPages.version)).limit(1);
  const nextVersion = (existingPages[0]?.version ?? 0) + 1;

  // 6. Create generation job record and get its ID
  const idempotencyKey = `gen-${topicId}-v${nextVersion}-${nanoid(8)}`;
  await db.insert(generationJobs).values({
    topicId,
    jobType: "generate",
    status: "running",
    provider: "built-in",
    idempotencyKey,
    metadata: { brief, slug, version: nextVersion },
  });

  // Get the job ID via SELECT (reliable across all Drizzle versions)
  const jobRows = await db.select({ id: generationJobs.id })
    .from(generationJobs)
    .where(eq(generationJobs.idempotencyKey, idempotencyKey))
    .limit(1);
  const jobId = jobRows[0]?.id ?? null;

  // 7. Mark topic as generating
  await db.update(topics).set({ status: "generating" }).where(eq(topics.id, topicId));

  // 8. Call LLM
  const start = Date.now();
  let draftContent = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let errorMessage: string | null = null;
  let pageId: number | null = null;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(brief) },
      ],
    });

    const rawContent = response.choices?.[0]?.message?.content ?? "";
    draftContent = typeof rawContent === "string" ? rawContent : "";
    promptTokens = response.usage?.prompt_tokens ?? 0;
    completionTokens = response.usage?.completion_tokens ?? 0;
    totalTokens = response.usage?.total_tokens ?? (promptTokens + completionTokens);

    if (draftContent.length < 100) {
      throw new Error(`LLM returned insufficient content (${draftContent.length} chars)`);
    }

    // 9. Store draft in content_pages
    const metaDescription = `${brief.topic} — ${brief.tone} guide for ${brief.audience}.`.slice(0, 160);
    const title = draftContent.match(/^#\s+(.+)/m)?.[1] ?? brief.topic;
    const pageSlug = nextVersion > 1 ? `${slug}-v${nextVersion}` : slug;

    await db.insert(contentPages).values({
      topicId,
      slug: pageSlug,
      title,
      metaDescription,
      language: brief.language,
      pageType: brief.pageType,
      status: "draft",
      policyStatus: "pending",
      bodyMarkdown: draftContent,
      version: nextVersion,
      structuredData: { brief },
    });

    // Get the page ID via SELECT
    const pageRows = await db.select({ id: contentPages.id })
      .from(contentPages)
      .where(eq(contentPages.slug, pageSlug))
      .limit(1);
    pageId = pageRows[0]?.id ?? null;

  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[ContentGeneration] LLM error for topic ${topicId}:`, errorMessage);
  }

  const latencyMs = Date.now() - start;
  const estimatedCostUsd = estimateCostUsd(totalTokens);
  const success = !errorMessage && draftContent.length > 100;

  // 10. Update generation job with results
  if (jobId) {
    await db.update(generationJobs).set({
      status: success ? "completed" : "failed",
      pageId: pageId ?? undefined,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      latencyMs,
      errorMessage: errorMessage ?? undefined,
    }).where(eq(generationJobs.id, jobId));
  }

  // 11. Update topic status
  await db.update(topics).set({
    status: success ? "done" : "accepted",
  }).where(eq(topics.id, topicId));

  return {
    topicId,
    pageId,
    jobId,
    success,
    draftContent: success ? draftContent : null,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
    latencyMs,
    errorMessage,
    version: nextVersion,
  };
}

// ─── Batch generation ─────────────────────────────────────────────────────────

export async function generateNextBatch(batchSize = 3): Promise<GenerationResult[]> {
  const db = await getDb();
  if (!db) return [];

  const spendCheck = await checkDailySpendLimit();
  if (!spendCheck.allowed) {
    console.warn(`[ContentGeneration] Batch skipped — ${spendCheck.reason}`);
    return [];
  }

  const acceptedTopics = await db
    .select({ id: topics.id })
    .from(topics)
    .where(eq(topics.status, "accepted"))
    .orderBy(desc(topics.opportunityScore ?? topics.id))
    .limit(batchSize);

  if (acceptedTopics.length === 0) {
    console.log("[ContentGeneration] No accepted topics to generate");
    return [];
  }

  const results: GenerationResult[] = [];
  for (const { id } of acceptedTopics) {
    const result = await generateDraftForTopic(id);
    results.push(result);

    const recheckSpend = await checkDailySpendLimit();
    if (!recheckSpend.allowed) {
      console.warn("[ContentGeneration] Spend limit reached mid-batch, stopping");
      break;
    }
  }

  return results;
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export class ContentGenerationWorker extends BaseWorker {
  constructor() {
    super(QUEUE_NAMES.CONTENT_GENERATION, "ContentGenerationWorker", "generation_paused");
  }

  protected async processJob(job: Job): Promise<void> {
    const { topicId, batchSize } = job.data as { topicId?: number; batchSize?: number };

    if (topicId) {
      console.log(`[ContentGenerationWorker] Generating draft for topic ${topicId}`);
      const result = await generateDraftForTopic(topicId);
      if (!result.success) {
        throw new Error(result.errorMessage ?? "Generation failed");
      }
      console.log(
        `[ContentGenerationWorker] Topic ${topicId} done — ` +
        `tokens: ${result.totalTokens}, cost: $${result.estimatedCostUsd.toFixed(5)}, ` +
        `latency: ${result.latencyMs}ms`
      );
    } else {
      console.log(`[ContentGenerationWorker] Running batch (size=${batchSize ?? 3})`);
      const results = await generateNextBatch(batchSize ?? 3);
      const succeeded = results.filter((r) => r.success).length;
      console.log(`[ContentGenerationWorker] Batch complete — ${succeeded}/${results.length} succeeded`);
    }
  }
}

// ─── Direct run (for tRPC trigger) ───────────────────────────────────────────

export async function runContentGeneration(options: {
  topicId?: number;
  batchSize?: number;
}): Promise<GenerationResult[]> {
  if (options.topicId) {
    const result = await generateDraftForTopic(options.topicId);
    return [result];
  }
  return generateNextBatch(options.batchSize ?? 3);
}
