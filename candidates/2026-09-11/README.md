# Candidate run 2026-09-11 — engine 1.1.6 + MoroJS 1.9.0 working trees

> Superseded in part by [`../2026-09-13/`](../2026-09-13/README.md): the
> churn comparisons below were made before the lingering-close change and
> before the bombardier/autocannon keep-alive-off findings; the cross-
> generator tables there are the current reference for connection churn.

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

Fixed in the harness the same day (`bench.js`, methodology item 9 in the
repo README): rows whose bits are identical in both runs are the yardstick,
never gated; per metric and profile the gate takes their median drift and a
robust spread (1.4826 × MAD) and widens the candidate tolerances by the
unfavourable part of the median plus the spread. Re-judging this exact run
with `--replay`:

```
node bench.js --replay=candidates/2026-09-11/results-2026-09-11T18-17-54.json \
  --baseline=baselines/2026-09-11/results-2026-09-11T07-59-51.json --gate
```

prints the reference drift (fixed-rate p99 +6.1% ±6.0%, fixed-rate CPU
−5.3% ±14.2%, RSS +5.1% ±8.8% over 6 reference rows) and `GATE PASSED`. The
widest candidate movements in the unfavourable direction are the raw engine's
fixed-rate CPU (+6.7%, inside a ±14% reference spread) and MoroJS-on-engine's
fixed-rate p99 (+5.0%, with the references at +6.1%); every candidate
throughput, plain-profile CPU, and churn cell is ahead of its baseline.

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
| raw engine 1.1.6-cand (libuv) | 310,895 | 1,508,151 | 109,570 | 0.7 ms | 1.6 ms | 3.2 | 58 MB |
| MoroJS clustered, worker threads (libuv) | 713,379 | 4,310,410 | 164,546 | 2.1 ms | 1.2 ms | 5.4 | 249 MB |
| MoroJS + engine (io_uring, opt-in) | 292,287 | 1,349,079 | 101,017 | 0.7 ms | 1.7 ms | 3.4 | 83 MB |
| raw engine (io_uring, opt-in) | 305,058 | 1,419,013 | 100,126 | 0.6 ms | 1.6 ms | 3.3 | 64 MB |
| MoroJS clustered, worker threads (io_uring) | 678,872 | 4,325,340 | 178,728 | 2.2 ms | 1.5 ms | 5.6 | 305 MB |
| raw Bun.serve | 272,251 | 44,186 | 110,587 | 0.8 ms | 3.2 ms | 3.8 | 551 MB |
| Elysia (Bun) | 237,680 | 41,847 | 114,444 | 1.2 ms | 2.6 ms | 4.4 | 583 MB |
| raw node:http | 91,442 | 127,069 | 40,520 | 1.7 ms | 1.6 ms | 11.0 | 209 MB |
| raw uWebSockets.js 20.69 (`node:24-trixie`, next day, see below) | 258,598 | 1,028,126 | 104,641 † | 2.0 ms | 2.2 ms | 3.9 | 54 MB |

Against raw Bun.serve on the same Linux box, MoroJS-on-engine is +20% plain,
33× pipelined, at parity on one-connection-per-request (−2.6%), half the p99
at a fixed 20k req/s (1.6 vs 3.2 ms), 18% less CPU per request (3.1 vs 3.8
µs), and a seventh of the RSS (77 vs 551 MB). The io_uring rows confirm the
transport A/B in the engine's `docs/DESIGN.md`: fewer syscalls, more CPU per
completion at these batch sizes, hence opt-in.

raw uWebSockets.js was skipped in the `node:24-bookworm` pass. The harness
now prints a failed server's stderr, and the cause is uWS's own floor, not
the harness: its `uws_linux_arm64_137.node` needs `GLIBC_2.38` and bookworm
(Debian 12) ships 2.36 (`@morojs/engine`'s floor is 2.35, so the engine
loads where uWS does not). The row above was measured on 2026-09-12 in
`node:24-trixie` (glibc 2.41) on the same VM and kernel with the same flags
(`linux/docker-bench-uws.sh`, `linux/uws-trixie.log`,
`linux/results-2026-09-12T16-47-48.*`). Against it, the raw engine is +20%
plain, +47% pipelined, +5% conn/s in this table and +22% after the FIN fix
below (128,127), 18% less CPU per request, within 4 MB of its RSS (58 vs 54),
and the full framework on the engine is ahead of bare uWS on every cell but
RSS. † One wrk read error per connection, the same artifact the Bun rows
show; see the churn section for what it is and the oha cross-check.

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
| raw uWebSockets.js | 25,875 | – | 104,641 † (`node:24-trixie`, 2026-09-12, best of 3) |

The raw-engine macOS row read 24,832 in the two-run pass; a dedicated
three-run head-to-head at `-d 30` (`run.log`) read 27,555 / 27,080 / 27,188
against raw Bun's 25,310 / 25,088 / 25,241, so the raw engine is ~9% ahead of
Bun on churn with ~17% less CPU per connection, and the two-run reading was a
low run.

† **What the wrk numbers for Bun and uWS include.** wrk's keep-alive-off
profile sends `Connection: close` and relies on the server echoing it.
Bun.serve and uWebSockets.js answer without the header and then close
(verified with a raw socket: response header absent, then FIN; the engine
and node:http echo `close`). wrk therefore treats those connections as
keep-alive, writes a second request into the closed socket, records one
read error per connection (the `WARNING: 1.6–1.7M errors` lines in
`run.log`) and reconnects. Every counted request still got a complete 2xx,
but the Bun and uWS rows pay a client-side penalty the engine rows do not,
so a wrk-only churn comparison is not apples to apples. The harness README
now documents this; the artifact-free generator is `oha
--disable-keepalive`, which closes after every response whatever the server
says (and is what the-benchmarker uses).

### Cross-check with oha (`--generator=oha --keepalive=off`, `-c 100 -d 15`)

macOS, best of 3 (`churn-fix/results-2026-09-12T17-00-12.*`,
`churn-fix/churn-oha-mac.log`):

| Row (macOS, oha) | conn/s | p99 | CPU µs/conn |
|---|---|---|---|
| **MoroJS + engine (libuv)** | **23,868** | 6.1 ms | 16.1 |
| raw engine (libuv) | **24,173** | 6.6 ms | 16.1 |
| raw Bun.serve | 20,956 | 8.8 ms | 17.0 |
| Elysia (Bun) | 20,407 | 6.6 ms | 21.0 |
| raw uWebSockets.js | 21,526 | 6.9 ms | 17.7 |

oha is a heavier client than wrk, so every row is lower than in the wrk
table, and the engine's lead over Bun widens under it: +14% (framework) and
+15% (raw), with lower p99 and less CPU per connection.

Linux container (`node:24-trixie`, same VM), two passes: three runs
(`linux-churn-fix/results-2026-09-12T17-12-36.*`, `churn-oha.log`) and a
five-run head-to-head (`results-2026-09-12T17-27-31.*`, `churn-oha-5.log`;
scripts `docker-bench-churn-oha*.sh`):

| Row (Linux, oha) | conn/s best of 3 (pass 1) | conn/s best of 5 (pass 2) | pass-2 runs | CPU µs/conn |
|---|---|---|---|---|
| **MoroJS + engine (libuv)** | 99,945 | 98,757 | 98.8 / 98.7 / 97.1 / 89.8 / 95.1k | 10.1 |
| raw engine (libuv) | 89,548 | **109,214** | 98.4 / 109.2 / 105.0 / 103.0 / 105.1k | 9.1 |
| MoroJS clustered, threads | 193,525 | – | – | 13.9 |
| raw Bun.serve | 101,594 | 84,450 | 83.9 / 83.4 / 84.5 / 83.8 / 83.5k | 12.1 |
| Elysia (Bun) | 88,064 | – | – | 11.6 |
| raw uWebSockets.js | 100,642 | 102,460 | 100.0 / 102.5 / 99.8 / 100.6 / 98.7k | 9.7 |

Read the two passes together: the VM moves a whole row by 10–20% between
passes (raw Bun 101.6k then 84.5k with five flat runs; raw engine 89.5k then
109.2k), so on this box the single-process engine rows and Bun are within
the VM's pass-to-pass noise on Linux churn under oha (framework 99.9k /
98.8k against Bun's 101.6k / 84.5k), with the engine rows using less CPU per
connection in both passes (10.1 / 9.1 vs 10.0 / 12.1 µs) and the thread
cluster at roughly double any single-process row. The wrk table's +8% for
the framework on Linux includes Bun's wrk penalty and should not be quoted
as the Linux churn lead; the macOS lead holds under both generators. A
bare-metal Linux run is the only way to turn this cell into a ranking.

Same passes, plain profile under oha (keep-alive, `-c 100`): CPU per
request MoroJS + engine 4.5 µs, raw engine 4.8, raw uWS 4.3, raw Bun 5.9
(pass 2, best run) — the engine at parity with uWS and ~25% under Bun with
this client shape too. The framework row is cheaper than the raw-engine row
here because the benchmark's raw server still answers with the per-call
`respond(reqId, status, headers, body)` while MoroJS uses prepared response
templates; switching the raw server to `respondPrepared` would restate what
"raw engine" means, so it is left for a deliberate decision.
