#!/usr/bin/env node
// Comparison: Fastify hello world - same response shape as the MoroJS servers
process.env.NODE_ENV = 'production';
import Fastify from 'fastify';

const port = parseInt(process.env.PORT || '3122', 10);
const app = Fastify({ logger: false });

app.get('/', async () => ({ hello: 'world' }));

app.listen({ port, host: '127.0.0.1' }).then(() => console.log(`fastify listening on ${port}`));
