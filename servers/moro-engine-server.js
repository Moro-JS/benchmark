#!/usr/bin/env node

// MoroJS "Hello World" on @morojs/engine (Moro's own native HTTP engine),
// single thread. Mirrors moro-single-server.js exactly except it forces
// engine: 'moro' so the row unambiguously measures the native engine (and
// asserts at boot that the engine actually loaded, not a silent Node fallback).
process.env.NODE_ENV = 'production';

const MORO_PKG = process.env.MORO_PKG || '@morojs/moro';
const { createApp } = await import(MORO_PKG);

const app = await createApp({
  server: {
    port: parseInt(process.env.PORT || '3116', 10),
    host: '127.0.0.1',
    engine: 'moro', // force Moro's native engine
  },
  performance: {
    clustering: { enabled: false },
  },
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
    const kind = app.engine; // { server, enginePackage, ... }
    console.log('--- benchmark sanity ---');
    console.log(`NODE_ENV:            ${process.env.NODE_ENV}`);
    console.log(`package:             ${MORO_PKG}`);
    console.log(`engine:              ${kind.server}${kind.enginePackage ? ' (' + kind.enginePackage + ')' : ''}`);
    if (kind.fallbackReason) console.log(`engine fallback:     ${kind.fallbackReason}`);
    console.log(`requestLogging:      ${config.server.requestLogging?.enabled}`);
    console.log(`requestTracking:     ${config.server.requestTracking?.enabled} (lazy - free unless read)`);
    console.log(`compression (mw):    ${config.performance?.compression?.enabled}`);
    console.log(`cors:                ${config.security?.cors?.enabled}`);
    console.log(`helmet:              ${config.security?.helmet?.enabled}`);
    console.log('------------------------');
    if (kind.server !== 'engine') {
      console.error('WARNING: expected the native engine but booted:', kind.server);
    }
    console.log(`MoroJS engine benchmark server listening on http://${config.server.host}:${config.server.port}`);
  }, 1000);
});
