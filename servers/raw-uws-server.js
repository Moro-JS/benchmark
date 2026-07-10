#!/usr/bin/env node
// Baseline: raw uWebSockets.js - the ceiling for the uWS-backed stack
process.env.NODE_ENV = 'production';
import uWS from 'uWebSockets.js';

const port = parseInt(process.env.PORT || '3121', 10);
uWS
  .App()
  .get('/*', res => {
    res.writeHeader('Content-Type', 'application/json').end('{"hello":"world"}');
  })
  .listen('127.0.0.1', port, ok =>
    console.log(ok ? `raw uWebSockets.js listening on ${port}` : 'raw uws failed to listen')
  );
