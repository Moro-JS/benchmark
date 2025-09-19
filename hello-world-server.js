#!/usr/bin/env node

// MoroJS "Hello World" server - matches Fastify benchmark methodology
// Equivalent to their express/fastify test servers

const { createApp } = require('@morojs/moro');

const app = createApp();

// Minimal "hello world" endpoint - matches Fastify benchmark style
app.get('/', () => {
  return { hello: 'world' };
});

// No JSON Header "hello world" endpoint
app.get('/string', function (_req, _res) {
    _res.end('{ hello: "world" }');
});

// Start server on port 3111 (avoid conflicts)
app.listen(() => {
  setTimeout(() => {
      const config = app.config;
      console.log(`MoroJS benchmark server listening on http://${config.server.host}:${config.server.port}`);
      console.log('Ready for autocannon benchmarking');
      console.log(`Run: autocannon -c 100 -d 40 -p 10 http://${config.server.host}:${config.server.port}`);
      console.log(`No JSON Header Run: autocannon -c 100 -d 40 -p 10 http://${config.server.host}:${config.server.port}/string`);
  }, 1000);
}); 