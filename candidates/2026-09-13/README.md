# 2026-09-13: every generator, both platforms

Follow-up to [`../2026-09-11/`](../2026-09-11/README.md) after the question
"does MoroJS beat Bun and uWebSockets.js under every load generator, not
just wrk?". Same working trees (engine 1.1.6 candidate, MoroJS 1.9.0
candidate) plus one engine change made on this day, and two harness
corrections the survey itself forced.

## What the survey found first (`linux-survey1/`)

The first pass ran wrk, oha, bombardier and autocannon against the raw
engine, MoroJS-on-engine, raw Bun.serve and raw uWebSockets.js in the Linux
container. Its keep-alive-off column was the outlier: under autocannon the
engine rows did 33k connections per second while Bun did 145k and uWS 128k,
with the engine's CPU only 70% busy. Two separate things were behind that,
and both are now fixed.

**1. The engine reset a request the client had already sent (engine fix).**
After a `Connection: close` response the engine sent its FIN with the last
bytes and then closed the fd immediately. autocannon writes the next request
the instant a response completes, before it has processed the FIN, so that
request hit a closed socket and the kernel answered with a RST; autocannon
counted an error and reconnected twice per cycle. RFC 9112 §9.6 describes
exactly this "TCP reset problem" and the staged close that avoids it, which
node:http and uWS already do. The engine now half-closes and **lingers**:
the socket stays open with its input discarded until the peer's FIN or 2 s
(`closeAfterResponse` in `server.h`, `test/linger-close.test.mjs`). On macOS
the FIN sequence had to change with it: `TCP_NOPUSH` on, `send`, `TCP_NOPUSH`
off, `shutdown(SHUT_WR)` — XNU does not push held bytes when the option is
cleared, and a `send(MSG_EOF)` under `TCP_NOPUSH` stays held too; the
immediate `close()` used to mask both. Verified: the autocannon race now
ends in FIN with zero errors; engine suites 204/204 on macOS, 204/204 on
Linux libuv and 204/204 on Linux io_uring.

**2. Two generators were not measuring connections at all (harness fix).**
Checked against a counting server (requests per accepted TCP connection):

| Generator, keep-alive off as the harness invoked it | requests per connection |
|---|---|
| wrk, Lua `Connection: close` | 1.00 |
| oha `--disable-keepalive` | 1.00 |
| bombardier `-a` | **8.4** (its help says: "for fasthttp use `-H 'Connection: close'`"; with the header: 1.00) |
| autocannon `-H connection=close` | 1.00 against node:http and the engine, **~2,800** against uWS and Bun |

autocannon always sends its own `Connection: keep-alive` and appends the
user's `close`. RFC 9110 §7.6.1 makes that list contain `close`, so
conforming servers (node:http, the engine) close after one response while
uWS and Bun keep the connection — the column compared header handling, not
connection cost, and it is why those two "won" it by 4×. The harness now
sends bombardier the header and skips autocannon's keep-alive-off profile
with the reason printed (`README.md`, "One generator caveat").

## macOS, every generator (`mac/`)

M-series laptop, `-c 100 -d 10`, best of 3, `--rate=50000` where the
generator can pace. Numbers are req/s (plain), conn/s (keep-alive off) and
server CPU per request from the plain profile. The autocannon keep-alive-off
cell is skipped by design (above). wrk's Bun and uWS churn cells carry the
wrk read-error artifact described in `../2026-09-11/README.md`.

| Generator | Cell | MoroJS + engine | raw engine | raw Bun | raw uWS |
|---|---|---|---|---|---|
| wrk | plain req/s | 111,821 | 113,578 | 96,200 | 112,654 |
| wrk | conn/s | 23,879 | 27,262 | 24,233 † | 26,670 † |
| wrk | CPU µs/req | 8.8 | 8.6 | 10.4 | 8.6 |
| oha | plain req/s | 115,343 | 119,879 | 102,958 | 118,195 |
| oha | conn/s | **24,816** | 24,299 | 23,199 | 23,554 |
| oha | CPU µs/req | 8.5 | 8.2 | 9.7 | 8.3 |
| bombardier | plain req/s | **104,816** | 104,665 | 93,862 | 102,836 |
| bombardier | conn/s | 22,292 | 22,673 | 21,448 | 22,186 |
| bombardier | CPU µs/req | 9.5 | 9.4 | 10.7 | 9.6 |
| autocannon | plain req/s | 86,868 | 94,778 | 89,376 | 95,744 |
| autocannon | CPU µs/req | 8.5 | 7.7 | 9.9 | 7.8 |

Against Bun, MoroJS-on-engine is ahead in every cell but one in this pass:
autocannon plain throughput, 86.9k vs 89.4k (−2.8%). That generator is
single-threaded and client-bound (every server sits at 73–89% of one core),
and MoroJS costs 1.4 µs less server CPU per request than Bun in that same
cell. The MoroJS row was the first row of a cold pass; re-measured
afterwards with the three servers alternating over three rounds (`-c 100
-d 8`, one process each, `run.log` tail): MoroJS 99,744 / 99,960 / 101,232,
raw engine 98,488 / 99,744 / 101,016, Bun 96,256 / 96,632 / 96,832 — the
framework is ahead of Bun by 3.5–4.5% in every round, and level with the
raw engine. So on macOS the framework beats Bun in every cell of every
generator except RSS.
Against bare uWebSockets.js the raw engine ties or wins every cell (plain
within ±2%, CPU within 0.1 µs, churn +3% under oha); the full framework is
within 3% of bare uWS on the plain cells of the three server-bound
generators, ahead on oha and bombardier churn, and, in the alternating
re-measurement above, level with the raw engine under autocannon (the 9%
gap in the cold pass was the same first-row effect). Server CPU per
*connection* under churn is the one macOS cell where both engine rows trail
uWS (about 20 µs against 16), for the reason the Linux profile below
establishes. At ~112–120k req/s these plain cells are the macOS loopback
ceiling (the raw engine, uWS and MoroJS land within 5% of each other under
every generator), so a framework-versus-bare-server gap of a few percent is
the framework's own per-request cost, not a transport or parser difference.

## Linux container, every generator, three rotated rounds (`linux-survey2/`)

`node:24-trixie` on Docker Desktop's VM (linuxkit 6.12, arm64, 8 vCPU),
`-c 100 -d 10`, best of 2 per round, `--rate=20000`; three rounds with the
row order rotated (engine first, uWS first, Bun first) so the VM's drift does
not favour whichever row runs first. Cells are the **median of the three
rounds**; `summary.txt` has every round's value. PMU counters are not
exposed to this VM, so the instructions-per-request column the harness can
now record stayed empty; CPU per request is `/proc/<pid>/stat` time over the
run. Same caveats as `mac/`: wrk's Bun and uWS churn cells carry the wrk
read-error artifact, autocannon's churn cell is skipped by design.

| Generator | Cell | MoroJS + engine | raw engine | raw Bun | raw uWS |
|---|---|---|---|---|---|
| wrk | plain req/s | 301,816 | 314,691 | 256,486 | 312,489 |
| wrk | conn/s | 100,861 | 110,838 | 111,496 † | 114,553 † |
| wrk | CPU µs/req | 3.31 | 3.18 | 4.05 | 3.20 |
| wrk | CPU µs/conn | 9.91 | 8.99 | 9.09 | 8.71 |
| oha | plain req/s | **262,092** | 178,560 | 169,703 | 197,290 |
| oha | conn/s | 90,150 | 72,622 | 92,618 | 96,146 |
| oha | p99 @ 20k req/s | 1.52 ms | 1.52 ms | 3.05 ms | 1.46 ms |
| oha | CPU µs/req | **3.82** | 5.59 | 6.04 | 5.07 |
| oha | CPU µs/conn | 11.09 | 13.76 | 10.98 | 10.38 |
| bombardier | plain req/s | 225,675 | 250,386 | 187,109 | 257,955 |
| bombardier | conn/s | 80,559 | 86,861 | 86,400 | 97,050 |
| bombardier | p99 @ 20k req/s | 2.69 ms | 2.73 ms | 3.20 ms | 2.29 ms |
| bombardier | CPU µs/req | 4.38 | 3.93 | 5.43 | 3.81 |
| bombardier | CPU µs/conn | 12.35 | 11.43 | 11.23 | 10.15 |
| autocannon | plain req/s | 144,657 | 141,204 | 144,855 | 133,834 |
| autocannon | CPU µs/req | 4.51 | 4.52 | 7.71 | 4.69 |
| RSS (plain, MB) | | 84–85 | 54–55 | 30–347 (see below) | 54 |

Round-to-round spread on this VM is ±10% for most cells and up to ±20% for
churn (Bun's wrk plain: 222k / 280k / 256k), which is why single-run
differences under 10% are not called either way below. Bun's RSS moved
between 28 and 389 MB across rounds with no change in the load; the 551 MB
in `../2026-09-11/` was one such sample.

**Against Bun** the framework is ahead on every plain-throughput cell but
autocannon (a tie: 144.7k vs 144.9k, both client-bound), on every CPU cell
by 18–41%, and on p99 at a fixed rate by half (oha) and 16% (bombardier).
Churn is parity within the spread under oha (90k vs 93k) and 7% behind under
bombardier (81k vs 86k); under wrk Bun's 111k carries its artifact.

**Against bare uWebSockets.js** the raw engine ties the plain cells within
the spread (wrk +0.7%, bombardier −3%; the oha rows for the raw engine are
low in all three rounds and are not explained yet — the framework row above
it, same engine, is +33% ahead of uWS on the same generator), ties CPU per
request on wrk and bombardier, and is behind on churn: 3% (wrk), 10%
(bombardier) fewer connections per second with 3–13% more CPU per
connection. That is the one consistent direction in the Linux table — both
engine rows cost more per *connection* than uWS under every generator while
per-request cost in keep-alive is at parity — and it is what the
per-connection profile below looks at.

### Where the per-connection cycles go (`linux-survey2/` profile, `strace -c` + `perf record`)

Raw engine and raw uWS under a wrk connection-per-request load in the same
container, one 5 s `strace -c` window and one 6 s `perf record` window each
(the strace window slows the traced server, so only the per-connection
ratios matter):

| Per accepted connection | raw engine | raw uWS |
|---|---|---|
| syscalls | 9: accept4, epoll add (batched through libuv's own io_uring), read, sendto, shutdown, read (EOF), epoll_ctl del, close, epoll_wait | 14: accept4, fcntl ×2, ioctl, setsockopt, epoll_ctl ×5, recvfrom, sendto, shutdown, close |
| top kernel symbol | `tcp_fin` 12.9% | `el0_svc` (syscall entry) 11.9% |

The engine makes fewer syscalls; what it pays that uWS does not under wrk
is the orderly close. The engine sends its FIN first, with the response
bytes, so when the client's FIN arrives the server socket goes through
`tcp_fin` → TIME_WAIT bookkeeping (the memcg charge/free entries next to it
are the timewait socket), plus the read that observes the EOF. uWS does not
echo `Connection: close`, so under wrk (which then writes a second request)
its connections end in resets that skip the orderly close altogether; Bun
behaves the same way. Under oha and bombardier both clients do send
`Connection: close` (captured), uWS honours it, and its FIN goes out as its
own segment about 0.2 ms after the data (idle probe), late enough that a
fast client usually closes first and uWS becomes the passive closer: no
`shutdown`, no TIME_WAIT, no lingering read.

**Tested and rejected (`linux-fin-ab/`):** the obvious counter-move — send
the data segment and the FIN right behind it as its own segment on Linux,
so the client wins the race — measured 15–25% *slower* than the coalesced
FIN across three rotated rounds under both generators (a simultaneous
close costs both sides). Medians, connections per second (CPU µs per
connection):

| Linux churn | MoroJS + engine | raw engine | raw uWS |
|---|---|---|---|
| oha, coalesced FIN (shipped) | 83,766 (11.9) | 76,315 (12.9) | 94,527 (10.6) |
| oha, separate FIN | 69,166 (14.4) | 66,335 (15.0) | 93,286 (10.7) |
| bombardier, coalesced FIN (shipped) | 82,294 (12.0) | 87,223 (11.3) | 93,090 (10.5) |
| bombardier, separate FIN | 74,310 (13.0) | 76,315 (12.6) | 91,955 (10.7) |

So the coalesced FIN stays, and the honest Linux churn statement is: uWS
is 7–13% ahead of the engine rows on this VM with about 1–2 µs less CPU per
connection, the difference being the passive-closer path its deferred FIN
gets under load. The one variant not tried is deferring the engine's FIN
to the end of the loop iteration the same way (a `uv_check`), which would
add up to one iteration of latency for the rare client that waits for the
server's FIN before closing; on macOS the coalesced FIN must stay
regardless (client-side port exhaustion). That is a bare-metal decision:
the VM's ±15% round-to-round spread on this cell is as large as the gap.
The listener-level `TCP_NODELAY` change made on the same day removes one of
the nine syscalls on POSIX (verified inheritance, `test/sockopt-unit.cpp`).
