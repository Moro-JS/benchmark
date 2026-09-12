#!/usr/bin/env node

// MoroJS "Hello World" server (built-in clustering) - matches Fastify benchmark methodology
//
// Force production mode BEFORE the framework loads, regardless of how this
// script is launched. In production MoroJS defaults are benchmark-clean:
// no request logging, no per-request tracking cost (lazy IDs), no default
// middleware chain. The sanity block below prints the resolved flags so every
// published run documents exactly what was active.
process.env.NODE_ENV = 'production';

import { isMainThread, threadId } from 'node:worker_threads';

// MORO_PKG selects which build to benchmark: '@morojs/moro' (published,
// default) or 'moro-local' (symlink to the sibling MoroJS working tree,
// created via `npm run local:link`). The bench runner sets this for the
// *-local targets so prod and local rows can sit in one table.
const MORO_PKG = process.env.MORO_PKG || '@morojs/moro';
const { createApp } = await import(MORO_PKG);

const app = await createApp({
  server: {
    port: parseInt(process.env.PORT || '3111', 10), // createApp options outrank the PORT env var, so resolve it explicitly
    host: '127.0.0.1', // Default benchmark host (override with HOST env var)
  },
  performance: {
    clustering: {
      enabled: true, // Scale across CPU cores
      workers: 'auto',
    },
  },
  // Quiet boot output; per-request logging is already off in production
  logger: {
    level: process.env.LOG_LEVEL || 'warn',
  },
});

app.get('/', () => {
  return { hello: 'world' };
});

app.get('/string', function (_req, _res) {
  _res.end('{ hello: "world" }');
});

// Identity of whichever worker answered: lets the primary (and a reader of
// the published table) state whether this cluster ran worker PROCESSES
// (distinct pids) or worker THREADS (one pid, distinct threadIds). MoroJS
// picks the transport itself; nothing here configures it.
app.get('/whoami', () => {
  return { pid: process.pid, threadId, isMainThread };
});

// Probe the cluster from the outside: several connection-per-request fetches
// land on different workers, and the answers reveal the transport.
async function describeClusterTransport(host, port) {
  const seenPids = new Set();
  const seenThreads = new Set();
  for (let i = 0; i < 16; i++) {
    try {
      const res = await fetch(`http://${host}:${port}/whoami`, { headers: { connection: 'close' } });
      const who = await res.json();
      seenPids.add(who.pid);
      seenThreads.add(who.threadId);
    } catch {
      // worker still booting - the sample is best effort
    }
  }
  if (seenPids.size === 0) return 'unknown (no worker answered)';
  const threads = seenPids.size === 1 && seenPids.has(process.pid);
  return threads
    ? `worker threads (1 process, ${seenThreads.size} thread${seenThreads.size === 1 ? '' : 's'} answered)`
    : `worker processes (${seenPids.size} pid${seenPids.size === 1 ? '' : 's'} answered)`;
}

app.listen(() => {
  // In cluster mode the listen callback runs in the primary; guard anyway so
  // a worker never prints the sanity block N times
  if (!isMainThread) return;
  setTimeout(async () => {
    const config = app.config;
    // Benchmark sanity: every per-request feature must be off/free
    console.log('--- benchmark sanity ---');
    console.log(`NODE_ENV:            ${process.env.NODE_ENV}`);
    console.log(`package:             ${MORO_PKG}`);
    console.log(`requestLogging:      ${config.server.requestLogging?.enabled}`);
    console.log(`requestTracking:     ${config.server.requestTracking?.enabled} (lazy - free unless read)`);
    console.log(`compression (mw):    ${config.performance?.compression?.enabled}`);
    console.log(`cors:                ${config.security?.cors?.enabled}`);
    console.log(`helmet:              ${config.security?.helmet?.enabled}`);
    console.log(`cluster transport:   ${await describeClusterTransport(config.server.host, config.server.port)}`);
    console.log('------------------------');
    console.log(`MoroJS clustered benchmark server listening on http://${config.server.host}:${config.server.port}`);
    console.log(`Run: autocannon -c 100 -d 40 -p 10 http://${config.server.host}:${config.server.port}`);
  }, 1000);
});
