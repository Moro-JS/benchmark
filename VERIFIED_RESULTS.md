# MoroJS Performance Benchmark Results

**Verified 2026-09-16** · `wrk` · Node v24.11.0 · Apple M2 Ultra (24-core, 64 GB), macOS
· MoroJS **1.8.12** · @morojs/engine **1.1.7** — both installed **from npm** (the
exact artifacts users get), served by `bench.js` (one server at a time, per-target
ports, boot sanity asserts the intended engine actually loaded).

## Publication run 2026-09-16 — MoroJS 1.8.12 / engine 1.1.7, full matrix, `-d 40`, best-of-3 (the headline numbers)

Saved by `bench.js --save`: [results-2026-09-16T01-15-31.md](results-2026-09-16T01-15-31.md)
(+ `.json`). `wrk -c 100 -d 40`, best-of-3 per target, both profiles, one
server at a time. Bun 1.3.14, uWebSockets.js 20.69. CPU µs/req and bytes/resp
are from the no-pipelining profile.

| Server | Req/sec (no pipelining) | Req/sec (pipelined ×10) | Latency avg | Latency p99 | CPU µs/req | bytes/resp | RSS under load |
|--------|------------------------|--------------------------|-------------|-------------|------------|------------|----------------|
| **MoroJS + @morojs/engine (npm)** _(default)_ | **111,485** | **913,503** | **0.9 ms** | **3.3 ms** | **8.5** | 125 B | 66 MB |
| raw @morojs/engine (baseline, no framework) | 108,446 | 832,171 | 1.0 ms | 2.0 ms | 9.0 | 125 B | 54 MB |
| MoroJS (clustered, npm)² | 106,625 | 953,169 | 0.9 ms | 1.9 ms | 9.3 | 125 B | 432 MB |
| raw uWebSockets.js (baseline, no framework) | 106,287 | 652,934 | 1.0 ms | 1.9 ms | 9.2 | 142 B | 47 MB |
| raw Bun.serve (baseline, no framework)³ | 104,026 | 22,558 | 1.0 ms | 2.2 ms | 9.5 | 125 B | 37 MB |
| MoroJS + uWebSockets.js (npm) | 103,264 | 517,718 | 1.1 ms | 2.6 ms | 9.5 | 142 B | 73 MB |
| Elysia (Bun)³ | 103,196 | 18,747 | 1.0 ms | 2.4 ms | 9.6 | 139 B | 39 MB |
| raw node:http (baseline, no framework) | 80,363 | 122,320 | 1.3 ms | 6.6 ms | 12.0 | 191 B | 134 MB |
| Elysia (Node adapter) | 73,257 | 117,886 | 1.4 ms | 5.4 ms | 13.3 | 172 B | 219 MB |
| MoroJS (single thread, node engine, npm) | 70,396 | 118,135 | 1.6 ms | 9.0 ms | 13.6 | 187 B | 141 MB |
| Hono (Node) | 70,320 | 111,114 | 1.5 ms | 5.4 ms | 13.8 | 172 B | 205 MB |
| Fastify | 70,190 | 115,892 | 1.4 ms | 4.3 ms | 13.7 | 188 B | 134 MB |
| Koa | 61,216 | 98,674 | 1.6 ms | 3.4 ms | 16.3 | 187 B | 208 MB |
| Express | 46,790 | 65,664 | 2.2 ms | 5.5 ms | 21.2 | 252 B | 224 MB |

² 24 worker threads in one process (the engine backend's default on POSIX);
reported for completeness — on a single box the generator competes with the
workers for cores. ³ Bun 1.3.14.

Read this run against 2026-09-14 with one caveat: **every row, the three
baselines included, landed 5–10% below the 2026-09-14 numbers and every p99
widened** (raw node:http 1.7 → 6.6 ms, Fastify 2.1 → 4.3 ms), so the box was
not as quiet. The absolute figures are a lower bound; the ordering and the
ratios are the finding.

- **The full framework is still the fastest row without pipelining**:
  111,485 vs the raw engine's 108,446 (+2.8%), raw uWebSockets.js's 106,287
  (+4.9%), raw Bun.serve's 104,026 (+7.2%) and Elysia (Bun)'s 103,196
  (+8.0%). Pipelined it stays far ahead of every non-engine row (913,503 vs
  652,934 for raw uWS), with the clustered row now the top pipelined number
  at 953,169.
- **1.8.12 / 1.1.7 changed nothing on this hot path, and the run confirms
  no regression**: the engine row costs 8.5 µs/req against 8.1 on 09-14,
  inside the box-state shift seen on every baseline. The release's fixes
  (engine callbacks run in a Node callback scope, so promise continuations
  drain on return; literal route handlers answered inside the engine) are
  invisible to a function-handler hello-world by design.
- **Against the framework field** (no pipelining): 1.59× Fastify, 1.52×
  Elysia on Node, 1.58× Hono, 1.82× Koa, 2.38× Express.

## Publication run 2026-09-14 — MoroJS 1.8.10 / engine 1.1.6, full matrix, `-d 40`, best-of-3 (the headline numbers)

Saved by `bench.js --save`: [results-2026-09-14T14-21-41.md](results-2026-09-14T14-21-41.md)
(+ `.json`). `wrk -c 100 -d 40`, best-of-3 per target, both profiles, one
server at a time, idle box. Bun 1.3.14, uWebSockets.js 20.69. CPU µs/req and
bytes/resp are from the no-pipelining profile.

| Server | Req/sec (no pipelining) | Req/sec (pipelined ×10) | Latency avg | Latency p99 | CPU µs/req | bytes/resp | RSS under load |
|--------|------------------------|--------------------------|-------------|-------------|------------|------------|----------------|
| **MoroJS + @morojs/engine (npm)** _(default)_ | **119,226** | **965,928** | **0.8 ms** | **1.3 ms** | **8.1** | 125 B | 66 MB |
| raw Bun.serve (baseline, no framework)³ | 115,042 | 24,949 | 0.8 ms | 1.4 ms | 8.7 | 125 B | 29 MB |
| raw @morojs/engine (baseline, no framework) | 110,598 | 893,133 | 0.9 ms | 1.5 ms | 8.8 | 125 B | 45 MB |
| MoroJS (clustered, npm)² | 108,826 | 829,616 | 0.9 ms | 1.6 ms | 9.2 | 125 B | 391 MB |
| raw uWebSockets.js (baseline, no framework) | 106,051 | 693,481 | 0.9 ms | 1.5 ms | 9.3 | 142 B | 48 MB |
| Elysia (Bun)³ | 102,885 | 25,022 | 0.9 ms | 1.6 ms | 9.8 | 139 B | 48 MB |
| MoroJS + uWebSockets.js (npm) | 100,857 | 519,381 | 0.9 ms | 1.7 ms | 9.8 | 142 B | 64 MB |
| raw node:http (baseline, no framework) | 86,407 | 130,792 | 1.1 ms | 1.7 ms | 11.5 | 191 B | 197 MB |
| MoroJS (single thread, node engine, npm) | 79,157 | 125,587 | 1.2 ms | 1.9 ms | 12.5 | 187 B | 141 MB |
| Fastify | 78,640 | 126,635 | 1.2 ms | 2.1 ms | 12.6 | 188 B | 204 MB |
| Elysia (Node adapter)³ | 74,620 | 124,227 | 1.3 ms | 1.9 ms | 13.3 | 172 B | 218 MB |
| Hono (Node) | 66,618 | 112,473 | 1.4 ms | 2.0 ms | 14.8 | 172 B | 201 MB |
| Koa | 63,389 | 96,357 | 1.5 ms | 2.4 ms | 15.5 | 187 B | 206 MB |
| Express | 50,098 | 70,258 | 2.0 ms | 2.8 ms | 20.0 | 252 B | 220 MB |

² 24 **worker threads in one process** (the 1.8.10 default for the engine
backend on POSIX); the 2026-08-03 row was 24 processes at 1,582 MB. On a
single box the generator competes with the workers for cores, so the row
lands at the loopback ceiling like one thread — reported for completeness.
³ Bun 1.3.14.

Headlines against the 2026-08-03 publication run (1.8.7 / 1.1.5):

- **The full framework is the fastest row on the board in both profiles**:
  119,226 / 965,928 vs raw Bun.serve's 115,042 / 24,949 (+3.6% / 39×), raw
  uWebSockets.js's 106,051 / 693,481 (+12.4% / +39%), and the raw engine's
  own 110,598 / 893,133 — the framework row now outruns the bare engine
  server because it uses the prepared response templates and batched
  dispatch the bare benchmark server does not.
- **+9.7% realistic, +40% pipelined, same memory** for the default path:
  108,687 → 119,226 and 688,980 → 965,928 at 65 → 66 MB, with CPU per
  request 8.1 µs against Bun's 8.7 and uWS's 9.3.
- **Clustering at a quarter of the memory**: 391 MB for 24 workers (threads)
  against 1,582 MB (processes), at 108,826 / 829,616.
- The non-Moro rows moved with the box (raw node:http 71,437 → 86,407,
  Fastify 68,880 → 78,640): this run had an idle machine where the August
  run carried background load, so the absolute numbers are higher across
  the table and the comparisons within the run are what to read.
- What changed in the two releases, and the per-generator and Linux
  measurements behind them: the candidate sections below and
  [candidates/2026-09-13/README.md](candidates/2026-09-13/README.md).

## Candidate run 2026-09-11 — engine 1.1.6 / MoroJS 1.9.0 working trees (shipped as @morojs/engine 1.1.6 and MoroJS 1.8.10 on 2026-09-14)

Not a publication number: the working trees, not npm artifacts. Full table,
gate output and analysis in [candidates/2026-09-11](candidates/2026-09-11/README.md);
the baseline it is measured against in [baselines/2026-09-11](baselines/2026-09-11/README.md).
Same box, harness and flags as the publication run below, plus the new
profiles (`--rate=50000`, `--keepalive=off`, CPU µs/req, bytes/resp).

| Row (2026-09-11 candidate) | no pipelining | pipelined ×10 | CPU µs/req | RSS |
|---|---|---|---|---|
| raw @morojs/engine 1.1.6-candidate | 114,626 | **936,861** | 8.5 | 48 MB |
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
4,310,410 in 249 MB. raw uWebSockets.js on the same VM (measured a day later
in `node:24-trixie`, because uWS 20.69's Linux binary needs glibc 2.38):
258,598 / 1,028,126 / 104,641 / 3.9 µs / 54 MB, so the raw engine is +20%
plain, +47% pipelined and 18% less CPU per request than bare uWS on Linux
at RSS parity. Full table and conditions in
[candidates/2026-09-11/README.md](candidates/2026-09-11/README.md#linux-in-a-dedicated-container-linux).

Connection churn (keep-alive off, one connection per request), the one cell
where the morning candidate trailed Bun on macOS, was a FIN-timing bug fixed
the same day; re-measured, MoroJS-on-engine does **28,306** conn/s on macOS
against raw Bun's 26,854 (raw engine 27,555 vs 25,310 in a three-run
head-to-head) and **126,484** on Linux against 116,988 — details in
[candidates/2026-09-11/README.md](candidates/2026-09-11/README.md#connection-churn-after-the-fin-fix-churn-fix-linux-churn-fix).
Those are wrk numbers, and wrk's keep-alive-off profile penalises servers
that close without echoing `Connection: close` (Bun and uWS do not echo;
one wrk read error per connection). Cross-checked with `oha
--disable-keepalive`, which has no such dependency: on macOS the engine's
lead over raw Bun is +14% (23,868 vs 20,956 conn/s, framework) and +15%
(raw); on the Linux VM the engine rows and Bun are within the box's
pass-to-pass noise (framework 99,945 / 98,757 against Bun's 101,594 /
84,450 over two passes) with less CPU per connection, so the Linux churn
cell is parity until a bare-metal run says otherwise.

**Every generator, both platforms (2026-09-13,
[candidates/2026-09-13/README.md](candidates/2026-09-13/README.md)).** wrk,
oha, bombardier and autocannon were run against MoroJS-on-engine, the raw
engine, raw Bun.serve and raw uWebSockets.js on macOS and, in three
rotated-order rounds, in the Linux container. Two things had to be fixed
first: the engine now performs the RFC 9112 §9.6 lingering close (a client
that writes its next request before it has seen the server's FIN was being
answered with a RST; autocannon does this and ran at a quarter speed with one
error per connection), and the harness's bombardier and autocannon
"keep-alive off" profiles were not measuring connections at all (bombardier's
`-a` is a no-op for its client, and autocannon always sends its own
`Connection: keep-alive`; uWS and Bun ignore the appended `close` and were
serving ~2,800 requests per connection). With that corrected: on macOS the
framework beats Bun in every cell of every generator except RSS (plain
throughput +4% to +16%, CPU per request 10–25% lower, churn +5% to +14%,
autocannon plain +4% over three alternating rounds), and the raw engine ties
or beats bare uWS everywhere. On Linux the framework beats Bun on every plain,
CPU and p99 cell under every generator (up to +54% throughput, 18–41% less
CPU, half the p99 at 20k req/s); churn against Bun is parity within the VM's
±10% spread under oha and 7% behind under bombardier, and uWS leads both
engine rows on connections per second by 3–10% because it lets the client
close first and hold the TIME_WAIT (and, under wrk, ends its connections with
resets), a policy the engine deliberately does not copy. The Linux VM cannot
resolve differences under 10%, which is stated wherever it applies.

What changed between the rows: prepared response templates + V8 fast API
calls + batched pipelined dispatch on the JS boundary, the `Connection:
keep-alive` line dropped from HTTP/1.1 responses (149 → 125 bytes/resp), a
PGO-optimised binary, and worker-thread clustering (the clustered row is one
process). The headline tables below stay at the published 1.1.5 / 1.8.7
numbers until the new versions are on npm and re-verified from there.

## Publication run 2026-08-03 — MoroJS 1.8.7 / engine 1.1.5 (previous)

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
