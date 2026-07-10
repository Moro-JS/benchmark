#!/usr/bin/env bun
// Baseline: raw Bun.serve - the ceiling for the Bun stack (no framework).
// Requires Bun; the bench runner skips this target when Bun isn't installed.
process.env.NODE_ENV = 'production';

const port = parseInt(process.env.PORT || '3127', 10);

Bun.serve({
  port,
  hostname: '127.0.0.1',
  reusePort: true, 
  fetch() {
    return new Response('{"hello":"world"}', {
      headers: { 'content-type': 'application/json' },
    });
  },
});

console.log(`raw Bun.serve listening on ${port}`);
