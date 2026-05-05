/**
 * Queue Connection
 * Provides Redis connection config for BullMQ.
 * Includes a proactive availability check so workers skip startup
 * when Redis is not reachable, instead of spamming connection errors.
 */

import type { ConnectionOptions } from "bullmq";
import Redis from "ioredis";

export const QUEUE_NAMES = {
  TOPIC_DISCOVERY: "topic-discovery",
  CONTENT_GENERATION: "content-generation",
  QUALITY_REVIEW: "quality-review",
  PUBLISH_PAGES: "publish-pages",
  ANALYTICS_ROLLUP: "analytics-rollup",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export function getRedisConnection(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname || "localhost",
        port: parseInt(url.port || "6379", 10),
        ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
        ...(url.protocol === "rediss:" ? { tls: {} } : {}),
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      };
    } catch {
      console.warn("[Queue] Invalid REDIS_URL, falling back to localhost");
    }
  }

  return {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  };
}

export const redisConnection = getRedisConnection();

/**
 * Check if Redis is reachable before starting workers.
 * Returns true only if Redis responds within 2 seconds.
 * In dev without REDIS_URL, returns false immediately (no connection attempt).
 */
export async function isRedisAvailable(): Promise<boolean> {
  // Skip Redis check in dev when no URL is configured
  if (!process.env.REDIS_URL && process.env.NODE_ENV !== "production") {
    return false;
  }

  const conn = getRedisConnection() as {
    host?: string;
    port?: number;
    password?: string;
    tls?: object;
  };

  const client = new Redis({
    host: conn.host ?? "localhost",
    port: conn.port ?? 6379,
    ...(conn.password ? { password: conn.password } : {}),
    ...(conn.tls ? { tls: conn.tls } : {}),
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: 2000,
    retryStrategy: () => null, // No retries during availability check
  });

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      client.disconnect();
      resolve(false);
    }, 2000);

    client
      .connect()
      .then(() => {
        clearTimeout(timeout);
        client.disconnect();
        resolve(true);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(false);
      });
  });
}
