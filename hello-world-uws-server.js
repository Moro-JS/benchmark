#!/usr/bin/env node

// MoroJS "Hello World" over uWebSockets.js — same routes as hello-world-server.js

import { createApp } from '@morojs/moro';

const app = await createApp({
  server: {
    useUWebSockets: true,
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
    console.log(
      `MoroJS + uWebSockets.js benchmark server listening on http://${config.server.host}:${config.server.port}`,
    );
    console.log('Ready for autocannon benchmarking');
    console.log(
      `Run: autocannon -c 100 -d 40 -p 10 http://${config.server.host}:${config.server.port}`,
    );
    console.log(
      `No JSON Header Run: autocannon -c 100 -d 40 -p 10 http://${config.server.host}:${config.server.port}/string`,
    );
  }, 1000);
});
