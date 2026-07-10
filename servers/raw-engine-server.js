#!/usr/bin/env node
// Baseline: raw @morojs/engine - the ceiling for the engine-backed stack.
// Mirrors raw-uws-server.js: bare serve(), hardcoded JSON, no framework.
process.env.NODE_ENV = 'production';
import engine from '@morojs/engine';

const port = parseInt(process.env.PORT || '3128', 10);
const BODY = '{"hello":"world"}';
const HEADERS = ['content-type', 'application/json'];

const sid = engine.serve({
  onRequest(reqId) {
    engine.respond(reqId, 200, HEADERS, BODY);
  },
  onAborted() {},
});
const bound = engine.listen(sid, '127.0.0.1', port);
console.log(
  bound
    ? `raw @morojs/engine (${engine.probe().version}) listening on ${bound}`
    : 'raw engine failed to listen'
);
