/**
 * Generate 5 drafts with patched brief, then immediately run quality review.
 * Reports final decisions.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const BASE = 'http://localhost:3000';

async function post(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

console.log('Step 1: Accept 5 topics...');
const accepted = await post('/api/dev/accept-topics', { count: 5 });
console.log(`Accepted ${accepted.accepted} topics: ${JSON.stringify(accepted.topicIds)}`);

console.log('\nStep 2: Generate 5 drafts with patched brief (keyword + audience instructions)...');
const genResult = await post('/api/dev/generate-batch', { batchSize: 5 });
console.log(`Generated: ${genResult.summary?.succeeded}/${genResult.results?.length} succeeded`);
for (const r of genResult.results ?? []) {
  console.log(`  Topic ${r.topicId}: ${r.success ? 'OK' : 'FAIL'} | tokens=${r.totalTokens} | cost=$${r.estimatedCostUsd?.toFixed(5)} | latency=${(r.latencyMs/1000).toFixed(1)}s | pageId=${r.pageId}`);
}

console.log('\nStep 3: Run quality review on all drafts...');
const reviewResult = await post('/api/dev/review-all');
const results = reviewResult.results ?? [];
console.log(`Reviewed ${results.length} pages`);
console.log();
console.log('PageID | Decision       | Publish | Safety | Useful | Coherence | Factual | Policy');
console.log('-------|----------------|---------|--------|--------|-----------|---------|-------');
for (const r of results) {
  const dec = (r.decision ?? 'unknown').padEnd(14);
  console.log(`${String(r.pageId).padEnd(6)} | ${dec} | ${String(r.publishScore).padEnd(7)} | ${String(r.safetyScore).padEnd(6)} | ${String(r.usefulnessScore).padEnd(6)} | ${String(r.coherenceScore).padEnd(9)} | ${String(r.factualGroundingScore).padEnd(7)} | ${r.policyStatus}`);
}

const approved = results.filter(r => r.decision === 'approve');
const retry = results.filter(r => r.decision === 'retry');
const rejected = results.filter(r => r.decision === 'reject' || r.decision === 'reject_stage1');
const merge = results.filter(r => r.decision === 'merge');

console.log(`\nSummary: approved=${approved.length}, retry=${retry.length}, rejected=${rejected.length}, merge=${merge.length}`);
console.log(approved.length > 0 ? `\n✓ APPROVED pages ready for M5 publishing: ${approved.map(r => r.pageId).join(', ')}` : '\n✗ No approved pages yet');

import { writeFileSync } from 'fs';
writeFileSync('/home/ubuntu/ai-micro-publisher/scripts/gen-review-output.json', JSON.stringify({ genResult, reviewResult }, null, 2));
console.log('\nFull output saved to scripts/gen-review-output.json');
