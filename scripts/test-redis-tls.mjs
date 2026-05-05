/**
 * Test raw TLS Redis connection to Upstash
 */
import { createRequire } from 'module';
import tls from 'tls';

const require = createRequire(import.meta.url);
require('dotenv').config();

const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const host = 'touching-lemur-115303.upstash.io';
const port = 6380;

console.log(`[TLS Test] Connecting to ${host}:${port}...`);

const sock = tls.connect(port, host, {
  servername: host,
  rejectUnauthorized: true,
}, () => {
  console.log('[TLS Test] TLS handshake complete. Sending AUTH...');
  const authCmd = `*2\r\n$4\r\nAUTH\r\n$${token.length}\r\n${token}\r\n`;
  sock.write(authCmd);
});

let buf = '';
let step = 'auth';

sock.on('data', (d) => {
  buf += d.toString();
  console.log('[TLS Test] Received:', JSON.stringify(buf));

  if (step === 'auth' && (buf.includes('+OK') || buf.includes('-ERR'))) {
    if (buf.includes('+OK')) {
      console.log('[TLS Test] AUTH OK. Sending PING...');
      step = 'ping';
      buf = '';
      sock.write('*1\r\n$4\r\nPING\r\n');
    } else {
      console.error('[TLS Test] AUTH FAILED:', buf);
      sock.destroy();
      process.exit(1);
    }
  }

  if (step === 'ping' && buf.includes('+PONG')) {
    console.log('[TLS Test] PING -> PONG SUCCESS');
    console.log('[TLS Test] Upstash TLS Redis connection verified');
    sock.destroy();
    process.exit(0);
  }
});

sock.on('error', (e) => {
  console.error('[TLS Test] Socket error:', e.message);
  process.exit(1);
});

sock.on('close', () => {
  if (step !== 'done') {
    console.log('[TLS Test] Connection closed. Last buf:', JSON.stringify(buf));
    process.exit(1);
  }
});

setTimeout(() => {
  console.error('[TLS Test] Timeout after 8s. buf:', JSON.stringify(buf));
  process.exit(1);
}, 8000);
