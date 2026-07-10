#!/usr/bin/env bun
// Comparison: Elysia running natively on Bun (its home runtime) - the
// canonical hello world straight from Elysia's docs, zero adapters.
// Requires Bun; the bench runner skips this target when Bun isn't installed.
// Compare against MoroJS + uWebSockets.js for the cross-runtime story:
// both stacks sit on uSockets-class C++ transports.
process.env.NODE_ENV = 'production';
import { Elysia } from 'elysia';

const port = parseInt(process.env.PORT || '3126', 10);

new Elysia()
  .get('/', () => ({ hello: 'world' }))
  .listen({ port, hostname: '127.0.0.1' }, () =>
    console.log(`elysia (bun) listening on ${port}`)
  );
