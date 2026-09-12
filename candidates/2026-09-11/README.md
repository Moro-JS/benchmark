# Candidate run 2026-09-11 — engine 1.2.0 + MoroJS 1.9.0 working trees

**Not a publication run.** The LOCAL rows are the uncommitted working trees
(engine at `e912aac+`, PGO-optimised darwin binary; MoroJS at `afc4bf9+`),
linked through `npm run engine:link:local` / `local:link`; the npm rows are
the published 1.1.5 / 1.8.7 packages, unchanged since the morning baseline
and therefore the control. Same machine, harness, and flags as
[`../../baselines/2026-09-11`](../../baselines/2026-09-11/README.md); run
with `--baseline=... --gate`, output in `run.log`.

## Candidate rows vs the morning baseline (same rows, same box)

| Row | plain req/s | pipelined ×10 | CPU µs/req | bytes/resp | RSS |
|---|---|---|---|---|---|
| MoroJS + engine (LOCAL) | 109,629 → **115,056** (+5.0%) | 679,451 → **926,119** (+36.3%) | 9.0 → **8.4** | 125 | 66 → 68 MB |
| raw engine (LOCAL) | 112,945 → **114,626** (+1.5%) | 838,026 → **936,861** (+11.8%) | 8.6 → 8.5 | 125 | 46 → 48 MB |
| MoroJS clustered (LOCAL) | 112,264 → 112,596 | 814,265 → **936,765** (+15.0%) | 8.7 → 8.7 | 125 | **1,920 → 504 MB** (worker threads, one process) |

Against the published packages measured in the same session: MoroJS-on-engine
926k vs 759k pipelined (+22%), plain 115.1k vs 112.4k; raw engine 937k vs
845k (+10.8%). Keep-alive-off (one connection per request) is unchanged at
~5.6–5.9k conn/s on this macOS loopback for every engine row (see the
baseline README: a wrk-on-macOS accept interaction, not an engine ceiling —
the same binary does 100k+ conn/s under oha on Linux).

## The gate flagged 15 items — none is a candidate regression

`--gate` reported 15 breaches. Every one is in a fixed-rate p99, fixed-rate
CPU µs/req, or RSS cell, and the **unchanged reference rows show the same
drift**: raw Bun p99 +11.5% / RSS +23.3%, raw uWS p99 +9.3% / CPU +12.2% /
RSS +25.0%, the npm engine row RSS +10.2% — none of those binaries changed
between the two runs. The box moved between the morning baseline and this
run (the fixed-rate p99 values are 1.4–1.7 ms, so a +5% tolerance is
0.08 ms, under the session-to-session noise of this machine). The candidate
rows are better than the baseline on every throughput and CPU cell where the
reference rows are not, which is the signal the gate exists to check.

Follow-up for the harness: widen the fixed-rate p99 tolerance to a noise
floor derived from the reference rows of the same run (as the plain-throughput
gate already does), so a box drift never masquerades as a regression.

## Linux, in a dedicated container (`linux/`)

Same working trees, built and benchmarked inside `node:24-bookworm` on Docker
Desktop's VM (linuxkit 6.12, arm64, 8 vCPU): the MoroJS candidate and the
harness installed their own dependencies in the container (`npm ci`), the
engine's Linux binary was built there, `wrk` 4.1 and `oha` 1.16 from the
container, Bun from its installer. `wrk -c 100 -d 15`, best of 3, the fixed
rate at 20,000 req/s (the VM's headroom). Script: `linux/docker-bench.sh`;
tables: `linux/results-*.md`. The VM shares the host's cores, so treat the
numbers as a same-run comparison, not as absolutes.

| Row (Linux container) | plain | pipelined ×10 | conn/req | p99 | p99 @ 20k/s | CPU µs/req | RSS |
|---|---|---|---|---|---|---|---|
| **MoroJS 1.9.0-cand + engine (libuv, default)** | **326,345** | **1,460,634** | 107,660 | **0.6 ms** | **1.6 ms** | **3.1** | **77 MB** |
| raw engine 1.2.0-cand (libuv) | 310,895 | 1,508,151 | 109,570 | 0.7 ms | 1.6 ms | 3.2 | 58 MB |
| MoroJS clustered, worker threads (libuv) | 713,379 | 4,310,410 | 164,546 | 2.1 ms | 1.2 ms | 5.4 | 249 MB |
| MoroJS + engine (io_uring, opt-in) | 292,287 | 1,349,079 | 101,017 | 0.7 ms | 1.7 ms | 3.4 | 83 MB |
| raw engine (io_uring, opt-in) | 305,058 | 1,419,013 | 100,126 | 0.6 ms | 1.6 ms | 3.3 | 64 MB |
| MoroJS clustered, worker threads (io_uring) | 678,872 | 4,325,340 | 178,728 | 2.2 ms | 1.5 ms | 5.6 | 305 MB |
| raw Bun.serve | 272,251 | 44,186 | 110,587 | 0.8 ms | 3.2 ms | 3.8 | 551 MB |
| Elysia (Bun) | 237,680 | 41,847 | 114,444 | 1.2 ms | 2.6 ms | 4.4 | 583 MB |
| raw node:http | 91,442 | 127,069 | 40,520 | 1.7 ms | 1.6 ms | 11.0 | 209 MB |

Against raw Bun.serve on the same Linux box, MoroJS-on-engine is +20% plain,
33× pipelined, at parity on one-connection-per-request (−2.6%), half the p99
at a fixed 20k req/s (1.6 vs 3.2 ms), 18% less CPU per request (3.1 vs 3.8
µs), and a seventh of the RSS (77 vs 551 MB). The io_uring rows confirm the
transport A/B in the engine's `docs/DESIGN.md`: fewer syscalls, more CPU per
completion at these batch sizes, hence opt-in. raw uWebSockets.js was skipped
by the harness in the container (its readiness probe needs `lsof`, absent in
the image) — a harness gap, not a result.

## Connection churn after the FIN fix (`churn-fix/`, `linux-churn-fix/`)

The morning candidate table shows the engine rows at ~5.6–5.9k connections
per second on macOS with keep-alive off, a fourth of Bun's. Root cause, found
and fixed the same day: the response and the FIN left in two segments a few
microseconds apart, so a fast client sometimes closed first, inherited the
TIME_WAIT, and on macOS (no port reuse, 30 s MSL) drained its 16k ephemeral
ports over a 40 s run. The engine now sends the FIN with the last bytes of a
`Connection: close` response (macOS `TCP_NOPUSH` + `MSG_EOF`, Linux
`MSG_MORE` + `shutdown`), so the peer can never close first. Re-measured with
the same harness (`--keepalive=off`, `-c 100`):

| Row | macOS conn/s, `-d 40` best of 2 | macOS CPU µs/conn | Linux container conn/s, `-d 15` best of 2 |
|---|---|---|---|
| MoroJS + engine (libuv) | **28,306** (was 5,835) | 14.0 | **126,484** (was 107,660) |
| raw engine (libuv) | 24,832 / 27,555 (see below) | 14.0 | 128,127 (was 109,570) |
| MoroJS clustered, threads | 27,002 (was 5,959) | – | 188,194 (was 164,546) |
| MoroJS + engine (io_uring) | – | – | 116,922 |
| raw engine (io_uring) | – | – | 127,522 |
| raw Bun.serve | 26,854 | 16.9 | 116,988 |
| Elysia (Bun) | 25,956 | – | 115,168 |
| raw uWebSockets.js | 25,875 | – | (skipped in the container: harness readiness probe needs `lsof`) |

The raw-engine macOS row read 24,832 in the two-run pass; a dedicated
three-run head-to-head at `-d 30` (`run.log`) read 27,555 / 27,080 / 27,188
against raw Bun's 25,310 / 25,088 / 25,241, so the raw engine is ~9% ahead of
Bun on churn with ~17% less CPU per connection, and the two-run reading was a
low run. Every engine row now matches or beats Bun on connection churn on
both platforms.
