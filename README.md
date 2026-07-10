# MoroJS Performance Benchmarks

**MoroJS adds near-zero framework overhead — and since 1.8.0 it ships its own native C++ engine (`@morojs/engine`) as the default transport, which meets-or-beats uWebSockets.js in both the realistic and pipelined profiles on the same hardware. The node-http and uWS paths remain available (`server.engine: 'node' | 'uws'`); you pay for the transport you choose, not for the framework on top of it.**

Every number in this repo is reproducible with one command, and this README
documents not just the results but the **methodology and the reasoning behind
it** — including the investigations that shaped the tooling, and the honest
limits of what a single-machine benchmark can prove. Benchmarks are only as
credible as their process.

## Quick Start

```bash
npm install

# Run everything (all frameworks + raw baselines), realistic no-pipelining load
npm run bench

# Or a single target (defaults to best-of-3 runs)
npm run bench:uws
npm run bench:single
npm run bench:fastify

# Fast sanity check (10s runs - never publish these)
npm run bench:quick

# Run everything and save a results-<timestamp>.md
npm run bench:save

# Add the pipelining capability microbenchmark (NOT production-representative)
npm run bench:uws -- --pipelined
```

Each run boots the server, waits for readiness, idles briefly, runs the load
generator (a separate native process), samples memory, tears down, cools
down, and prints a paste-ready markdown table. No second terminal, ever.

## Results

### Engine era (MoroJS 1.8.0 / @morojs/engine 1.1.x) — publication run

Verified 2026-07-10 against the **published npm packages** at the publication
bar: `wrk -c 100 -d 40`, best-of-3 per target, both profiles, idle machine,
Node v24.11.0, Apple M2 Ultra. Full table:
[results-2026-07-10T08-55-20.md](results-2026-07-10T08-55-20.md)
· analysis: [VERIFIED_RESULTS.md](VERIFIED_RESULTS.md).

| Server | no pipelining | pipelined ×10 (microbench) |
|--------|---------------|----------------------------|
| **MoroJS + @morojs/engine** _(default, npm)_ | **102,409** | **572,053** |
| MoroJS + uWebSockets.js (npm) | 101,237 | 520,799 |
| MoroJS (single thread, node engine, npm) | 68,163 | 119,570 |

**Beats MoroJS-on-uWS in both profiles** — realistic by a hair (the lead
trades inside ±2% across sessions) and **pipelined every round** (+9.8% in
the publication run). Bare-vs-bare, best-of-3 on an idle machine: **raw engine
106,008 req/s · raw uWebSockets.js 105,635** (see
[VERIFIED_RESULTS.md](VERIFIED_RESULTS.md)).

---

## Methodology

### Load profile: no pipelining by default

The default and only headline profile is **no pipelining** — one
request-response per round trip on each connection. This is what real clients
do: browsers disabled HTTP/1.1 pipelining years ago, HTTP/2 replaced the need
for it with true multiplexing, and `fetch`, HTTP client libraries, load
balancers, and reverse proxies don't pipeline. If you want a benchmark to
predict production behavior, this is the profile.

**Its honest limitation on one machine:** without pipelining, a single host
over loopback usually can't generate enough concurrent load to saturate a
fast server, so you end up measuring the client + loopback rather than the
server. That's why everything fast converges to ~90–105k req/s on this
laptop. The convergence is the truth at this scale — it says "these servers
all add negligible overhead over the transport," not "server X can only do
90k." Distinguishing fast servers requires a **dedicated load machine and
multi-core server hardware**, which this suite is designed to support (just
point it at real hosts) but which a laptop can't stand in for.

### Pipelining: an opt-in microbenchmark, not a real-world number

`--pipelined` adds a second, clearly-labeled column at pipelining depth 10.
**This is not production-representative** — it exists to remove client
round-trip time and isolate raw server-side request-processing cost. Treat it
as a diagnostic, never a headline.

It does surface a real architectural fact worth knowing:

| Server | no pipelining | pipelined ×10 (microbench) |
|--------|---------------|----------------------------|
| MoroJS + @morojs/engine (1.1.x) | 102,409 | 572,053 |
| MoroJS + uWebSockets.js | 101,237 | 520,799 |
| raw Bun.serve | 107,119 | 21,686 |

(wrk, 100 conns, publication run, same machine and session.) uWebSockets.js
batches pipelined responses (cork → process batch → single write) and gains
~5x; @morojs/engine implements the same corking on its Moro-shaped boundary
and edges past uWS; Bun's HTTP
server processes pipelined requests with head-of-line behavior and **drops
~5x** — a framework-independent runtime trait, verified against raw
`Bun.serve` with two independent generators, and matching independent results
(HttpArena ranks Bun **#1 in mixed workloads and #41 in pipelining**). It's a
genuine difference in how the runtimes handle a load shape that production
traffic doesn't actually produce — interesting for internal service-to-service
APIs that *do* pipeline aggressively, irrelevant for typical web traffic. We
keep it available and labeled so the claim is auditable, not so it can be
quoted as a real-world throughput figure.

### The generator matters

The runner auto-selects the strongest installed load generator:

**wrk** (C) → **oha** (Rust) → **bombardier** (Go) → **autocannon** (Node, always available as the fallback since it ships with this repo)

```bash
brew install wrk oha bombardier   # get the native generators
node bench.js uws --generator=autocannon   # or force one
```

**Why this order, with receipts.** A load generator that is slower than the
server measures itself, not the server. autocannon is a Node process; against
C++-backed servers it becomes the bottleneck — the same MoroJS + uWS server,
same machine, same 10 seconds:

| Generator | Profile | Measured req/sec |
|-----------|---------|------------------|
| **wrk** | pipelined ×10 | **508,097** |
| autocannon | pipelined ×10 | 197,274 |
| wrk / oha / bombardier | no pipelining | 87,000–90,000 (agree within 3%) |

autocannon under-reported the pipelined ceiling by **2.5x**. The three native
generators agreeing within 3% at the no-pipelining profile is the
cross-validation that the parsers and method are sound. oha and bombardier
don't support pipelining, so they're only eligible for no-pipelining
profiles (the runner skips or warns accordingly; wrk pipelines via a
generated Lua script). The table footer always states which generator and
profile produced the numbers — **never compare rows measured with different
generators.**

### Runner design decisions (and the bugs that motivated them)

Each of these came from an observed measurement artifact, not theory:

1. **The generator runs as a separate spawned CLI process, never in-process.**
   The first version used autocannon's programmatic API — which runs the load
   generator inside the runner's own Node process, sharing its event loop,
   heap, and GC debt from setup work. That systematically under-reported
   throughput versus running the same tool by hand in a terminal.
2. **No warmup pass by default.** A load warmup before measuring leaves the
   server holding warmup GC debt and ~1,000 TIME_WAIT sockets when the
   measured run begins; the reference methodology (a careful manual run,
   Fastify's official benchmarks) doesn't warm up either. JIT warms in the
   first seconds of a 40s run anyway. `--warmup[=secs]` opts in, followed by
   a drain pause.
3. **An idle settle after boot (`--settle`, default 3s)** replicates the
   natural pause of the two-terminal manual workflow — boot logging flushes,
   clustering finishes forking, GC settles.
4. **Best-of-3 by default when targeting 1–2 servers.** Identical
   back-to-back runs swing ±5% on laptop hardware (measured spread on six
   consecutive identical runs: 180k–202k req/s). Best-of-N reports the run
   with the least background interference — the standard way to publish, and
   the number you'd anchor on after a few manual attempts anyway. Every
   individual run is printed so the variance stays visible. Full sweeps
   default to 1 run for total-time sanity; `--runs=N` overrides.
5. **One server at a time, cooldown between targets** (default 8s) to reduce
   thermal carryover — laptop thermals can move results ±5% between the
   first and last target of a long sweep.
6. **The readiness probe sends `connection: close`** so no idle keep-alive
   socket stays parked on the server during measurement.
7. **Spawn mode was tested, not assumed:** detached vs terminal-attached
   server processes were A/B'd (3 alternating rounds) — no measurable
   difference, so the runner keeps `detached` for reliable process-group
   teardown of cluster workers.
8. **Interrupt-safe teardown + port guard.** Detached children don't receive
   a terminal's Ctrl-C, so the runner traps SIGINT/SIGTERM/exit and kills
   every server it spawned. Before each target it also refuses to run if the
   port is already occupied — an orphaned or foreign server there would be
   silently benchmarked instead of a fresh one (this exact failure produced a
   bogus 11k req/s reading during development: the guard exists because of
   it).

### Fairness guarantees

- Every server file forces `NODE_ENV=production` **in-script**, so results
  can't depend on how the server is launched.
- The MoroJS servers print a **sanity block** at boot showing the resolved
  per-request feature flags (request logging, tracking, compression, CORS,
  helmet) — every published run documents exactly what was active. (MoroJS
  production defaults are benchmark-clean by design: empty middleware chain,
  lazy request IDs, no per-request logging — the benchmark servers barely
  need configuration because there's nothing to turn off.)
- Comparison servers are the **canonical minimal hello-world for each
  framework** — same `{"hello":"world"}` response shape, same profile, no
  strawmen. Elysia gets two rows so it's never misrepresented: the official
  `@elysiajs/node` adapter (apples-to-apples with the Node rows) and native
  Bun (its home runtime).
- Raw-transport baselines (`node:http`, uWebSockets.js, `Bun.serve`) are
  always included so framework overhead is separable from transport choice.
- The table footer stamps generator, profile, run count, Node version, and
  platform on every table the runner produces.

### Memory

The RSS column is the server **process tree sampled immediately after load**
— not idle memory. The clustered row sums all worker processes. Don't compare
these values against idle-RSS figures from other sources.

### For publishable numbers

Close other apps, run on mains power, use a cool machine, keep the 40s
default duration, and prefer individual targets (`node bench.js uws`) or
`npm run bench:save` for the full sweep. Always publish the footer line —
generator + profile + platform — alongside any table.

---

## What's in this repo

| File | Purpose |
|------|---------|
| `bench.js` | The runner: boot → settle → measure (no-pipelining) → teardown → table |
| `servers/moro-single-server.js` | MoroJS, standard stack, single thread (port 3110) |
| `servers/moro-cluster-server.js` | MoroJS, built-in clustering (port 3111) |
| `servers/moro-uws-server.js` | MoroJS over uWebSockets.js (port 3112) |
| `servers/raw-node-server.js` | Raw `node:http` baseline (port 3120) |
| `servers/raw-uws-server.js` | Raw uWebSockets.js baseline (port 3121) |
| `servers/fastify-server.js` | Fastify comparison (port 3122) |
| `servers/express-server.js` | Express comparison (port 3123) |
| `servers/koa-server.js` | Koa comparison (port 3124) |
| `servers/elysia-node-server.js` | Elysia via official Node adapter (port 3125) |
| `servers/elysia-bun-server.js` | Elysia native on Bun (port 3126, needs Bun) |
| `servers/raw-bun-server.js` | Raw `Bun.serve` baseline (port 3127, needs Bun) |

Bun-runtime targets are skipped with a clear message when Bun isn't
installed. Servers can still be run standalone (`npm run server:uws`) for
manual two-terminal testing.

### Runner flags

```
--quick             10s runs, short cooldowns (sanity checks only)
--runs=N            repeat count per profile (default: 3 for 1-2 targets, else 1)
--duration=40       seconds per measured run
--connections=100   concurrent connections (raise for a real load rig)
--pipelined         ALSO run the pipelined x10 microbenchmark (not real-world)
--pipelining=N      single run at depth N (N=1 realistic; N>1 microbench)
--generator=X       wrk | oha | bombardier | autocannon
--settle=3          idle seconds between server boot and first measurement
--warmup[=5]        opt-in warmup pass before measuring
--cooldown=8        seconds between targets
--save              write results-<timestamp>.md
```

Default (no flag): the realistic **no-pipelining** profile only.

---

## Why MoroJS

- **Fast by default**: production defaults have an empty middleware chain,
  lazy request IDs, no per-request logging — nothing to turn off.
- **The uWS escape hatch**: when you need more than the `node:http` ceiling,
  one config flag moves the same app onto uWebSockets.js — raw-transport
  throughput with the full framework attached.
- **Built-in clustering**: multi-core scaling on the standard stack with zero
  configuration.
- **TypeScript-first, Zod-native validation, intelligent middleware** — the
  performance comes with the full framework, not a stripped-down core.

---

**Ready to verify?** `npm install && npm run bench` — every number in this
README regenerates from your own machine, and the methodology above explains
exactly what you're looking at.
