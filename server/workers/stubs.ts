/**
 * Stub Workers — M1
 * Scaffolded workers with correct queue bindings and pause-check wiring.
 * Full implementation comes in M2–M5.
 *
 * Graceful Redis handling:
 * - Workers check Redis availability before starting.
 * - If Redis is unavailable, they log once and stay in DEGRADED state.
 * - They do NOT spam connection errors or crash the process.
 */
import { Job } from "bullmq";
import { BaseWorker } from "./base";
import { QUEUE_NAMES } from "../queue/connection";
import { TopicDiscoveryWorker as M2TopicDiscoveryWorker } from "../m2/worker";
import { ContentGenerationWorker as M3ContentGenerationWorker } from "../m3/worker";

// ─── Topic Discovery Worker (M2 — real implementation) ───────────────────────

export { M2TopicDiscoveryWorker as TopicDiscoveryWorker };

// ─── Content Generation Worker (M3 — real implementation) ───────────────────

export { M3ContentGenerationWorker as ContentGenerationWorker };

// ─── Quality Review Worker (M4) ──────────────────────────────────────────────

export class QualityReviewWorker extends BaseWorker {
  constructor() {
    super(QUEUE_NAMES.QUALITY_REVIEW, "QualityReviewWorker", "generation_paused");
  }
  protected async processJob(job: Job): Promise<void> {
    console.log(`[QualityReviewWorker] STUB — job ${job.id}`, job.data);
    // M4: Stage 1 heuristics + Stage 2 LLM review
    // M4: update content_pages with scores and approve/retry/merge/reject decision
  }
}

// ─── Publish Pages Worker (M5) ────────────────────────────────────────────────

export class PublishPagesWorker extends BaseWorker {
  constructor() {
    super(QUEUE_NAMES.PUBLISH_PAGES, "PublishPagesWorker", "publishing_paused");
  }
  protected async processJob(job: Job): Promise<void> {
    console.log(`[PublishPagesWorker] STUB — job ${job.id}`, job.data);
    // M5: generate slug, canonical URL, metadata, structured data
    // M5: set status = 'published', update published_at, add to sitemap
  }
}

// ─── Analytics Rollup Worker (M7) ────────────────────────────────────────────

export class AnalyticsRollupWorker extends BaseWorker {
  constructor() {
    super(QUEUE_NAMES.ANALYTICS_ROLLUP, "AnalyticsRollupWorker", "generation_paused");
  }
  protected async processJob(job: Job): Promise<void> {
    console.log(`[AnalyticsRollupWorker] STUB — job ${job.id}`, job.data);
    // M7: aggregate page_events into page_metrics_daily
    // M7: trigger refresh/archive decisions based on metrics
  }
}

// ─── Worker Registry ──────────────────────────────────────────────────────────

export const ALL_WORKERS = [
  new M2TopicDiscoveryWorker(),
  new M3ContentGenerationWorker(),
  new QualityReviewWorker(),
  new PublishPagesWorker(),
  new AnalyticsRollupWorker(),
] as const;

export function getAllWorkerStatuses() {
  return ALL_WORKERS.map((w) => w.getStatus());
}

export async function startAllWorkers(): Promise<void> {
  const { isRedisAvailable } = await import("../queue/connection");
  const redisOk = await isRedisAvailable();

  if (!redisOk) {
    console.warn(
      "[Workers] Redis unavailable — workers will not start. " +
      "Set REDIS_URL to enable queue processing. " +
      "System continues to serve HTTP requests normally."
    );
    // Mark all workers as degraded (not running, not crashed)
    for (const w of ALL_WORKERS) {
      w.setDegraded("Redis unavailable at startup");
    }
    return;
  }

  for (const worker of ALL_WORKERS) {
    try {
      worker.start(1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Workers] Failed to start ${worker.getStatus().name}: ${msg}`);
      worker.setDegraded(msg);
    }
  }
}

export async function stopAllWorkers(): Promise<void> {
  await Promise.all(ALL_WORKERS.map((w) => w.stop()));
}
