#!/usr/bin/env node
// Baseline: raw node:http - the ceiling for any Node framework on the standard stack
process.env.NODE_ENV = 'production';
import http from 'node:http';

const port = parseInt(process.env.PORT || '3120', 10);
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"hello":"world"}');
});
server.listen(port, '127.0.0.1', () => console.log(`raw node:http listening on ${port}`));
