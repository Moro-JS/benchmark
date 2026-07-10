#!/usr/bin/env node
// Comparison: Elysia running on Node.js via the official @elysiajs/node adapter.
// Apples-to-apples with every other Node row in this suite (same runtime,
// same profile). For Elysia on its home runtime, see elysia-bun-server.js.
process.env.NODE_ENV = 'production';
import { Elysia } from 'elysia';
import { node } from '@elysiajs/node';

const port = parseInt(process.env.PORT || '3125', 10);

new Elysia({ adapter: node() })
  .get('/', () => ({ hello: 'world' }))
  .listen({ port, hostname: '127.0.0.1' }, () =>
    console.log(`elysia (node adapter) listening on ${port}`)
  );
