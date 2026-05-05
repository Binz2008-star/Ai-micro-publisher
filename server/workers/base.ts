/**
 * Base Worker
 * All autonomous workers extend this class.
 * Provides: lifecycle management, pause-check via system_settings,
 * graceful Redis failure handling, retry-safe execution, and shutdown.
 *
 * Key design: if Redis is unavailable, workers enter DEGRADED state
 * (not running, not crashed) and the process continues normally.
 */

import { Worker, Job, WorkerOptions } from "bullmq";
import { redisConnection, QueueName } from "../queue/connection";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export type WorkerState = "stopped" | "running" | "degraded";

export interface WorkerStatus {
  name: string;
  state: WorkerState;
  /** @deprecated use state */
  running: boolean;
  paused: boolean;
  processedCount: number;
  failedCount: number;
  lastProcessedAt: Date | null;
  lastError: string | null;
}

export abstract class BaseWorker {
  protected worker: Worker | null = null;
  protected _state: WorkerState = "stopped";
  protected _processedCount = 0;
  protected _failedCount = 0;
  protected _lastProcessedAt: Date | null = null;
  protected _lastError: string | null = null;
  protected pauseSettingKey: string;

  constructor(
    protected readonly queueName: QueueName,
    protected readonly workerName: string,
    pauseSettingKey: string,
  ) {
    this.pauseSettingKey = pauseSettingKey;
  }

  protected abstract processJob(job: Job): Promise<void>;

  protected async isPaused(): Promise<boolean> {
    try {
      const db = await getDb();
      if (!db) return false;
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, this.pauseSettingKey))
        .limit(1);
      return rows[0]?.value === "true";
    } catch {
      return false;
    }
  }

  /** Mark worker as degraded (Redis unavailable, not a crash) */
  setDegraded(reason: string): void {
    this._state = "degraded";
    this._lastError = reason;
    console.warn(`[${this.workerName}] DEGRADED: ${reason}`);
  }

  start(concurrency = 1): void {
    if (this.worker || this._state === "degraded") return;

    const options: WorkerOptions = {
      connection: redisConnection,
      concurrency,
      autorun: true,
    };

    this.worker = new Worker(
      this.queueName,
      async (job: Job) => {
        const paused = await this.isPaused();
        if (paused) {
          console.log(`[${this.workerName}] Paused — skipping job ${job.id}`);
          return;
        }
        try {
          await this.processJob(job);
          this._processedCount++;
          this._lastProcessedAt = new Date();
        } catch (err) {
          this._failedCount++;
          this._lastError = err instanceof Error ? err.message : String(err);
          throw err; // Re-throw so BullMQ handles retry
        }
      },
      options,
    );

    this.worker.on("completed", (job) => {
      console.log(`[${this.workerName}] Job ${job.id} completed`);
    });

    this.worker.on("failed", (job, err) => {
      console.error(`[${this.workerName}] Job ${job?.id} failed: ${err.message}`);
    });

    // Suppress Redis connection errors — they are expected when Redis is unavailable
    this.worker.on("error", (err) => {
      if (
        err.message?.includes("ECONNREFUSED") ||
        err.message?.includes("connect") ||
        err.message?.includes("Redis")
      ) {
        // Only log once, not on every retry
        if (this._state !== "degraded") {
          console.warn(`[${this.workerName}] Redis connection failed — entering degraded state`);
          this._state = "degraded";
          this._lastError = err.message;
        }
      } else {
        console.error(`[${this.workerName}] Worker error: ${err.message}`);
        this._lastError = err.message;
      }
    });

    this._state = "running";
    console.log(`[${this.workerName}] Started (concurrency=${concurrency})`);
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    this._state = "stopped";
    console.log(`[${this.workerName}] Stopped`);
  }

  getStatus(): WorkerStatus {
    return {
      name: this.workerName,
      state: this._state,
      running: this._state === "running",
      paused: false,
      processedCount: this._processedCount,
      failedCount: this._failedCount,
      lastProcessedAt: this._lastProcessedAt,
      lastError: this._lastError,
    };
  }
}
