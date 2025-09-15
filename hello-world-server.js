#!/usr/bin/env node

// MoroJS "Hello World" server - matches Fastify benchmark methodology
// Equivalent to their express/fastify test servers

const { createApp } = require('@morojs/moro');

const app = createApp();

// Minimal "hello world" endpoint - matches Fastify benchmark style
app.get('/', function (_req, _res) {
  return { hello: 'world' };
});

// Start server on port 3111 (avoid conflicts)
app.listen(3111, '127.0.0.1', () => {
  console.log('MoroJS benchmark server listening on http://127.0.0.1:3111');
  console.log('Ready for autocannon benchmarking');
  console.log('Run: autocannon -c 100 -d 40 -p 10 http://127.0.0.1:3111');
}); 