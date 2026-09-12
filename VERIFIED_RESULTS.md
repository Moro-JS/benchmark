# MoroJS Performance Benchmark Results

**Verified 2026-08-03** · `wrk` · Node v24.11.0 · Apple M2 Ultra (24-core, 64 GB), macOS
· MoroJS **1.8.7** · @morojs/engine **1.1.5** — both installed **from npm** (the
exact artifacts users get), served by `bench.js` (one server at a time, per-target
ports, boot sanity asserts the intended engine actually loaded).

## Candidate run 2026-09-11 — engine 1.2.0 / MoroJS 1.9.0 working trees (not yet published)

Not a publication number: the working trees, not npm artifacts. Full table,
gate output and analysis in [candidates/2026-09-11](candidates/2026-09-11/README.md);
the baseline it is measured against in [baselines/2026-09-11](baselines/2026-09-11/README.md).
Same box, harness and flags as the publication run below, plus the new
profiles (`--rate=50000`, `--keepalive=off`, CPU µs/req, bytes/resp).

| Row (2026-09-11 candidate) | no pipelining | pipelined ×10 | CPU µs/req | RSS |
|---|---|---|---|---|
| raw @morojs/engine 1.2.0-candidate | 114,626 | **936,861** | 8.5 | 48 MB |
| MoroJS 1.9.0-candidate + engine | **115,056** | **926,119** | 8.4 | 68 MB |
| MoroJS 1.9.0-candidate clustered (worker threads, one process) | 112,596 | 936,765 | 8.7 | **504 MB** |
| raw @morojs/engine 1.1.5 (npm, same session) | 114,579 | 845,313 | 8.5 | 48 MB |
| MoroJS 1.8.7 + engine 1.1.5 (npm, same session) | 112,383 | 758,666 | 8.7 | 65 MB |
| MoroJS 1.8.7 clustered (24 processes, npm, same session) | 113,383 | 728,937 | 8.6 | 1,146 MB |
| raw uWebSockets.js (same session) | 113,049 | 742,609 | 8.6 | 55 MB |
| raw Bun.serve (same session) | 108,330 | 32,779 | 9.3 | 37 MB |

The same trees in a dedicated Linux container (kernel 6.12, 8 vCPU, `wrk`
+ `oha`, Bun from its installer) — the comparison the program set out to
make: MoroJS-on-engine **326,345** plain / **1,460,634** pipelined /
**107,660** conn/s / **3.1 µs** CPU per request / **77 MB** against raw
Bun.serve's 272,251 / 44,186 / 110,587 / 3.8 µs / 551 MB, with half Bun's
p99 at a fixed 20k req/s (1.6 vs 3.2 ms); worker-thread clustering 713,379 /
4,310,410 in 249 MB. Full table and conditions in
[candidates/2026-09-11/README.md](candidates/2026-09-11/README.md#linux-in-a-dedicated-container-linux).

Connection churn (keep-alive off, one connection per request), the one cell
where the morning candidate trailed Bun on macOS, was a FIN-timing bug fixed
the same day; re-measured, MoroJS-on-engine does **28,306** conn/s on macOS
against raw Bun's 26,854 (raw engine 27,555 vs 25,310 in a three-run
head-to-head) and **126,484** on Linux against 116,988 — details in
[candidates/2026-09-11/README.md](candidates/2026-09-11/README.md#connection-churn-after-the-fin-fix-churn-fix-linux-churn-fix).

What changed between the rows: prepared response templates + V8 fast API
calls + batched pipelined dispatch on the JS boundary, the `Connection:
keep-alive` line dropped from HTTP/1.1 responses (149 → 125 bytes/resp), a
PGO-optimised binary, and worker-thread clustering (the clustered row is one
process). The headline tables below stay at the published 1.1.5 / 1.8.7
numbers until the new versions are on npm and re-verified from there.

## Publication run — full matrix, `-d 40`, best-of-3 (the headline numbers)

Saved by `bench.js --save`: [results-2026-08-03T02-53-28.md](results-2026-08-03T02-53-28.md).
`wrk -c 100 -d 40`, best-of-3 per target, both profiles, one server at a time.
Machine caveat, disclosed rather than hidden: background system tasks held load
at ~6–8 for this run (the 2026-07-10 run started under 3). Every MoroJS and
engine row nonetheless **beat** the idle-box 2026-07-10 publication numbers, so
if anything these figures are conservative; the non-Moro rows' small declines
from July (and the elevated Node-row p99s) are consistent with that load.

| Server | Req/sec (no pipelining) | Req/sec (pipelined ×10) | Latency avg | Latency p99 | RSS under load |
|--------|------------------------|--------------------------|-------------|-------------|----------------|
| **raw @morojs/engine (baseline, no framework)** | **111,325** | **779,935** | 0.9 ms | 1.8 ms | 47 MB |
| MoroJS (clustered, npm)² | 109,144 | 741,719 | 0.9 ms | 1.7 ms | 1582 MB |
| **MoroJS + @morojs/engine (npm)** _(default)_ | **108,687** | **688,980** | **0.9 ms** | 1.9 ms | **65 MB** |
| raw uWebSockets.js (baseline, no framework) | 107,935 | 656,155 | 0.9 ms | 1.7 ms | 43 MB |
| MoroJS + uWebSockets.js (npm) | 103,061 | 527,074 | 0.9 ms | 1.9 ms | 73 MB |
| raw Bun.serve (baseline, no framework)³ | 99,613 | 24,970 | 1.0 ms | 3.0 ms | 29 MB |
| Elysia (Bun)³ | 98,139 | 23,916 | 1.0 ms | 2.5 ms | 41 MB |
| raw node:http (baseline, no framework) | 71,437 | 116,116 | 1.4 ms | 5.0 ms | 136 MB |
| MoroJS (single thread, node engine, npm) | 71,080 | 124,535 | 1.4 ms | 2.6 ms | 140 MB |
| Fastify | 68,880 | 109,492 | 1.4 ms | 4.2 ms | 139 MB |
| Elysia (Node adapter)³ | 65,034 | 112,427 | 1.5 ms | 2.7 ms | 207 MB |
| Hono (Node) | 64,758 | 107,757 | 1.5 ms | 2.9 ms | 200 MB |
| Koa | 59,697 | 88,606 | 1.7 ms | 4.8 ms | 204 MB |
| Express | 45,976 | 65,988 | 2.2 ms | 4.4 ms | 209 MB |

Headlines:

- **The raw engine is the fastest thing on the board in both profiles** —
  111,325 / 779,935 vs raw uWS's 107,935 / 656,155 (**+3.1% / +18.9%**) and
  raw Bun's 99,613 / 24,970. In July the raw-vs-raw pipelined lead over uWS
  was +2.5%; the 1.1.5 hot-path work (quadratic-parse fix, shared receive
  buffer, allocation-free V8 boundary) opened it to ~19%.
- **The full framework now outruns bare uWS in the pipelined profile** —
  688,980 through MoroJS's complete pipeline vs 647,530–656,155 for raw
  uWebSockets.js with no framework at all — and beats raw Bun.serve in the
  realistic profile (108,687 vs 99,613).
- **The default-path RSS story changed class: 230 MB → 65 MB** (1.8.7 +
  1.1.5 vs the 1.8.0 + 1.1.0 publication run) — lazy adapter allocation, the
  in-flight-registry fix, lazy builtin loading, and the engine's shared
  receive buffer, compounding. The raw engine sits at 47 MB vs uWS's 43.
- vs the 2026-07-10 publication run, the default MoroJS + engine row moved
  **102,409 → 108,687** realistic (+6.1%) and **572,053 → 688,980** pipelined
  (**+20.4%**), with p99 flat.
- ² Clustered (24 SO_REUSEPORT workers) still sits at the same single-box
  loopback ceiling — the load generator competes with the workers for cores.
  Its RSS dropped 2051 → 1582 MB from 1.8.7's per-worker young-generation
  bound (`--max-semi-space-size=4`, applied unless the operator tunes it).
- ³ Bun rows: raw `Bun.serve` and Elysia-on-Bun still collapse under
  pipelining (~24–25k) — a runtime-level behavior, and exactly why both
  profiles are always shown. Elysia's Node adapter costs it ~34%
  (98,139 → 65,034).

## vs uWebSockets.js

uWebSockets.js remains the yardstick as the fastest widely-used HTTP server
binding in the Node ecosystem. Bare-vs-bare in this run (no framework on
either side, same sweep, best-of-3 each): **realistic 111,325 vs 107,935
(+3.1%) · pipelined ×10 779,935 vs 656,155 (+18.9%)** — and the raw engine's
RSS is now within 4 MB of uWS (47 vs 43). The July claim was "trades within a
few percent"; as of engine 1.1.5 the pipelined gap is no longer within noise.
The distance between raw uWS and MoroJS's full-framework rows above is
framework cost, not engine cost — and in the pipelined profile the framework
row now clears raw uWS entirely.

## Notes

- **Pipelining context:** the pipelined ×10 column is a TechEmpower-plaintext-style
  microbenchmark; real HTTP clients do not pipeline. Both columns are shown so
  neither story is cherry-picked. The 1.1.5 pipelined gain is dominated by the
  parser no longer memmoving the entire buffered backlog once per request
  (O(batch²) → amortized linear).
- Loopback + single-box no-pipelining throughput converges near ~100–111k on
  this hardware regardless of server — differences beyond that ceiling only
  show up in the pipelined profile or on multi-machine setups. The Node-engine
  rows (~71k) sit at the `node:http` ceiling: MoroJS single-thread matches raw
  `node:http` within noise.
- RSS is sampled under load by `bench.js`; cross-session RSS for the non-Moro
  rows varies with box state and should be compared within a run, not across
  runs.
- Previous publication run (2026-07-10, MoroJS 1.8.0 + engine 1.1.0, idle
  box): [results-2026-07-10T08-55-20.md](results-2026-07-10T08-55-20.md).
  Engine 1.1.1–1.1.4 were performance-equivalent to 1.1.0; the deltas above
  are the 1.8.7 + 1.1.5 performance work
  ([engine release notes](https://github.com/Moro-JS/engine/releases/tag/v1.1.5)).
