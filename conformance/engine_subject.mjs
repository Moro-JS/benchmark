#!/usr/bin/env node
// h1spec test subject: raw @morojs/engine, as installed from npm.
// Contract per h1spec README: echo back whatever HTTP body arrives, any method.
process.env.NODE_ENV = 'production';
import engine from '@morojs/engine';

const port = parseInt(process.env.PORT || '8000', 10);

const probe = engine.probe();
if (!probe.ok) {
  console.error('engine failed to load:', probe.error);
  process.exit(1);
}

const sid = engine.serve({
  onRequest(reqId) {
    const body = engine.getBody(reqId);
    engine.respond(reqId, 200, ['content-type', 'text/plain'], body ? Buffer.from(body) : '');
  },
  onAborted() {},
  onWritable() {},
});

const bound = engine.listen(sid, '127.0.0.1', port);
if (!bound) {
  console.error('engine failed to listen');
  process.exit(1);
}
console.log(`raw @morojs/engine ${probe.version} echo subject on 127.0.0.1:${bound}`);
