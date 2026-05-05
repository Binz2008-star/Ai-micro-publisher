/**
 * Health Check Endpoint
 * GET /api/health
 * Returns DB status, queue status, worker statuses, uptime, and version.
 * Used by M1 validation, CI, and future monitoring.
 */

import type { Express } from "express";
import { pingDatabase } from "./db";
import { getQueueHealth } from "./queue/publisher";
import { getAllWorkerStatuses } from "./workers/stubs";

const START_TIME = Date.now();

export function registerHealthRoute(app: Express): void {
  app.get("/api/health", async (_req, res) => {
    const [dbResult, queueResult] = await Promise.allSettled([
      pingDatabase(),
      getQueueHealth(),
    ]);

    const db =
      dbResult.status === "fulfilled"
        ? dbResult.value
        : { ok: false, latencyMs: 0, error: "Health check threw" };

    const queue =
      queueResult.status === "fulfilled"
        ? queueResult.value
        : { connected: false, queues: {}, error: "Health check threw" };

    const workers = getAllWorkerStatuses();

    const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);

    const allHealthy = db.ok; // Queue is optional in dev (no Redis required)

    const payload = {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      version: process.env.npm_package_version ?? "1.0.0",
      services: {
        database: {
          status: db.ok ? "ok" : "error",
          latencyMs: db.latencyMs,
          ...(db.error ? { error: db.error } : {}),
        },
        queue: {
          status: queue.connected ? "ok" : "unavailable",
          ...(queue.error ? { error: queue.error } : {}),
          queues: queue.queues,
        },
        workers: workers.map((w) => ({
          name: w.name,
          status: w.state ?? (w.running ? "running" : "stopped"),
          paused: w.paused,
          processedCount: w.processedCount,
          failedCount: w.failedCount,
          lastProcessedAt: w.lastProcessedAt,
          lastError: w.lastError,
        })),
      },
    };

    res.status(allHealthy ? 200 : 503).json(payload);
  });
}
