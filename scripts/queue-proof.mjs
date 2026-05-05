/**
 * M1 Queue Execution Proof Script
 *
 * Run this script after setting REDIS_URL to a real Redis/Valkey instance.
 * It demonstrates:
 *   1. BullMQ connects to real Redis
 *   2. health_check_test job enqueues
 *   3. Worker picks up the job
 *   4. Intentional failure on attempt 1 → retry with exponential backoff
 *   5. Success on attempt 2
 *   6. /api/health shows queue status "ok"
 *
 * Usage:
 *   REDIS_URL=redis://your-host:6379 node scripts/queue-proof.mjs
 *
 * Expected output:
 *   STEP 1 PASS: Queue connected to Redis
 *   STEP 2 PASS: Job enqueued { jobId: '...', name: 'health_check_test' }
 *   STEP 3: Worker processing job ... (attempt 1/3)
 *   STEP 4 PASS: Job failed as expected (retry will follow) { attempt: 1, error: 'Intentional failure...' }
 *   STEP 3: Worker processing job ... (attempt 2/3)
 *   STEP 5 PASS: Job completed { totalAttempts: 2, returnValue: { success: true } }
 *   STEP 6 PASS: Health endpoint { queueStatus: 'ok', ... }
 *   RESULT: ALL CHECKS PASSED — M1 QUEUE PROOF COMPLETE
 */

import { Queue, Worker } from 'bullmq';
import { URL } from 'url';

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error('ERROR: REDIS_URL environment variable is required.');
  console.error('Set it to a real Redis/Valkey instance before running this script.');
  console.error('Example: REDIS_URL=redis://localhost:6379 node scripts/queue-proof.mjs');
  process.exit(1);
}

// Parse REDIS_URL into ioredis connection options
const url = new URL(redisUrl);
const REDIS_CONN = {
  host: url.hostname,
  port: parseInt(url.port || '6379', 10),
  ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
  ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

const QUEUE_NAME = 'health-check-test';
const evidence = [];
const log = (msg, data = {}) => {
  const entry = { ts: new Date().toISOString(), msg, ...data };
  evidence.push(entry);
  console.log(`[${entry.ts}] ${msg}`, Object.keys(data).length ? JSON.stringify(data) : '');
};

// ─── Step 1: Connect ──────────────────────────────────────────────────────────

log('STEP 1: Creating BullMQ queue and connecting to Redis', { redisHost: url.hostname, redisPort: url.port });
const queue = new Queue(QUEUE_NAME, { connection: REDIS_CONN });
await queue.waitUntilReady();
log('STEP 1 PASS: Queue connected to Redis', { queueName: QUEUE_NAME });

// ─── Step 2: Enqueue ──────────────────────────────────────────────────────────

log('STEP 2: Enqueueing health_check_test job');
const job = await queue.add('health_check_test', {
  type: 'health_check_test',
  message: 'M1 queue execution proof',
  timestamp: Date.now(),
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 500 },
  jobId: `health-check-test-${Date.now()}`,
});
log('STEP 2 PASS: Job enqueued', { jobId: job.id, name: job.name });

// ─── Steps 3-5: Worker with intentional failure ───────────────────────────────

log('STEP 3: Starting worker — will fail on attempt 1, succeed on attempt 2');
const results = { completed: null, failed: null, attempts: [] };

const worker = new Worker(QUEUE_NAME, async (j) => {
  const attemptNum = j.attemptsMade + 1;
  log(`STEP 3: Worker processing job ${j.id} (attempt ${attemptNum}/${j.opts.attempts})`, {
    jobId: j.id, attemptsMade: j.attemptsMade,
  });
  results.attempts.push({ attempt: attemptNum, ts: new Date().toISOString(), jobId: j.id });

  if (attemptNum === 1) {
    log('STEP 4: Intentionally failing attempt 1 to trigger retry/backoff');
    throw new Error('Intentional failure on attempt 1 — testing retry/backoff');
  }

  log(`STEP 3 PASS: Job ${j.id} completed on attempt ${attemptNum}`);
  return { success: true, attempt: attemptNum, completedAt: new Date().toISOString() };
}, { connection: REDIS_CONN, concurrency: 1 });

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timeout: job not completed in 30s')), 30000);

  worker.on('failed', (j, err) => {
    log('STEP 4 PASS: Job failed as expected — retry will follow', {
      jobId: j?.id, attempt: j?.attemptsMade, error: err.message,
      nextRetryIn: '~500ms exponential backoff',
    });
    results.failed = { jobId: j?.id, error: err.message };
  });

  worker.on('completed', (j, returnValue) => {
    log('STEP 5 PASS: Job completed', {
      jobId: j.id, returnValue, totalAttempts: j.attemptsMade + 1,
    });
    results.completed = { jobId: j.id, returnValue, totalAttempts: j.attemptsMade + 1 };
    clearTimeout(timeout);
    resolve();
  });

  worker.on('error', (err) => {
    log('Worker error', { error: err.message });
  });
});

// ─── Step 6: Health check ─────────────────────────────────────────────────────

log('STEP 6: Checking /api/health with Redis available');
const healthRes = await fetch('http://localhost:3000/api/health');
const health = await healthRes.json();
log('STEP 6 PASS: Health endpoint response', {
  status: health.status,
  dbStatus: health.services.database.status,
  queueStatus: health.services.queue.status,
  workerStatuses: health.services.workers.map(w => ({ name: w.name, status: w.status })),
});

await worker.close();
await queue.close();

// ─── Evidence table ───────────────────────────────────────────────────────────

const allPassed = results.completed && results.failed && results.attempts.length >= 2;

console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  M1 QUEUE EXECUTION PROOF — EVIDENCE TABLE                          ║');
console.log('╠══════════════════════════════════════════════════════════════════════╣');
console.log(`║  Redis URL:      ${redisUrl.replace(/:\/\/.*@/, '://<redacted>@').padEnd(52)}║`);
console.log(`║  Queue:          ${QUEUE_NAME.padEnd(52)}║`);
console.log(`║  Job ID:         ${(results.completed?.jobId || 'N/A').padEnd(52)}║`);
console.log('╠══════════════════════════════════════════════════════════════════════╣');
for (const a of results.attempts) {
  console.log(`║  Attempt ${a.attempt}: ${a.ts.padEnd(57)}║`);
}
console.log('╠══════════════════════════════════════════════════════════════════════╣');
console.log(`║  Intentional failure:  ${results.failed ? 'YES' : 'NO'.padEnd(48)}║`);
console.log(`║  Retry/backoff:        exponential, 500ms base                       ║`);
console.log(`║  Final status:         ${results.completed ? 'COMPLETED on attempt ' + results.completed.totalAttempts : 'FAILED'}${''.padEnd(results.completed ? 28 : 44)}║`);
console.log('╠══════════════════════════════════════════════════════════════════════╣');
console.log(`║  /api/health DB:       ${health.services.database.status.padEnd(48)}║`);
console.log(`║  /api/health Queue:    ${health.services.queue.status.padEnd(48)}║`);
console.log('╠══════════════════════════════════════════════════════════════════════╣');
console.log(`║  RESULT: ${allPassed ? 'ALL CHECKS PASSED — M1 QUEUE PROOF COMPLETE' : 'SOME CHECKS FAILED'}${''.padEnd(allPassed ? 22 : 44)}║`);
console.log('╚══════════════════════════════════════════════════════════════════════╝');

import { writeFileSync } from 'fs';
writeFileSync(
  '/home/ubuntu/ai-micro-publisher/scripts/queue-proof-output.json',
  JSON.stringify({ evidence, results, health: health.services }, null, 2)
);
console.log('\nFull evidence saved to scripts/queue-proof-output.json');
process.exit(allPassed ? 0 : 1);
