#!/usr/bin/env node
// Comparison: Hono running on Node.js via the official @hono/node-server.
// Apples-to-apples with every other Node row in this suite (same runtime,
// same profile, same {"hello":"world"} response shape). @hono/node-server is
// Hono's canonical Node adapter — Hono is multi-runtime, so this is simply
// "Hono on Node," not a compromised port.
process.env.NODE_ENV = 'production';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const port = parseInt(process.env.PORT || '3129', 10);
const app = new Hono();

app.get('/', c => c.json({ hello: 'world' }));

serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () =>
  console.log(`hono (node adapter) listening on ${port}`)
);
