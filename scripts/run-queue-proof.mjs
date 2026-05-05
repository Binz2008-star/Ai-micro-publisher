/**
 * Queue proof runner — derives REDIS_URL from Upstash env vars if needed,
 * then runs the full queue execution proof.
 */

import { createRequire } from 'module';
import { URL } from 'url';
import { spawn } from 'child_process';

const require = createRequire(import.meta.url);
require('dotenv').config();

// If REDIS_URL is not set or is localhost, derive from Upstash REST credentials
let redisUrl = process.env.REDIS_URL;
const isLocalhost = !redisUrl || redisUrl.includes('127.0.0.1') || redisUrl.includes('localhost');

if (isLocalhost) {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (restUrl && token) {
    const host = new URL(restUrl).hostname;
    redisUrl = `rediss://default:${token}@${host}:6380`;
    console.log('[Setup] Derived REDIS_URL from Upstash credentials:', redisUrl.replace(token, '<token>'));
  } else {
    console.error('ERROR: No valid REDIS_URL or Upstash credentials found.');
    process.exit(1);
  }
}

// Run queue-proof.mjs with the correct REDIS_URL
const child = spawn('node', ['scripts/queue-proof.mjs'], {
  env: { ...process.env, REDIS_URL: redisUrl },
  stdio: 'inherit',
  cwd: process.cwd(),
});

child.on('exit', (code) => process.exit(code ?? 0));
