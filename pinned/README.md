# Pinned-core profile (Linux)

Community-requested methodology (Aug 2026): a fair single-thread comparison
should give the server **one dedicated core it fully saturates**, with the
load generator on different cores, so client and server never compete for
the same cycles. This profile goes one step stricter: **each server gets
its own dedicated core** (engine `taskset -c 0`, uWS `taskset -c 1`, wrk
pinned to cores 2+), both stay up for the whole session, and every run
index benchmarks the two back to back in **alternating (ABBA) order** so
host drift — thermals, background load, VM scheduling — cancels instead of
accruing to whichever server happens to run later. Receipts print inline:
package versions, each server's actual affinity mask, and mid-run core
saturation measured from `/proc/<pid>/stat`.

```bash
npm run bench:pinned
```

On Linux it runs natively (needs `wrk` and a repo-root `npm install`).
Anywhere else it re-runs itself inside a Linux container via Docker and
installs both packages **fresh from their registries** `@morojs/engine`
from npm, `uWebSockets.js` from the uNetworking GitHub tags so the result
describes what is published, not a local build. `DURATION`, `RUNS`, and
`DEPTH` env vars override the defaults (10s, best-of-3, pipeline ×10).

## Results (2026-10-10)

Same VM and harness (ABBA-interleaved, best of 3×10s, wrk `-t6 -c100`),
node v24.19.0, both packages installed fresh: `@morojs/engine@1.1.12`,
`uWebSockets.js@20.71.0`. One session, on a host doing other work (the
absolute numbers are a third above the August sessions and should not be
compared with them); both servers at 100% of their core mid-run:

| Profile | run | raw @morojs/engine | raw uWebSockets.js |
|---|---|---|---|
| plain (no pipelining) | 1 | 298,594 | 213,594 |
| plain (no pipelining) | 2 | 279,738 | 222,087 |
| plain (no pipelining) | 3 | 249,990 | 193,228 |
| pipelined ×10 | 1 | 1,590,435 | 883,760 |
| pipelined ×10 | 2 | 1,523,958 | 849,016 |
| pipelined ×10 | 3 | 1,660,044 | 859,468 |

Best of 3: plain **engine +34.4%** (298,594 vs 222,087), pipelined
**engine +87.8%** (1,660,044 vs 883,760). Unlike August, the plain profile
no longer flips: the engine's slowest plain run (249,990) beat uWS's
fastest (222,087), and the pipelined ratio roughly doubled. What changed
on the engine side between 1.1.5 and 1.1.12 is the Linux transport: its
own socket path on libuv's epoll instead of libuv streams (1.1.10),
engine-answered routes framed from a prepared head (1.1.10), one
`epoll_wait` per loop turn (1.1.11) and each turn's sockets served grouped
by the peer's CPU (1.1.12). One run on one session; the August caveats
about VM absolutes still apply, and a second quiet session is the next
thing to add here. `uWebSockets.js` 20.71.0's ESM wrapper imports a file
the package no longer ships, so `servers/raw-uws-server.js` now loads it
through CommonJS (same binary).

## Results (2026-08-05)

Docker Linux VM (arm64, 8 vCPU, glibc 2.41) on the Apple M2 Ultra host,
node v24.19.0, `@morojs/engine@1.1.5` (npm), `uWebSockets.js@20.69.0`;
wrk `-t6 -c100`. Five independent sessions, each best of 3×10s — all
reported, because they disagree on one profile and that disagreement is
the finding. Sessions 1–4 ran an earlier sequential harness (one server
at a time on core 0, engine always benched first); session 5 ran the
current ABBA-interleaved harness described above:

| Profile | session | raw @morojs/engine | raw uWebSockets.js | delta |
|---|---|---|---|---|
| plain (no pipelining) | 1 | 248,461 | 228,067 | engine +8.9% |
| plain (no pipelining) | 2 | 169,826 | 174,910 | uws +2.9% |
| plain (no pipelining) | 3 | 179,233 | 190,281 | uws +5.8% |
| plain (no pipelining) | 4 | 215,883 | 206,315 | engine +4.6% |
| plain (no pipelining) | 5 (ABBA) | 179,642 | 174,511 | engine +2.9% |
| pipelined ×10 | 1 | 1,102,610 | 970,765 | **engine +13.6%** |
| pipelined ×10 | 2 | 989,401 | 845,132 | **engine +17.1%** |
| pipelined ×10 | 3 | 1,014,691 | 888,717 | **engine +14.2%** |
| pipelined ×10 | 4 | 1,149,136 | 966,024 | **engine +19.0%** |
| pipelined ×10 | 5 (ABBA) | 1,006,660 | 873,281 | **engine +15.3%** |

Session 4 ran on a deliberately quieted host and shows the tightest
within-session spread (~1–4%); the others ran on a machine doing other
work. Read it straight: the **plain profile's winner flips between
sessions** (+8.9%, −2.9%, −5.8%, +4.6%, +2.9%) — and within the ABBA
session the per-run winner flips too — while absolute throughput swung
~30% between sessions, so on pinned single-core plain throughput the
honest call is **parity within noise**, matching the bare-metal macOS
numbers where the two are also effectively tied. One asymmetry runs the
engine's way: the responses were not equal-sized in these sessions (engine
1.1.5: 149 bytes — it sent `Connection: keep-alive`; uWS 142 bytes, sending
a `uWebSockets: 20` header instead), so at equal rps the engine was moving
~5% more bytes per second through the same syscalls. Engine 1.1.6 stops
sending that header on HTTP/1.1 keep-alive responses (the version default,
RFC 9112 §9.3; HTTP/1.0 and `Connection: close` paths unchanged), which makes
its response 24 bytes *smaller* than uWS's — re-measure before quoting this
asymmetry again. The **pipelined ordering is outside the
noise**: the engine won all fifteen runs across the five sessions, and its
slowest run beat uWS's fastest in every session. Treat VM numbers as
ordering evidence at best, never absolute
throughput — a virtualized 10s run is not the publication bar the main
README's numbers meet (40s, bare metal, best-of-3).

## Notes and honest limits

- **Both servers are single-threaded on the event loop** — the engine
  spawns no native threads — so pinning removes scheduler migration noise;
  there is no hidden parallelism on either side for it to unmask.
- The main README's macOS numbers cannot be affinity-pinned at all: macOS
  has no public CPU-affinity API (no `taskset` equivalent). Saturation was
  verified there instead (~90–97% of one core for both servers, with wrk
  using under 2 of 24 cores).
- Tested on **arm64** Linux (native Apple-silicon VM). x86_64 results may
  differ and can't be honestly produced here (emulation distorts
  benchmarks); on an x86_64 Linux box the same `npm run bench:pinned`
  reproduces the profile natively.
- Not wired into CI on purpose: shared runners are noisy multi-tenant VMs;
  publishing throughput ordering from them would be exactly the kind of
  methodology this repo exists to avoid.
- Incidental compatibility note from setting this up: uWS's published
  Linux binaries require glibc ≥ 2.38 (they fail to load on Debian 12
  "bookworm"); the engine's npm binaries load on glibc 2.36.
