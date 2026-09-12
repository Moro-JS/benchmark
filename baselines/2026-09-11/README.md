# Baseline 2026-09-11 (pre-1.2.0 engine, pre-1.9.0 framework)

The reference run the engine performance program is gated against
(`bench.js --baseline=baselines/2026-09-11/results-2026-09-11T07-59-51.json --gate`).

- Machine: Mac Studio M2 Ultra, macOS (Darwin 25.6), Node v24.11.0, loopback.
- Generators: wrk 4.2.0 (`-t 8 -c 100 -d 40s`, plain / pipelined x10 /
  keep-alive off via a `Connection: close` Lua script), oha for the fixed
  50,000 req/s profile. Best of 3 runs per profile.
- Rows: MoroJS + engine (npm 1.1.5 and the LOCAL working tree), raw engine
  (npm and LOCAL), raw uWebSockets.js, raw Bun.serve and Elysia (Bun 1.3.x),
  MoroJS clustered (npm and LOCAL; process workers).
- "LOCAL" = the engine working tree at e912aac + uncommitted (Connection
  header trim + static routes) linked through `npm run engine:link:local`, and
  the MoroJS working tree at afc4bf9.

Files: `results-*.json` (machine-readable, the gate input), `results-*.md`
(the table), `run.log` (every individual run, with p99 and CPU µs/req).

Observations recorded at capture time:

- bytes/resp 149 -> 125 on the LOCAL engine rows: the `Connection:
  keep-alive` line is gone from HTTP/1.1 keep-alive responses.
- Raw engine plain is client-bound on loopback (~112k req/s at 98% of one
  server core); pipelined x10 shows the boundary cost (838k LOCAL vs 791k npm).
- Keep-alive-off (one connection per request) on macOS loopback: the engine
  and MoroJS rows sit at ~5.5k conn/s with wrk reporting socket errors, while
  Bun and uWS reach ~25k. A Node `net`-based churn client against the same
  engine reaches ~14k conn/s on this machine and ~30k inside a Linux
  container (io_uring), so this looks like a wrk-vs-macOS accept interaction
  rather than an engine ceiling; it is re-measured on Linux in the 1.2.0 run.
- Cluster RSS is the process tree (24 worker processes); thread-mode rows in
  later runs are one process.
