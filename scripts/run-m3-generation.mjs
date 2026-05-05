/**
 * M3 Evidence Script
 * 1. Accept the top 3 topics from the DB
 * 2. Trigger content generation for each
 * 3. Print the audit trail (tokens, cost, latency, status)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const BASE = 'http://localhost:3000';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

console.log('M3 Generation Evidence Run\n');

// Step 1: Accept top 3 topics via dev endpoint
const acceptRes = await post('/api/dev/accept-topics', { count: 3 });
console.log('Topics accepted:', acceptRes.accepted ?? 'N/A (endpoint not available)');

// Step 2: Trigger generation batch
console.log('\nTriggering generation batch (3 topics)...');
const genRes = await post('/api/dev/generate-batch', { batchSize: 3 });

if (genRes.results) {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  M3 GENERATION EVIDENCE TABLE                                        ║');
  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  console.log('Topic ID  Success  Tokens   Cost($)    Latency   Version  Error');
  console.log('────────  ───────  ───────  ─────────  ────────  ───────  ─────');

  for (const r of genRes.results) {
    const success = r.success ? 'YES    ' : 'NO     ';
    const tokens = String(r.totalTokens).padEnd(7);
    const cost = `$${r.estimatedCostUsd.toFixed(5)}`.padEnd(10);
    const latency = `${(r.latencyMs / 1000).toFixed(1)}s`.padEnd(8);
    const version = `v${r.version}`.padEnd(7);
    const error = r.errorMessage ? r.errorMessage.substring(0, 30) : '';
    console.log(`${String(r.topicId).padEnd(9)} ${success}  ${tokens}  ${cost} ${latency}  ${version}  ${error}`);
  }

  const totalCost = genRes.results.reduce((s, r) => s + r.estimatedCostUsd, 0);
  const succeeded = genRes.results.filter(r => r.success).length;

  console.log('╠══════════════════════════════════════════════════════════════════════╣');
  console.log(`║  Succeeded: ${succeeded}/${genRes.results.length}  Total Cost: $${totalCost.toFixed(5)}                              ║`);
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
} else {
  console.log('Generation result:', JSON.stringify(genRes, null, 2).substring(0, 500));
}

// Step 3: Check spend summary
const spendRes = await fetch(`${BASE}/api/trpc/generation.spendSummary?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D`);
if (spendRes.ok) {
  const spendData = await spendRes.json();
  const spend = spendData[0]?.result?.data?.json;
  if (spend) {
    console.log(`\nSpend Summary: $${spend.todayUsd?.toFixed(5)} / $${spend.limitUsd} (${spend.percentUsed}% used)`);
  }
}
