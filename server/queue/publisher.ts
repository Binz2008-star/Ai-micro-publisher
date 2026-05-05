/**
 * Queue Publisher
 * Enqueues jobs into BullMQ queues with idempotency keys and retry config.
 * All job enqueueing goes through this module — never instantiate Queue directly.
 */

import { Queue, JobsOptions } from "bullmq";
import { QUEUE_NAMES, QueueName, redisConnection } from "./connection";

// ─── Default job options ──────────────────────────────────────────────────────

const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000, // 5s, 10s, 20s
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

// ─── Queue registry ───────────────────────────────────────────────────────────

const queues = new Map<QueueName, Queue>();

function getQueue(name: QueueName): Queue {
  if (!queues.has(name)) {
    const q = new Queue(name, {
      connection: redisConnection,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });
    queues.set(name, q);
  }
  return queues.get(name)!;
}

// ─── Job payload types ────────────────────────────────────────────────────────

export interface TopicDiscoveryJobData {
  source: string;
  triggeredBy?: "scheduler" | "manual";
}

export interface ContentGenerationJobData {
  topicId: number;
  idempotencyKey: string;
  retryCount?: number;
}

export interface QualityReviewJobData {
  pageId: number;
  topicId: number;
  idempotencyKey: string;
}

export interface PublishPagesJobData {
  pageId: number;
  action: "publish" | "archive" | "refresh";
}

export interface AnalyticsRollupJobData {
  date: string; // YYYY-MM-DD
  triggeredBy?: "scheduler" | "manual";
}

// ─── Publisher functions ──────────────────────────────────────────────────────

export async function enqueueTopicDiscovery(
  data: TopicDiscoveryJobData,
  opts?: JobsOptions,
) {
  const q = getQueue(QUEUE_NAMES.TOPIC_DISCOVERY);
  return q.add("discover", data, {
    jobId: `topic-discovery-${Date.now()}`,
    ...opts,
  });
}

export async function enqueueContentGeneration(
  data: ContentGenerationJobData,
  opts?: JobsOptions,
) {
  const q = getQueue(QUEUE_NAMES.CONTENT_GENERATION);
  return q.add("generate", data, {
    jobId: data.idempotencyKey, // Idempotent: same key = same job, no duplicate
    ...opts,
  });
}

export async function enqueueQualityReview(
  data: QualityReviewJobData,
  opts?: JobsOptions,
) {
  const q = getQueue(QUEUE_NAMES.QUALITY_REVIEW);
  return q.add("review", data, {
    jobId: data.idempotencyKey,
    ...opts,
  });
}

export async function enqueuePublishPage(
  data: PublishPagesJobData,
  opts?: JobsOptions,
) {
  const q = getQueue(QUEUE_NAMES.PUBLISH_PAGES);
  return q.add(data.action, data, {
    jobId: `${data.action}-page-${data.pageId}-${Date.now()}`,
    ...opts,
  });
}

export async function enqueueAnalyticsRollup(
  data: AnalyticsRollupJobData,
  opts?: JobsOptions,
) {
  const q = getQueue(QUEUE_NAMES.ANALYTICS_ROLLUP);
  return q.add("rollup", data, {
    jobId: `analytics-rollup-${data.date}`, // One rollup per date, idempotent
    ...opts,
  });
}

// ─── Queue health check ───────────────────────────────────────────────────────

export async function getQueueHealth(): Promise<{
  connected: boolean;
  queues: Record<string, { waiting: number; active: number; failed: number }>;
  error?: string;
}> {
  // Fast-path: skip Redis entirely when not configured in dev
  const { isRedisAvailable } = await import("./connection");
  const redisOk = await isRedisAvailable();
  if (!redisOk) {
    return {
      connected: false,
      queues: {},
      error: "Redis not available (set REDIS_URL to enable queue)",
    };
  }

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Queue health check timeout")), 3000)
  );

  const check = async () => {
    const results: Record<string, { waiting: number; active: number; failed: number }> = {};
    for (const name of Object.values(QUEUE_NAMES)) {
      const q = getQueue(name);
      const [waiting, active, failed] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getFailedCount(),
      ]);
      results[name] = { waiting, active, failed };
    }
    return { connected: true, queues: results };
  };

  try {
    return await Promise.race([check(), timeout]);
  } catch (err) {
    return {
      connected: false,
      queues: {},
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export async function closeAllQueues(): Promise<void> {
  await Promise.all(Array.from(queues.values()).map((q) => q.close()));
  queues.clear();
}
