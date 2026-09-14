#!/usr/bin/env node
// Baseline: raw @morojs/engine - the ceiling for the engine-backed stack.
// Mirrors raw-uws-server.js: bare serve(), hardcoded JSON, no framework.
process.env.NODE_ENV = 'production';

// ENGINE_PKG selects which engine build to benchmark: '@morojs/engine'
// (published, default) or 'engine-local' (symlink to the sibling
// "MoroJS Engine" working tree's packages/engine, whose loader falls back to
// that tree's build/ binaries; created via `npm run engine:link:local`).
const ENGINE_PKG = process.env.ENGINE_PKG || '@morojs/engine';
const { default: engine } = await import(ENGINE_PKG);

const port = parseInt(process.env.PORT || '3128', 10);
const BODY = '{"hello":"world"}';
const HEADERS = ['content-type', 'application/json'];

// Batched dispatch when the engine has it (engine >= 1.1.6; MORO_ENGINE_BATCH=0
// turns it off): the canonical loop over getBatchBuffers() descriptors.
const batchOn = engine.probe().capabilities?.batchDispatch === true;
let buffers = null;
const callbacks = {
  onRequest(reqId) {
    engine.respond(reqId, 200, HEADERS, BODY);
  },
  onAborted() {},
};
if (batchOn) {
  callbacks.onRequestBatch = (count) => {
    const d = buffers.descriptors;
    const ctl = buffers.control;
    let i = 0;
    for (;;) {
      engine.respond(d[3 * i], 200, HEADERS, BODY);
      const next = ctl[0];
      if (next === i) return i + 1;
      if (next >= count) return count;
      i = next;
    }
  };
}
const sid = engine.serve(callbacks);
if (batchOn) buffers = engine.getBatchBuffers(sid);
const bound = engine.listen(sid, '127.0.0.1', port);
console.log(
  bound
    ? `raw ${ENGINE_PKG} (${engine.probe().version}${engine.probe().transport ? `, transport ${engine.probe().transport}` : ''}${batchOn ? ', batch dispatch' : ''}) listening on ${bound}`
    : 'raw engine failed to listen'
);
