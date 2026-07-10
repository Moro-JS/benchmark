#!/usr/bin/env node
// Comparison: Koa hello world - same response shape as the MoroJS servers
process.env.NODE_ENV = 'production';
import Koa from 'koa';

const port = parseInt(process.env.PORT || '3124', 10);
const app = new Koa();

app.use(ctx => {
  ctx.body = { hello: 'world' };
});

app.listen(port, '127.0.0.1', () => console.log(`koa listening on ${port}`));
