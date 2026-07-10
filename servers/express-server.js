#!/usr/bin/env node
// Comparison: Express hello world - same response shape as the MoroJS servers
process.env.NODE_ENV = 'production';
import express from 'express';

const port = parseInt(process.env.PORT || '3123', 10);
const app = express();

app.get('/', (req, res) => {
  res.json({ hello: 'world' });
});

app.listen(port, '127.0.0.1', () => console.log(`express listening on ${port}`));
