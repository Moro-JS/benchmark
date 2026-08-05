#!/usr/bin/env node
// h1spec test subject: the full MoroJS framework on its native engine, both as
// installed from npm. Contract per h1spec README: echo back whatever HTTP body
// arrives. Refuses to run if the native engine didn't actually load, so a
// silent node-http fallback can never produce a bogus pass.
process.env.NODE_ENV = 'production';

const { createApp } = await import('@morojs/moro');

const app = await createApp({
  server: {
    port: parseInt(process.env.PORT || '8001', 10),
    host: '127.0.0.1',
    engine: 'moro',
  },
  performance: { clustering: { enabled: false } },
  logger: { level: 'error' },
});

const echo = (req, res) => {
  const b = req.body;
  if (b == null) return res.end('');
  if (typeof b === 'string' || Buffer.isBuffer(b)) return res.end(b);
  return res.end(String(b));
};

app.get('/', echo);
app.post('/', echo);

app.listen(() => {
  const kind = app.engine;
  if (kind.server !== 'engine') {
    console.error(`expected the native engine but booted: ${kind.server}`, kind.fallbackReason || '');
    process.exit(1);
  }
  console.log(`MoroJS-on-engine echo subject up (${kind.enginePackage || '@morojs/engine'})`);
});
