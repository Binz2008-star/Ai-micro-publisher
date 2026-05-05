/**
 * M2 — Seed topics database directly (bypasses tRPC auth for dev seeding)
 * Run: node scripts/seed-topics.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

// We call the discovery function directly via a small HTTP endpoint
// that we'll add for dev seeding, or we can call the DB directly

const BASE_URL = 'http://localhost:3000';

// Use the public topics.listPublished to verify server is up
const check = await fetch(`${BASE_URL}/api/trpc/topics.listPublished?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22limit%22%3A1%7D%7D%7D`);
const checkData = await check.json();
console.log('Server check:', check.status === 200 ? 'OK' : 'FAILED');

// Call the internal discovery directly via a special dev endpoint
const res = await fetch(`${BASE_URL}/api/dev/seed-topics`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sources: ['seeded', 'seasonal'] }),
});

if (res.ok) {
  const data = await res.json();
  console.log('Seeding results:');
  for (const r of data.results) {
    console.log(`  ${r.source}: discovered=${r.discovered}, accepted=${r.accepted}, rejected=${r.rejected}`);
  }
} else {
  console.log('Seed endpoint not available, status:', res.status);
  console.log('Use the admin UI at /admin/topics to run discovery after logging in as admin.');
}
