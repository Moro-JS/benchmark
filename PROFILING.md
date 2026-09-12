# Profiling the servers in this repo

`bench.js` tells you *how much* a server costs per request (the `CPU µs/req`
column). This file is how to find out *where* that cost goes. Every recipe
below attaches to an already-running benchmark server, so start one first:

```bash
NODE_ENV=production LOG_LEVEL=warn PORT=3128 node servers/raw-engine-server.js &
# or any other servers/*.js; MoroJS rows: PORT=3117 node servers/moro-engine-server.js
```

and drive it with the same generator the table used, e.g.
`oha -z 20s -c 100 --no-tui http://127.0.0.1:3128/` (fixed rate: add `-q 50000`;
connection per request: add `--disable-keepalive`).

## Where the time goes: native vs JavaScript

A MoroJS-on-engine request has three layers: the kernel (accept/recv/send,
epoll or io_uring), the native engine (`@morojs/engine`, C++), and JavaScript
(the adapter + the framework + your handler). Sample the whole process first;
split the JS share out afterwards.

### Linux: perf + flamegraph (the reference tool)

```bash
# 1. start the server with V8's perf map so JIT frames get names
NODE_ENV=production PORT=3128 node --perf-basic-prof servers/raw-engine-server.js &
PID=$!

# 2. sample the process tree for 20 s while load runs (999 Hz, call graphs)
perf record -g -F 999 -p "$PID" -- sleep 20

# 3. render
perf report --no-children --sort dso,symbol | head -60          # text
perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg  # FlameGraph scripts
```

Read `dso` first: `[kernel.kallsyms]` is syscall/TCP work, `moro_engine_*.node`
is the engine, `node` is V8/libuv, and `perf-<pid>.map` frames are JIT'd
JavaScript. For a cluster, pass every worker pid (`-p $(pgrep -d, -P $PID),$PID`).

Syscalls per request without a flame graph:

```bash
perf stat -e 'syscalls:sys_enter_*' -p "$PID" -- sleep 20   # then divide by requests
# or, if perf_event_paranoid forbids it:
strace -c -f -p "$PID"                                       # Ctrl-C after the run
```

`bench.js --perf` automates the `perf stat` form and prints counters per request.

### macOS: Instruments / xctrace / sample

No `perf` here and no CPU pinning either (state that in any published number).

```bash
# Time Profiler trace (open in Instruments.app)
xctrace record --template 'Time Profiler' --attach "$PID" --time-limit 20s --output engine.trace

# quick text call stacks, no Xcode UI
sample "$PID" 20 -file sample.txt      # 20 s, then read the heaviest stacks
```

`sample` names symbols in the `.node` addon and in `node`; JIT'd JavaScript
shows as anonymous addresses, so use the JS profile below for that layer.

### The JavaScript share on any OS: `--cpu-prof`

```bash
NODE_ENV=production PORT=3117 node --cpu-prof --cpu-prof-dir=prof servers/moro-engine-server.js
# run load, then stop the server with SIGINT so the profile is written
```

Open `prof/*.cpuprofile` in Chrome DevTools (Performance → Load profile) or
[speedscope](https://www.speedscope.app). The `(program)`/`(garbage collector)`
rows are V8's own time; everything under the engine's `onRequest` callback is
the adapter + framework + handler; native calls (`respond`, `getHeaders`, …)
appear as leaf frames whose self time is the JS→C++ boundary cost.

## Memory

RSS in the table is a single post-load sample. For growth over time:

```bash
# Linux
watch -n1 'grep -E "VmRSS|VmHWM" /proc/'"$PID"'/status'
# macOS
while sleep 1; do ps -o rss= -p "$PID"; done
```

V8 heap vs native: `node --expose-gc --heapsnapshot-signal=SIGUSR2 …` then
`kill -USR2 $PID` writes a `.heapsnapshot` (open in DevTools → Memory). RSS
minus V8 heap total is native memory (engine buffers, TLS, OpenSSL, libuv).

## Reading the numbers honestly

- Loopback on one machine is often **client-bound**: the generator burns more
  CPU than the server. `CPU µs/req` and the fixed-rate p99 survive that; the
  open-loop req/s column does not. `pinned/run.sh` pins server and generator
  to separate cores on Linux.
- Keep the generator identical across the rows you compare; `bench.js` prints
  which one ran for each profile in the table footer.
- Compare the same wire shape: `bytes/resp` in the table catches a server that
  sends fewer header bytes.
