#!/usr/bin/env node

// MoroJS "Hello World" server - matches Fastify benchmark methodology
// Equivalent to their express/fastify test servers

import { createApp } from '@morojs/moro';

const app = await createApp({
  server: {
    port: 3110,        // Default benchmark port (can be overridden by PORT env var)
    host: '127.0.0.1',  // Default benchmark host (can be overridden by HOST env var)
    requestTracking: {
        enabled: false, // Disable for fair comparison
    },
    errorBoundary: {
        enabled: false, // Disable for fair comparison
    },
  },
  // Minimal middleware for fair comparison
  performance: {
      clustering: {
          enabled: false, // unleash the power of clustering to really see the power
          workers: 'auto',
      },
  },

  // Minimal logging for benchmarks
  logger: {
      level: 'warn'  // This will now work correctly without env var override
  }
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
    console.log(`MoroJS benchmark server listening on http://${config.server.host}:${config.server.port}`);
    console.log('Ready for autocannon benchmarking');
    console.log(`Run: autocannon -c 100 -d 40 -p 10 http://${config.server.host}:${config.server.port}`);
    console.log(`No JSON Header Run: autocannon -c 100 -d 40 -p 10 http://${config.server.host}:${config.server.port}/string`);
  }, 1000);
});
