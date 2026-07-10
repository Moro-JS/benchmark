# MoroJS Performance Benchmark Results

**Verified 2026-07-10** · `wrk` · Node v24.11.0 · Apple M2 Ultra (24-core, 64 GB), macOS
· MoroJS **1.8.0** · @morojs/engine **1.1.0** — both installed **from npm** (the
exact artifacts users get), served by `bench.js` (one server at a time, per-target
ports, boot sanity asserts the intended engine actually loaded). Engine 1.1.1 was
subsequently A/B-verified performance-identical to 1.1.0 (alternating
published-binary rounds), so these results represent both.

## Publication run — full matrix, `-d 40`, best-of-3 (the headline numbers)

Saved by `bench.js --save`: [results-2026-07-10T08-55-20.md](results-2026-07-10T08-55-20.md).
`wrk -c 100 -d 40`, best-of-3 per target, both profiles, one server at a time,
idle machine (load < 3 at start):

| Server | Req/sec (no pipelining) | Req/sec (pipelined ×10) | Latency avg | Latency p99 | RSS under load |
|--------|------------------------|--------------------------|-------------|-------------|----------------|
| raw @morojs/engine (baseline, no framework) | 105,974 | 663,735 | 0.9 ms | 1.8 ms | 72 MB |
| MoroJS + @morojs/engine (clustered, npm)² | 103,971 | 584,016 | 0.9 ms | 1.6 ms | 2051 MB |
| raw uWebSockets.js (baseline, no framework) | 103,744 | 647,530 | 0.9 ms | 1.7 ms | 53 MB |
| **MoroJS + @morojs/engine (npm)** _(default)_ | **102,409** | **572,053** | **0.9 ms** | 1.6 ms | 230 MB |
| MoroJS + uWebSockets.js (npm) | 101,237 | 520,799 | 0.9 ms | 1.6 ms | 87 MB |
| raw Bun.serve (baseline, no framework)³ | 107,119 | 21,686 | 0.9 ms | 1.9 ms | 36 MB |
| Elysia (Bun)³ | 96,717 | 18,690 | 1.0 ms | 1.7 ms | 78 MB |
| Fastify | 69,375 | 117,069 | 1.4 ms | 1.8 ms | 215 MB |
| raw node:http (baseline, no framework) | 69,045 | 109,538 | 1.4 ms | 1.8 ms | 258 MB |
| MoroJS (single thread, node engine, npm) | 68,163 | 119,570 | 1.4 ms | 1.8 ms | 216 MB |
| Elysia (Node adapter)³ | 66,786 | 115,798 | 1.5 ms | 1.9 ms | 219 MB |
| Koa | 60,924 | 93,903 | 1.6 ms | 2.1 ms | 220 MB |
| Hono | 56,926 | 100,278 | 1.4 ms | 3.0 ms | 204 MB |
| Express | 47,279 | 69,540 | 2.1 ms | 2.6 ms | 233 MB |

Headlines:

- **Engine beats MoroJS-on-uWS in both profiles**: real-world 102,409 vs
  101,237 (by a hair — the realistic lead trades within ±2% run-to-run) and
  pipelined **572,053 vs 520,799 (+9.8%)**.
- The engine path is **~50% faster than the Node-http path** real-world
  (102,409 vs 68,163) and ~4.8× pipelined.
- ² Clustered sits at the same single-box loopback ceiling as the single-thread
  rows — the load generator competes with the workers for cores. Its number is
  reported for completeness, not as a measure of clustering.
- ³ Bun rows: raw `Bun.serve` posts the fastest realistic baseline (107,119)
  but collapses under pipelining (21,686), and Elysia-on-Bun collapses the same
  way (18,690) — a runtime-level behavior, and exactly why both profiles are
  always shown. Elysia's Node adapter costs it ~31% (96,717 → 66,786).

## vs uWebSockets.js

uWebSockets.js is currently the fastest HTTP server binding in the Node
ecosystem, which makes it the yardstick. Bare-vs-bare (no framework on either
side), alternating best-of-3 rounds on an idle machine, the raw engine leads
on average and on peak in **both profiles**:

**realistic — 106,008 vs 105,635 req/s · pipelined ×10 — 663,735 vs 642,836
req/s** (rounds trade within a few percent; the engine took 2 of 3 in each
profile). The gap between raw uWS and MoroJS's full-framework rows in the
table above is framework cost, not engine cost.

## Notes

- **The clustered row is the same native engine × 24 SO_REUSEPORT workers**
  (clustering doesn't change the transport; the engine is the default). Its
  single-box number structurally understates clustering: the load generator and
  the workers compete for the same cores over loopback, so it lands at the same
  ceiling as one worker. Measure clustering from a separate load host.
- **Pipelining context:** the pipelined ×10 column is a TechEmpower-plaintext-style
  microbenchmark; real HTTP clients do not pipeline. Both columns are shown so
  neither story is cherry-picked. The engine's pipelined gain (since 1.1.0) comes from
  response corking (batch → single write per batch).
- Loopback + single-box no-pipelining throughput converges near ~100–106k on
  this hardware regardless of server (verified with wrk, oha, and bombardier) —
  differences beyond that ceiling only show up in the pipelined profile or on
  multi-machine setups.
- Historical autocannon-era results (226k pipelined uWS, 190k clustered, MoroJS
  ≤1.7.x) were removed 2026-07-10: different tool, different methodology, files
  that no longer exist in `servers/`. Git history has them.
