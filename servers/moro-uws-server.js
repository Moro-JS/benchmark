#!/usr/bin/env node

// MoroJS "Hello World" over uWebSockets.js - same routes as moro-single-server.js
//
// Force production mode BEFORE the framework loads, regardless of how this
// script is launched. In production MoroJS defaults are benchmark-clean:
// no request logging, no per-request tracking cost (lazy IDs), no default
// middleware chain - which also means fast-path routes register directly on
// uWS's native router (watch for the "fast-path routes registered on native
// uWS router" line with LOG_LEVEL=info).
process.env.NODE_ENV = 'production';

// MORO_PKG selects which build to benchmark: '@morojs/moro' (published,
// default) or 'moro-local' (symlink to the sibling MoroJS working tree,
// created via `npm run local:link`). The bench runner sets this for the
// *-local targets so prod and local rows can sit in one table.
const MORO_PKG = process.env.MORO_PKG || '@morojs/moro';
const { createApp } = await import(MORO_PKG);

const app = await createApp({
  server: {
    port: parseInt(process.env.PORT || '3112', 10), // createApp options outrank the PORT env var, so resolve it explicitly
    host: '127.0.0.1', // Default benchmark host (override with HOST env var)
    useUWebSockets: true,
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

app.listen(() => {
  setTimeout(() => {
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
    console.log('------------------------');
    console.log(`MoroJS + uWebSockets.js benchmark server listening on http://${config.server.host}:${config.server.port}`);
    console.log(`Run: autocannon -c 100 -d 40 -p 10 http://${config.server.host}:${config.server.port}`);
  }, 1000);
});
