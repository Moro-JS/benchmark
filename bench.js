#!/usr/bin/env node

// MoroJS benchmark runner - boots a server, waits for readiness, runs load
// profiles, samples memory + CPU, tears down, prints a paste-ready table.
//
// Usage:
//   node bench.js all                # every target, realistic profile, cooldowns
//   node bench.js uws                # a single target (best-of-3)
//   node bench.js single fastify     # any subset
//   node bench.js uws --pipelined    # ALSO run the pipelining microbenchmark
//   node bench.js uws --rate=50000   # ALSO run a fixed-rate profile (latency at load)
//   node bench.js uws --keepalive=off # ALSO run a connection-per-request profile
//   node bench.js uws --runs=5       # override the repeat count
//   node bench.js all --quick        # 10s runs (sanity checks; publish 40s runs)
//   node bench.js all --save         # also write results-<timestamp>.md + .json
//   node bench.js uws --generator=autocannon   # force a specific generator
//   node bench.js uws --baseline=results-X.json --gate   # compare + fail on regression
//
// Flags: --quick --runs=N --settle=3 --warmup[=5] --duration=40
//        --connections=100 --pipelined --pipelining=N --rate=N --keepalive=off
//        --cooldown=8 --save --perf --baseline=<file.json> --gate
//        --generator=wrk|oha|bombardier|autocannon
//
// Profiles: DEFAULT is "no pipelining" - the production-representative shape.
//   HTTP/1.1 pipelining is effectively dead in the real world (browsers
//   disabled it, HTTP/2 multiplexing replaced it, fetch/clients/LBs don't do
//   it), so it does NOT represent production traffic. `--pipelined` adds a
//   second, clearly-labeled column measuring pipelined x10 - a microbenchmark
//   that isolates raw server request-processing cost by removing client
//   round-trips. Useful as a diagnostic; never the headline.
//   `--rate=N` adds a FIXED-RATE profile: the generator offers exactly N req/s
//   and the interesting numbers are latency (p99) and CPU per request at that
//   load - the honest way to compare servers on a box where the open-loop
//   profile is client-bound. `--keepalive=off` adds a CONNECTION-PER-REQUEST
//   profile (what the-benchmarker measures): accept + first-request cost.
//   NOTE: on a single machine over loopback, the realistic (no-pipelining)
//   profile is often bounded by the client/loopback rather than the server,
//   so fast servers converge. Real server-vs-server differences need a
//   dedicated load machine (or higher --connections) to surface honestly.
//
// Load generators (native tools are stronger than a Node-based generator and
// are preferred automatically when installed; autocannon is the always-there
// fallback since it ships as a dependency of this repo). Each PROFILE picks
// the best generator that can express it; the table footer prints which one
// ran for which profile:
//   preference: wrk > oha > bombardier > autocannon
//   - wrk        native (C), pipelining + keep-alive-off via a generated Lua
//                script; fixed rate only if it is wrk2 (-R)
//   - oha        native (Rust), fixed rate (-q) + keep-alive off; NO pipelining
//   - bombardier native (Go), fixed rate (-r) + keep-alive off; NO pipelining
//   - autocannon Node - can itself be the bottleneck against C++ servers;
//                fine as a fallback and for continuity with older results
//   install the native ones with: brew install wrk oha bombardier
//
// Methodology:
// - The generator always runs as a SEPARATE spawned process, never in-process.
// - No warmup by default: clean runs against a freshly-booted server that
//   idled for --settle seconds (same as switching terminals by hand).
//   Opt in with --warmup if you want it; a drain pause follows it.
// - Identical back-to-back runs swing +-5% on laptop hardware, so targeting
//   1-2 specific servers defaults to BEST OF 3 runs per profile (each run is
//   printed; full sweeps default to 1 run - override with --runs=N).
// - One server at a time; a cooldown between targets reduces thermal carryover.
// - For publishable numbers: close other apps, run on mains power, and prefer
//   individual runs (node bench.js <target>) on a cool machine. Always state
//   the generator + profile (the table footer prints both).
// - Memory is the RSS of the server process tree sampled right after load -
//   NOT idle memory. State this if you publish it. Worker THREADS live in one
//   process, so a thread-clustered row's RSS is the whole cluster.
// - CPU us/req is the server process tree's CPU time (user+system, all
//   threads) consumed during the measured run divided by the requests the
//   generator counted. Lower is better; it is the number that survives a
//   client-bound harness. Linux reads /proc/<pid>/stat, macOS uses ps.
// - bytes/resp is what the generator read divided by responses - the wire
//   size, so header-trim changes are visible instead of inferred.

import { spawn, execSync } from 'node:child_process';
import net from 'node:net';
import { writeFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { tmpdir } from 'node:os';
import os from 'node:os';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTOCANNON_BIN = createRequire(import.meta.url).resolve('autocannon/autocannon.js');

// Which MoroJS / engine builds are present - printed with every table so a
// result can never be ambiguous about what it measured
function localPackageInfo(name, label) {
  try {
    const pkgPath = join(__dirname, 'node_modules', name, 'package.json');
    const v = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
    const realDir = realpathSync(join(__dirname, 'node_modules', name));
    let git = '';
    try {
      const sha = execSync(`git -C "${realDir}" rev-parse --short HEAD`, {
        encoding: 'utf8',
      }).trim();
      const dirty = execSync(`git -C "${realDir}" status --porcelain`, { encoding: 'utf8' }).trim()
        ? '+uncommitted'
        : '';
      git = ` @ ${sha}${dirty}`;
    } catch {
      // not a git checkout
    }
    return `local ${label}@${v}${git} (${realDir})`;
  } catch {
    return null; // local build not linked - *-local targets will skip
  }
}

function moroBuildInfo() {
  const parts = [];
  for (const [pkg, label] of [
    ['@morojs/moro', 'npm @morojs/moro'],
    ['@morojs/engine', 'npm @morojs/engine'],
  ]) {
    try {
      const v = JSON.parse(
        readFileSync(join(__dirname, 'node_modules', pkg, 'package.json'), 'utf8')
      ).version;
      parts.push(`${label}@${v}`);
    } catch {
      parts.push(`${pkg} not installed`);
    }
  }
  const moroLocal = localPackageInfo('moro-local', 'moro-local');
  if (moroLocal) parts.push(moroLocal);
  const engineLocal = localPackageInfo('engine-local', 'engine-local');
  if (engineLocal) parts.push(engineLocal);
  return parts.join(' | ');
}
const MORO_BUILDS = moroBuildInfo();

// MoroJS ships in two flavors here:
//   - plain targets (single/uws/cluster) benchmark the PUBLISHED npm package
//   - *-local targets benchmark the sibling ../MoroJS working tree via the
//     'moro-local' symlink (create it with `npm run local:link`, build the
//     tree with `npm run local:build`). Local rows sit directly after their
//     prod twin so an A/B pair runs back-to-back under similar machine state.
//     They skip gracefully when the symlink doesn't exist.
//   - raw-engine-local benchmarks the sibling ../MoroJS Engine working tree's
//     build/ binaries via the 'engine-local' symlink (`npm run engine:link:local`,
//     which also points ../MoroJS at the same tree so engine-local/cluster-local
//     rows run the local engine too).
const TARGETS = [
  { key: 'raw-node', name: 'raw node:http (baseline)', file: 'servers/raw-node-server.js', port: 3120 },
  // MORO_SERVER_ENGINE=node pins the npm single row to the Node-http path: as
  // of MoroJS 1.8.0 the native engine is the DEFAULT, so an unpinned server
  // would silently measure the engine and stop being the node baseline.
  { key: 'single', name: 'MoroJS (single thread, node engine, npm)', file: 'servers/moro-single-server.js', port: 3110, env: { MORO_SERVER_ENGINE: 'node' } },
  { key: 'single-local', name: 'MoroJS (single thread, node engine, LOCAL build)', file: 'servers/moro-single-server.js', port: 3113, env: { MORO_PKG: 'moro-local', MORO_SERVER_ENGINE: 'node' }, requiresPackage: 'moro-local' },
  // MoroJS's own native engine (@morojs/engine) - the default since 1.8.0.
  // The npm row needs @morojs/moro >= 1.8.0 on the registry (the server warns
  // at boot if the engine didn't actually load).
  { key: 'engine', name: 'MoroJS + @morojs/engine (npm)', file: 'servers/moro-engine-server.js', port: 3117 },
  { key: 'engine-local', name: 'MoroJS + @morojs/engine (LOCAL build)', file: 'servers/moro-engine-server.js', port: 3116, env: { MORO_PKG: 'moro-local' }, requiresPackage: 'moro-local' },
  { key: 'fastify', name: 'Fastify', file: 'servers/fastify-server.js', port: 3122 },
  { key: 'express', name: 'Express', file: 'servers/express-server.js', port: 3123 },
  { key: 'koa', name: 'Koa', file: 'servers/koa-server.js', port: 3124 },
  { key: 'hono', name: 'Hono (Node)', file: 'servers/hono-server.js', port: 3129 },
  { key: 'elysia-node', name: 'Elysia (Node adapter)', file: 'servers/elysia-node-server.js', port: 3125 },
  // Bun-runtime targets - run only when Bun is installed. Bun's pipelining
  // weakness (framework-independent) is exactly why both profiles are shown.
  { key: 'elysia-bun', name: 'Elysia (Bun)', file: 'servers/elysia-bun-server.js', port: 3126, runtime: 'bun' },
  { key: 'raw-bun', name: 'raw Bun.serve (baseline)', file: 'servers/raw-bun-server.js', port: 3127, runtime: 'bun' },
  { key: 'raw-engine', name: 'raw @morojs/engine (baseline)', file: 'servers/raw-engine-server.js', port: 3128 },
  { key: 'raw-engine-local', name: 'raw @morojs/engine (LOCAL build)', file: 'servers/raw-engine-server.js', port: 3130, env: { ENGINE_PKG: 'engine-local' }, requiresPackage: 'engine-local' },
  { key: 'raw-uws', name: 'raw uWebSockets.js (baseline)', file: 'servers/raw-uws-server.js', port: 3121 },
  { key: 'uws', name: 'MoroJS + uWebSockets.js (npm)', file: 'servers/moro-uws-server.js', port: 3112 },
  { key: 'uws-local', name: 'MoroJS + uWebSockets.js (LOCAL build)', file: 'servers/moro-uws-server.js', port: 3114, env: { MORO_PKG: 'moro-local' }, requiresPackage: 'moro-local' },
  { key: 'cluster', name: 'MoroJS (clustered, npm)', file: 'servers/moro-cluster-server.js', port: 3111 },
  { key: 'cluster-local', name: 'MoroJS (clustered, LOCAL build)', file: 'servers/moro-cluster-server.js', port: 3115, env: { MORO_PKG: 'moro-local' }, requiresPackage: 'moro-local' },
];

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
);
const selected = args.filter(a => !a.startsWith('--'));

const quick = !!flags.quick;
const duration = parseInt(flags.duration || (quick ? '10' : '40'), 10);
const connections = parseInt(flags.connections || '100', 10);
const cooldownSec = parseInt(flags.cooldown || (quick ? '3' : '8'), 10);
// No warmup by default: the reference methodology (a manual generator run,
// Fastify's official benchmarks) measures a single clean run against a
// freshly-booted, briefly-idle server. A load warmup before measuring leaves
// the server with GC debt and TIME_WAIT sockets and under-reports slightly.
const warmupSec = flags.warmup ? parseInt(flags.warmup === true ? '5' : flags.warmup, 10) : 0;
// Idle settle after boot before measuring - replicates the natural pause of
// the two-terminal manual flow (boot logs flush, GC settles)
const settleSec = parseInt(flags.settle || (quick ? '1' : '3'), 10);
const wantPerf = !!flags.perf;
const gate = !!flags.gate;
const baselineFile = typeof flags.baseline === 'string' ? flags.baseline : null;
// --replay=<results.json>: no benchmarking - load a saved run and re-run the
// table / baseline comparison / gate on it (e.g. after a gate rule changes).
const replayFile = typeof flags.replay === 'string' ? flags.replay : null;
if (gate && !baselineFile) {
  console.error('--gate needs --baseline=<results-*.json>');
  process.exit(1);
}

// Profiles. DEFAULT is "no pipelining" - the production-representative shape.
// HTTP/1.1 pipelining is effectively dead in the real world (browsers disabled
// it, HTTP/2 multiplexing replaced it, fetch/clients/load balancers don't do
// it), so it does NOT model production traffic. It's a microbenchmark that
// isolates server-side request-processing cost by removing client round-trips
// - useful as a diagnostic, misleading as a headline. It stays strictly
// opt-in and clearly labeled.
//   default            -> no pipelining (realistic)
//   --pipelined        -> ALSO run the pipelined x10 capability microbenchmark
//   --pipelining=N     -> single run at depth N (N=1 realistic; N>1 microbench)
//   --rate=N           -> ALSO run a fixed-rate profile (latency + CPU at N req/s)
//   --keepalive=off    -> ALSO run a connection-per-request profile
// A profile is { label, p, rate, keepalive }; `plain` marks the profile whose
// latency / CPU / bytes feed the summary columns.
const PIPELINE_DEPTH = 10;
const PLAIN = { label: 'no pipelining', p: 1, rate: 0, keepalive: true, plain: true };
let profiles;
if (flags.pipelining !== undefined) {
  const p = parseInt(flags.pipelining, 10);
  profiles = [p > 1 ? { label: `pipelined x${p} (microbench)`, p, rate: 0, keepalive: true } : PLAIN];
} else {
  profiles = [PLAIN];
  if (flags.pipelined) {
    profiles.push({ label: `pipelined x${PIPELINE_DEPTH} (microbench)`, p: PIPELINE_DEPTH, rate: 0, keepalive: true });
  }
}
const fixedRate = typeof flags.rate === 'string' ? parseInt(flags.rate, 10) : 0;
if (fixedRate > 0) {
  profiles.push({ label: `fixed rate ${fmt(fixedRate)} req/s`, p: 1, rate: fixedRate, keepalive: true });
}
if (flags.keepalive === 'off') {
  profiles.push({ label: 'keep-alive off (conn/req)', p: 1, rate: 0, keepalive: false });
}

const wanted =
  selected.length === 0 || selected.includes('all')
    ? TARGETS
    : TARGETS.filter(t => selected.includes(t.key));

if (wanted.length === 0) {
  console.error(`Unknown target(s): ${selected.join(', ')}`);
  console.error(`Available: all, ${TARGETS.map(t => t.key).join(', ')}`);
  process.exit(1);
}

// Repeat each measurement N times (pause between), report every run + keep the
// best. Single-run results on laptop hardware swing +-5% between identical
// runs, so benchmarking 1-2 specific targets defaults to best-of-3 (matches
// the number you'd anchor on after a few manual attempts). Full sweeps stay
// at 1 run to keep total time sane - pass --runs explicitly to override.
const runs = Math.max(1, parseInt(flags.runs || (wanted.length <= 2 && !quick ? '3' : '1'), 10));

const sleep = ms => new Promise(r => setTimeout(r, ms));

function which(bin) {
  try {
    return execSync(`which ${bin}`, { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Load generator selection (per profile)
// ---------------------------------------------------------------------------

const GENERATOR_PRIORITY = ['wrk', 'oha', 'bombardier', 'autocannon'];

// wrk2 is a wrk fork with a fixed-rate flag (-R); plain wrk 4.x has none.
function wrkSupportsRate() {
  try {
    const help = execSync('wrk --help 2>&1 || true', { encoding: 'utf8' });
    return /(^|\s)-R,?\s|--rate\b/.test(help);
  } catch {
    return false;
  }
}

// Connection-per-request support per generator, verified against a counting
// server (requests per accepted TCP connection):
//   wrk        Lua `Connection: close`            -> 1.00
//   oha        --disable-keepalive (client closes) -> 1.00
//   bombardier -H 'Connection: close'              -> 1.00  (its -a flag is a
//              no-op for the fasthttp client: 8.4 requests per connection)
//   autocannon cannot: it always sends its own `Connection: keep-alive` and
//              APPENDS the user's `connection: close`. RFC 9110 §7.6.1 makes
//              that list contain `close`, so a conforming server closes
//              (node:http and @morojs/engine: 1.00) while uWebSockets.js and
//              Bun.serve keep the connection (~2,800 responses per connection
//              measured) - the "profile" would measure header handling, not
//              connection cost. Skipped, with this reason printed.
const GENERATOR_CAPS = {
  wrk: { pipelining: true, keepaliveOff: true, rate: () => wrkSupportsRate() },
  oha: { pipelining: false, keepaliveOff: true, rate: () => true },
  bombardier: { pipelining: false, keepaliveOff: true, rate: () => true },
  autocannon: {
    pipelining: true,
    keepaliveOff: false,
    keepaliveOffReason:
      'autocannon always sends Connection: keep-alive and appends the close header; only servers honouring the close token close per request (engine, node:http), uWS and Bun do not - not comparable',
    rate: () => true,
  },
};

function generatorCanRun(g, profile) {
  const caps = GENERATOR_CAPS[g];
  if (profile.p > 1 && !caps.pipelining) return false;
  if (!profile.keepalive && !caps.keepaliveOff) return false;
  if (profile.rate > 0 && !caps.rate()) return false;
  return true;
}

function generatorSkipReason(g, profile) {
  const caps = GENERATOR_CAPS[g];
  if (!profile.keepalive && !caps.keepaliveOff && caps.keepaliveOffReason) return caps.keepaliveOffReason;
  return null;
}

const forcedGenerator = typeof flags.generator === 'string' ? flags.generator : null;
if (forcedGenerator) {
  if (!GENERATOR_PRIORITY.includes(forcedGenerator)) {
    console.error(`Unknown generator '${forcedGenerator}'. Options: ${GENERATOR_PRIORITY.join(', ')}`);
    process.exit(1);
  }
  if (forcedGenerator !== 'autocannon' && !which(forcedGenerator)) {
    console.error(`--generator=${forcedGenerator} requested but '${forcedGenerator}' is not installed`);
    process.exit(1);
  }
}

function selectGenerator(profile) {
  if (forcedGenerator) return generatorCanRun(forcedGenerator, profile) ? forcedGenerator : null;
  for (const g of GENERATOR_PRIORITY) {
    if (!generatorCanRun(g, profile)) continue;
    if (g === 'autocannon' || which(g)) return g;
  }
  return null;
}

// Resolve a generator per profile up front; a profile nothing can express is
// dropped loudly rather than silently measuring something else
for (const profile of profiles) profile.generator = selectGenerator(profile);
const dropped = profiles.filter(pr => !pr.generator);
for (const pr of dropped) {
  const why = forcedGenerator ? generatorSkipReason(forcedGenerator, pr) : null;
  console.warn(
    `NOTE: no ${forcedGenerator ? `'${forcedGenerator}' ` : ''}generator can run profile '${pr.label}' - skipped${why ? ` (${why})` : ''}`
  );
}
profiles = profiles.filter(pr => pr.generator);
if (profiles.length === 0) {
  console.error('No runnable profiles.');
  process.exit(1);
}
const plainProfile = profiles.find(pr => pr.plain) || profiles[0];

// wrk needs a Lua script to pipeline and to send Connection: close; generate
// one per (depth, keepalive) per invocation
const wrkLuaByShape = new Map();
function getWrkLua(depth, keepalive) {
  const key = `${depth}:${keepalive ? 'ka' : 'close'}`;
  if (!wrkLuaByShape.has(key)) {
    const luaPath = join(tmpdir(), `moro-bench-${process.pid}-${key.replace(':', '-')}.lua`);
    writeFileSync(
      luaPath,
      [
        'init = function(args)',
        ...(keepalive ? [] : ['  wrk.headers["Connection"] = "close"']),
        `  local depth = ${depth}`,
        '  local r = {}',
        '  for i = 1, depth do r[i] = wrk.format() end',
        '  req = table.concat(r)',
        'end',
        'request = function() return req end',
        '',
      ].join('\n')
    );
    wrkLuaByShape.set(key, luaPath);
  }
  return wrkLuaByShape.get(key);
}

function spawnCollect(bin, cliArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, cliArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`${bin} exited with code ${code}: ${err.slice(0, 300)}`));
        return;
      }
      resolve(out);
    });
  });
}

function toMs(value, unit) {
  const v = parseFloat(value);
  if (unit === 'us') return v / 1000;
  if (unit === 's') return v * 1000;
  if (unit === 'm') return v * 60000;
  return v; // ms
}

function toBytes(value, unit) {
  const v = parseFloat(value);
  const mult = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[unit] ?? 1;
  return v * mult;
}

// All generator adapters normalize to:
//   { reqSec, latAvgMs, latP99Ms|null, errors, non2xx, requestsTotal, bytesRead }

async function runWrk(port, durationSec, profile) {
  const threads = Math.min(8, Math.max(4, Math.floor((os.availableParallelism?.() || 8) / 2)));
  const cliArgs = [
    '-t', String(threads),
    '-c', String(connections),
    '-d', `${durationSec}s`,
    '--latency',
  ];
  if (profile.rate > 0) cliArgs.push('-R', String(profile.rate));
  if (profile.p > 1 || !profile.keepalive) cliArgs.push('-s', getWrkLua(profile.p, profile.keepalive));
  cliArgs.push(`http://127.0.0.1:${port}/`);

  const out = await spawnCollect(which('wrk'), cliArgs);

  const reqSec = parseFloat(out.match(/Requests\/sec:\s+([\d.]+)/)?.[1] ?? 'NaN');
  const latAvg = out.match(/Latency\s+([\d.]+)(us|ms|s|m)/);
  const latP99 = out.match(/99%\s+([\d.]+)(us|ms|s|m)/);
  const non2xx = parseInt(out.match(/Non-2xx or 3xx responses:\s+(\d+)/)?.[1] ?? '0', 10);
  const sockErr = out.match(/Socket errors: connect (\d+), read (\d+), write (\d+), timeout (\d+)/);
  const errors = sockErr ? sockErr.slice(1, 5).reduce((a, b) => a + parseInt(b, 10), 0) : 0;
  const totals = out.match(/(\d+) requests in [\d.]+(?:us|ms|s|m), ([\d.]+)(B|KB|MB|GB|TB) read/);

  if (!Number.isFinite(reqSec)) throw new Error(`could not parse wrk output:\n${out.slice(0, 400)}`);
  // wrk's per-request latency accounting is unreliable under pipelining
  // (it times batches, not individual responses) - don't report it
  const latencyMeaningful = profile.p === 1;
  return {
    reqSec,
    latAvgMs: latencyMeaningful && latAvg ? toMs(latAvg[1], latAvg[2]) : null,
    latP99Ms: latencyMeaningful && latP99 ? toMs(latP99[1], latP99[2]) : null,
    errors,
    non2xx,
    requestsTotal: totals ? parseInt(totals[1], 10) : null,
    bytesRead: totals ? toBytes(totals[2], totals[3]) : null,
  };
}

async function runOha(port, durationSec, profile) {
  const cliArgs = [
    '-z', `${durationSec}s`,
    '-c', String(connections),
    '--no-tui',
    '--output-format', 'json',
  ];
  if (profile.rate > 0) cliArgs.push('-q', String(profile.rate), '--latency-correction');
  if (!profile.keepalive) cliArgs.push('--disable-keepalive');
  cliArgs.push(`http://127.0.0.1:${port}/`);
  const out = await spawnCollect(which('oha'), cliArgs);
  const j = JSON.parse(out);
  const statusDist = j.statusCodeDistribution || {};
  let non2xx = 0;
  let requestsTotal = 0;
  for (const code in statusDist) {
    requestsTotal += statusDist[code];
    if (code < '200' || code >= '300') non2xx += statusDist[code];
  }
  let errors = 0;
  for (const [kind, n] of Object.entries(j.errorDistribution || {})) {
    // "aborted due to deadline" is oha cutting in-flight requests at -z, not a failure
    if (!/deadline/i.test(kind)) errors += n;
  }
  return {
    reqSec: j.summary.requestsPerSec,
    latAvgMs: j.summary.average * 1000, // oha reports seconds
    latP99Ms: (j.latencyPercentiles?.p99 ?? null) === null ? null : j.latencyPercentiles.p99 * 1000,
    errors,
    non2xx,
    requestsTotal,
    // oha's totalData counts response BODY bytes only (sizePerRequest == body
    // length), not the wire size the other generators report - leave it out
    // rather than publish a bytes/resp that silently excludes headers
    bytesRead: null,
  };
}

async function runBombardier(port, durationSec, profile) {
  const cliArgs = [
    '-c', String(connections),
    '-d', `${durationSec}s`,
    '-l',
    '-p', 'r',
    '-o', 'json',
  ];
  if (profile.rate > 0) cliArgs.push('-r', String(profile.rate));
  // bombardier's own words for -a: "Disable HTTP keep-alive. For fasthttp use
  // -H 'Connection: close'". With -a the fasthttp client kept connections
  // open (8.4 requests per connection measured); the header gives 1.00.
  if (!profile.keepalive) cliArgs.push('-H', 'Connection: close');
  cliArgs.push(`http://127.0.0.1:${port}/`);
  const out = await spawnCollect(which('bombardier'), cliArgs);
  const r = JSON.parse(out).result;
  const p99 = r.latency?.percentiles?.['99'];
  const requestsTotal =
    (r.req1xx || 0) + (r.req2xx || 0) + (r.req3xx || 0) + (r.req4xx || 0) + (r.req5xx || 0);
  return {
    reqSec: r.rps.mean,
    latAvgMs: r.latency.mean / 1000, // bombardier reports microseconds
    latP99Ms: p99 != null ? p99 / 1000 : null,
    errors: r.others || 0,
    non2xx: (r.req4xx || 0) + (r.req5xx || 0),
    requestsTotal,
    bytesRead: r.bytesRead ?? null,
  };
}

async function runAutocannon(port, durationSec, profile) {
  const cliArgs = [
    AUTOCANNON_BIN,
    '-c', String(connections),
    '-d', String(durationSec),
    '-p', String(profile.p),
    '--json',
  ];
  if (profile.rate > 0) cliArgs.push('-R', String(profile.rate));
  if (!profile.keepalive) cliArgs.push('-H', 'connection=close');
  cliArgs.push(`http://127.0.0.1:${port}`);
  const out = await spawnCollect(process.execPath, cliArgs);
  const j = JSON.parse(out);
  return {
    reqSec: j.requests.average,
    latAvgMs: j.latency.average,
    latP99Ms: j.latency.p99 ?? null,
    errors: j.errors || 0,
    non2xx: j.non2xx || 0,
    requestsTotal: j.requests.total ?? null,
    bytesRead: j.throughput?.total ?? null,
  };
}

function runLoad(port, durationSec, profile) {
  const g = profile.generator;
  if (g === 'wrk') return runWrk(port, durationSec, profile);
  if (g === 'oha') return runOha(port, durationSec, profile);
  if (g === 'bombardier') return runBombardier(port, durationSec, profile);
  return runAutocannon(port, durationSec, profile);
}

// ---------------------------------------------------------------------------

async function waitForReady(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // connection: close - don't leave a keep-alive socket parked on the
      // server for the duration of the measurement
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        headers: { connection: 'close' },
      });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  return false;
}

// The server process tree: the spawned pid plus its direct children (cluster
// workers are direct children of the primary). Worker threads need nothing
// extra - they are inside the one process.
function processTreePids(pid) {
  const pids = [pid];
  try {
    const kids = execSync(`pgrep -P ${pid}`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(Number);
    pids.push(...kids);
  } catch {
    // no children (or no pgrep)
  }
  return pids;
}

function processTreeRssMb(pid) {
  try {
    let totalKb = 0;
    for (const p of processTreePids(pid)) {
      try {
        totalKb += parseInt(execSync(`ps -o rss= -p ${p}`, { encoding: 'utf8' }).trim(), 10) || 0;
      } catch {
        // process gone
      }
    }
    return Math.round(totalKb / 1024);
  } catch {
    return null;
  }
}

// CPU time (user+system, every thread) of the server process tree, in ms.
// Linux: /proc/<pid>/stat fields 14+15 (clock ticks). Elsewhere: ps cputime
// ([[dd-]hh:]mm:ss[.cc], 10 ms resolution - fine over a 10-40 s run).
// Returns null when it cannot be measured (Windows) - callers print '-'.
let clkTck = null;
function clockTicksPerSec() {
  if (clkTck === null) {
    try {
      clkTck = parseInt(execSync('getconf CLK_TCK', { encoding: 'utf8' }).trim(), 10) || 100;
    } catch {
      clkTck = 100;
    }
  }
  return clkTck;
}

function parsePsCpuTime(s) {
  // "3:07.45" | "1:02:03" | "2-01:02:03" | "0:00.02"
  let days = 0;
  let rest = s.trim();
  const dash = rest.indexOf('-');
  if (dash > 0) {
    days = parseInt(rest.slice(0, dash), 10) || 0;
    rest = rest.slice(dash + 1);
  }
  const parts = rest.split(':').map(Number);
  let seconds = 0;
  for (const p of parts) seconds = seconds * 60 + p;
  return (days * 86400 + seconds) * 1000;
}

function processTreeCpuMs(pid) {
  if (process.platform === 'win32') return null;
  let total = 0;
  let sampled = false;
  for (const p of processTreePids(pid)) {
    try {
      if (process.platform === 'linux') {
        const stat = readFileSync(`/proc/${p}/stat`, 'utf8');
        // comm (field 2) can contain spaces/parens: split after the last ')'
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
        const utime = parseInt(fields[11], 10); // field 14
        const stime = parseInt(fields[12], 10); // field 15
        total += ((utime + stime) * 1000) / clockTicksPerSec();
      } else {
        total += parsePsCpuTime(execSync(`ps -o cputime= -p ${p}`, { encoding: 'utf8' }));
      }
      sampled = true;
    } catch {
      // process gone
    }
  }
  return sampled ? total : null;
}

// Optional Linux-only hardware/syscall counters for the measured window:
// `perf stat` attached to the server tree for the run's duration. Prints
// "n/a" everywhere else (or when perf is missing / perf_event_paranoid
// forbids it) rather than failing the run.
// Hardware counters always; syscall tracepoints only where tracefs exposes
// them (they need a mounted tracefs and CAP_PERFMON/privileged, and the
// names differ per arch: arm64 has epoll_pwait, not epoll_wait). An
// unavailable tracepoint used to fail the whole perf stat, losing the
// instruction count that is the one VM-noise-resistant number.
const PERF_HW_EVENTS = ['instructions', 'cycles'];
const PERF_SYSCALLS = ['read', 'recvfrom', 'write', 'writev', 'sendto', 'epoll_wait', 'epoll_pwait', 'io_uring_enter', 'accept4'];
let perfEventsResolved = null;
function perfEvents() {
  if (perfEventsResolved) return perfEventsResolved;
  const events = [...PERF_HW_EVENTS];
  for (const root of ['/sys/kernel/tracing', '/sys/kernel/debug/tracing']) {
    if (!existsSync(`${root}/events/syscalls`)) continue;
    for (const name of PERF_SYSCALLS) {
      if (existsSync(`${root}/events/syscalls/sys_enter_${name}`)) events.push(`syscalls:sys_enter_${name}`);
    }
    break;
  }
  perfEventsResolved = events;
  return events;
}
function startPerfStat(pid, durationSec) {
  if (!wantPerf) return null;
  if (process.platform !== 'linux' || !which('perf')) {
    return Promise.resolve({ available: false, reason: 'perf not available on this platform' });
  }
  const pids = processTreePids(pid).join(',');
  const child = spawn(
    'perf',
    ['stat', '-x', ',', '-e', perfEvents().join(','), '-p', pids, '--', 'sleep', String(durationSec)],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let err = '';
  child.stderr.on('data', d => (err += d));
  return new Promise(resolve => {
    child.on('error', e => resolve({ available: false, reason: e.message }));
    child.on('close', code => {
      if (code !== 0) return resolve({ available: false, reason: err.slice(0, 200) });
      const counters = {};
      for (const line of err.split('\n')) {
        const [value, , event] = line.split(',');
        const n = parseFloat(value);
        if (event && Number.isFinite(n)) counters[event.trim()] = n;
      }
      resolve({ available: true, counters });
    });
  });
}

function killTree(child) {
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      // already gone
    }
  }
}

// Servers are spawned detached (own process group, so cluster workers die
// with their primary) - which means a Ctrl-C on the runner does NOT reach
// them. Track live children and kill them on any runner exit, otherwise
// interrupted runs leave orphaned servers squatting on benchmark ports and
// later runs silently measure the squatter instead of a fresh server.
const liveChildren = new Set();
function cleanupChildren() {
  for (const child of liveChildren) killTree(child);
  liveChildren.clear();
}
process.on('SIGINT', () => {
  cleanupChildren();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanupChildren();
  process.exit(143);
});
process.on('exit', cleanupChildren);

// Refuse to measure a port that is already occupied - a stale server there
// (wrong version, wrong state) would be benchmarked instead of ours. A plain
// TCP connect: works wherever Node runs (a container image without lsof used
// to make this check a silent no-op).
function portOccupied(port) {
  return new Promise(resolve => {
    const s = net.connect({ host: '127.0.0.1', port });
    const done = v => {
      s.destroy();
      resolve(v);
    };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    s.setTimeout(500, () => done(false));
  });
}

function resolveRuntime(target) {
  if (!target.runtime || target.runtime === 'node') return process.execPath;
  return which(target.runtime);
}

// One measured run: load + CPU delta around it (+ optional perf counters)
async function measureRun(child, port, profile) {
  const cpuBefore = processTreeCpuMs(child.pid);
  const perf = startPerfStat(child.pid, duration);
  const r = await runLoad(port, duration, profile);
  const cpuAfter = processTreeCpuMs(child.pid);
  const cpuMs = cpuBefore != null && cpuAfter != null ? Math.max(0, cpuAfter - cpuBefore) : null;
  r.cpuMs = cpuMs;
  r.cpuPct = cpuMs != null ? (cpuMs / (duration * 1000)) * 100 : null;
  r.cpuUsPerReq = cpuMs != null && r.requestsTotal ? (cpuMs * 1000) / r.requestsTotal : null;
  r.bytesPerResp = r.bytesRead != null && r.requestsTotal ? r.bytesRead / r.requestsTotal : null;
  if (perf) {
    const p = await perf;
    r.perf = p.available
      ? Object.fromEntries(
          Object.entries(p.counters).map(([k, v]) => [k, r.requestsTotal ? v / r.requestsTotal : v])
        )
      : { unavailable: p.reason };
  }
  return r;
}

// Which run "wins" a profile: highest throughput, except fixed-rate profiles
// where throughput is pinned and the lowest p99 is the honest pick
function betterRun(a, b, profile) {
  if (!a) return b;
  if (profile.rate > 0 && a.latP99Ms != null && b.latP99Ms != null) return b.latP99Ms < a.latP99Ms ? b : a;
  return b.reqSec > a.reqSec ? b : a;
}

function summarizeRun(r) {
  return {
    reqSec: r.reqSec,
    latAvgMs: r.latAvgMs,
    latP99Ms: r.latP99Ms,
    cpuUsPerReq: r.cpuUsPerReq,
    cpuPct: r.cpuPct,
    bytesPerResp: r.bytesPerResp,
    requestsTotal: r.requestsTotal,
    errors: r.errors,
    non2xx: r.non2xx,
    ...(r.perf ? { perf: r.perf } : {}),
  };
}

async function benchTarget(target) {
  const runtimeBin = resolveRuntime(target);
  if (!runtimeBin) {
    console.log(`skipped - requires the '${target.runtime}' runtime (not installed)`);
    return null;
  }

  if (
    target.requiresPackage &&
    !existsSync(join(__dirname, 'node_modules', target.requiresPackage, 'package.json'))
  ) {
    const hint = target.requiresPackage === 'engine-local' ? 'npm run engine:link:local' : 'npm run local:link';
    console.log(`skipped - requires '${target.requiresPackage}' (link the local build first: ${hint})`);
    return null;
  }

  if (await portOccupied(target.port)) {
    console.error(
      `skipped - port ${target.port} is already in use (find the owner with ` +
        `\`lsof -ti :${target.port}\` or \`ss -ltnp\`). Refusing to measure an unknown server.`
    );
    return null;
  }

  const file = join(__dirname, target.file);
  const child = spawn(runtimeBin, [file], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn',
      PORT: String(target.port),
      ...(target.env || {}),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true, // own process group so cluster workers die with the primary
  });
  liveChildren.add(child);
  // Keep the tail of the server's stderr so a start failure says why
  // (a missing native binary, a bind error) instead of just "skipped".
  const stderrTail = [];
  child.stderr.on('data', d => {
    for (const l of String(d).split('\n')) {
      if (!l.trim()) continue;
      stderrTail.push(l);
      if (stderrTail.length > 30) stderrTail.shift();
    }
  });

  try {
    const ready = await waitForReady(target.port);
    if (!ready) {
      console.error(`  ${target.name}: server failed to become ready - skipped`);
      if (stderrTail.length) console.error('  server stderr:\n' + stderrTail.map(l => `    ${l}`).join('\n'));
      return null;
    }

    // Idle settle: clustering finishes forking, boot logging flushes, GC
    // settles - mirrors the pause before a manual generator invocation
    await sleep(settleSec * 1000);

    if (warmupSec > 0) {
      await runLoad(target.port, warmupSec, plainProfile);
      await sleep(2000); // let TIME_WAIT/GC from the warmup drain
    }

    const row = {
      name: target.name,
      key: target.key,
      byProfile: {}, // label -> { best run summary, runs: [...], generator }
      latencyAvg: null,
      latencyP99: null,
      cpuUsPerReq: null,
      cpuPct: null,
      bytesPerResp: null,
      rssMb: null,
      errors: 0,
      non2xx: 0,
    };

    for (const profile of profiles) {
      let best = null;
      const allRuns = [];
      for (let run = 0; run < runs; run++) {
        if (run > 0) await sleep(3000);
        const r = await measureRun(child, target.port, profile);
        allRuns.push(summarizeRun(r));
        best = betterRun(best, r, profile);
        if (runs > 1) {
          process.stdout.write(
            `\n    ${profile.label} run ${run + 1}/${runs}: ${fmt(r.reqSec)} req/s` +
              (r.latP99Ms != null ? `, p99 ${fmtMs(r.latP99Ms)}` : '') +
              (r.cpuUsPerReq != null ? `, ${fmtUs(r.cpuUsPerReq)} cpu/req` : '')
          );
        }
      }
      row.byProfile[profile.label] = {
        ...summarizeRun(best),
        generator: profile.generator,
        runs: allRuns,
      };
      row.errors = Math.max(row.errors, best.errors);
      row.non2xx = Math.max(row.non2xx, best.non2xx);
      // Summary latency / CPU / bytes columns come from the plain profile,
      // where per-request numbers are meaningful and comparable across rows
      if (profile === plainProfile) {
        row.latencyAvg = best.latAvgMs;
        row.latencyP99 = best.latP99Ms;
        row.cpuUsPerReq = best.cpuUsPerReq;
        row.cpuPct = best.cpuPct;
        row.bytesPerResp = best.bytesPerResp;
      }
      if (runs > 1) {
        process.stdout.write(`\n  ${profile.label} best: ${fmt(best.reqSec)} req/s`);
      } else if (profiles.length > 1) {
        process.stdout.write(`\n  ${profile.label}: ${fmt(best.reqSec)} req/s`);
      }
      // Brief pause between profiles so the second isn't taxed by the first
      if (profile !== profiles[profiles.length - 1]) await sleep(3000);
    }

    row.rssMb = processTreeRssMb(child.pid);
    return row;
  } finally {
    killTree(child);
    liveChildren.delete(child);
    await sleep(500);
  }
}

function fmt(n) {
  return n == null ? '-' : Math.round(n).toLocaleString('en-US');
}

function fmtMs(n) {
  return n == null ? '-' : `${n.toFixed(1)} ms`;
}

function fmtUs(n) {
  return n == null ? '-' : `${n.toFixed(1)} µs`;
}

function fmtBytes(n) {
  return n == null ? '-' : `${Math.round(n)} B`;
}

function fmtPct(n) {
  return n == null ? '-' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function profileLine() {
  const profileDesc = profiles.map(pr => `${pr.label} [${pr.generator}]`).join(' + ');
  return `-c ${connections} -d ${duration} | ${profileDesc}${runs > 1 ? ` | best of ${runs} runs` : ''} | node ${process.version} | ${process.platform}/${process.arch}${quick ? ' | QUICK RUN - do not publish' : ''}`;
}

const rateProfile = profiles.find(pr => pr.rate > 0);

function tableLines(resultRows) {
  const cols = [
    'Server',
    ...profiles.map(pr => `Req/sec (${pr.label})`),
    'Latency avg',
    'Latency p99',
    ...(rateProfile ? [`p99 @ ${fmt(rateProfile.rate)}/s`] : []),
    'CPU µs/req',
    'bytes/resp',
    'RSS under load',
  ];
  const header = `| ${cols.join(' | ')} |`;
  const divider = `|${cols.map(c => '-'.repeat(Math.max(3, c.length + 2))).join('|')}|`;
  return [
    header,
    divider,
    ...resultRows.map(r => {
      const cells = [
        r.name,
        ...profiles.map(pr => fmt(r.byProfile[pr.label]?.reqSec)),
        fmtMs(r.latencyAvg),
        fmtMs(r.latencyP99),
        ...(rateProfile ? [fmtMs(r.byProfile[rateProfile.label]?.latP99Ms)] : []),
        fmtUs(r.cpuUsPerReq),
        fmtBytes(r.bytesPerResp),
        r.rssMb ? `${r.rssMb} MB` : '-',
      ];
      return `| ${cells.join(' | ')} |`;
    }),
  ];
}

// ---------------------------------------------------------------------------
// Baseline comparison + gate
// ---------------------------------------------------------------------------

// Run-to-run noise of a baseline profile: spread of its recorded runs, never
// below 2% (a single-run baseline has no spread to speak of)
function baselineNoise(entry) {
  const vals = (entry.runs || []).map(r => r.reqSec).filter(v => Number.isFinite(v));
  if (vals.length < 2) return 0.02;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  return Math.max(0.02, (max - min) / max);
}

const GATE_RULES = [
  // throughput must not drop beyond the baseline's own noise
  { key: 'reqSec', label: 'req/s', dir: 'higher', tol: entry => baselineNoise(entry) },
  { key: 'latP99Ms', label: 'p99', dir: 'lower', tol: () => 0.05 },
  { key: 'cpuUsPerReq', label: 'CPU µs/req', dir: 'lower', tol: () => 0.03 },
];

// Noise floor from the REFERENCE rows: targets whose bits are identical in
// both runs (published npm packages, third-party runtimes - everything that is
// not a LOCAL working-tree row). Their movement between the two runs is the
// box moving, not the candidate, so per metric and profile the gate learns
// two numbers from them: the median drift (where the box went) and a robust
// spread (1.4826 x MAD, the sigma of what an unchanged row does between these
// two runs). A candidate row's tolerance widens by the unfavourable part of
// the median plus the spread; it never tightens. Fewer than three reference
// samples give no spread estimate; none give no widening.
function referenceDrift(resultRows, byKey) {
  const samples = new Map();
  const add = (k, v) => {
    if (!samples.has(k)) samples.set(k, []);
    samples.get(k).push(v);
  };
  for (const row of resultRows) {
    if (!isReferenceRow(row)) continue;
    const base = byKey.get(row.key);
    if (!base) continue;
    for (const pr of profiles) {
      const cur = row.byProfile[pr.label];
      const ref = base.byProfile?.[pr.label];
      if (!cur || !ref) continue;
      for (const rule of GATE_RULES) {
        const c = cur[rule.key];
        const b = ref[rule.key];
        if (c != null && b != null && b > 0) add(`${rule.key}|${pr.label}`, (c - b) / b);
      }
    }
    if (row.rssMb != null && base.rssMb != null && base.rssMb > 0) add('rss', (row.rssMb - base.rssMb) / base.rssMb);
  }
  const median = a => {
    const sorted = [...a].sort((x, y) => x - y);
    const m = sorted.length >> 1;
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  };
  const out = new Map();
  for (const [k, v] of samples) {
    const m = median(v);
    const sigma = v.length >= 3 ? 1.4826 * median(v.map(x => Math.abs(x - m))) : 0;
    out.set(k, { median: m, sigma, n: v.length });
  }
  return out;
}

// A reference row's bits did not change between the runs, so it cannot
// regress: its movement is the yardstick, never a breach.
function isReferenceRow(row) {
  const target = TARGETS.find(t => t.key === row.key);
  return !target || !target.requiresPackage;
}

function compareToBaseline(resultRows, baseline) {
  const byKey = new Map((baseline.rows || []).map(r => [r.key, r]));
  const lines = [];
  const breaches = [];
  const floors = referenceDrift(resultRows, byKey);
  // dir 'lower': the box getting slower (positive median) widens; 'higher':
  // the box losing throughput (negative median) widens. The spread always
  // widens: a difference smaller than what unchanged rows show is not
  // resolvable by this pair of runs.
  const widening = (metricKey, label, dir) => {
    const f = floors.get(label ? `${metricKey}|${label}` : 'rss');
    if (!f) return 0;
    const shift = dir === 'lower' ? Math.max(0, f.median) : Math.max(0, -f.median);
    return shift + f.sigma;
  };
  const driftLines = [];
  for (const [k, { median, sigma, n }] of floors) {
    const [metric, label] = k.split('|');
    const name = metric === 'rss' ? 'RSS' : GATE_RULES.find(r => r.key === metric)?.label || metric;
    driftLines.push(`${name}${label ? ` / ${label}` : ''}: ${fmtPct(median * 100)} ±${(sigma * 100).toFixed(1)}% (${n} rows)`);
  }
  for (const row of resultRows) {
    const base = byKey.get(row.key);
    if (!base) {
      lines.push(`| ${row.name} | (not in baseline) |`);
      continue;
    }
    const reference = isReferenceRow(row);
    for (const pr of profiles) {
      const cur = row.byProfile[pr.label];
      const ref = base.byProfile?.[pr.label];
      if (!cur || !ref) continue;
      const cells = [];
      for (const rule of GATE_RULES) {
        const c = cur[rule.key];
        const b = ref[rule.key];
        if (c == null || b == null || !(b > 0)) {
          cells.push(`${rule.label} -`);
          continue;
        }
        const delta = (c - b) / b;
        const tol = rule.tol(ref) + widening(rule.key, pr.label, rule.dir);
        const bad = !reference && (rule.dir === 'higher' ? delta < -tol : delta > tol);
        cells.push(`${rule.label} ${fmtPct(delta * 100)}${bad ? ' ✗' : ''}`);
        if (bad) {
          breaches.push(
            `${row.key} / ${pr.label}: ${rule.label} ${fmtPct(delta * 100)} vs baseline (tolerance ${fmtPct(tol * 100)})`
          );
        }
      }
      lines.push(`| ${row.name}${reference ? ' [ref]' : ''} | ${pr.label} | ${cells.join(' | ')} |`);
    }
    if (row.rssMb != null && base.rssMb != null && base.rssMb > 0) {
      const delta = (row.rssMb - base.rssMb) / base.rssMb;
      // A single post-load RSS sample of the same binary swings ~10% between
      // runs (heap growth timing, TIME_WAIT bookkeeping), so the RSS gate is
      // looser than the throughput/CPU gates
      const rssTol = 0.1 + widening('rssMb', null, 'lower');
      const bad = !reference && delta > rssTol;
      lines.push(`| ${row.name}${reference ? ' [ref]' : ''} | RSS | ${fmtPct(delta * 100)}${bad ? ' ✗' : ''} (${base.rssMb} → ${row.rssMb} MB) |`);
      if (bad) breaches.push(`${row.key}: RSS ${fmtPct(delta * 100)} vs baseline (tolerance ${fmtPct(rssTol * 100)})`);
    }
  }
  return { lines, breaches, driftLines };
}

// ---------------------------------------------------------------------------

const rows = [];
console.log(
  `Running ${wanted.length} benchmark(s): ${wanted.map(t => t.key).join(', ')}\n` +
    `Profiles: ${profiles.map(pr => `${pr.label} [${pr.generator}]`).join(', ')} | ${duration}s per run, ${connections} conns\n` +
    `Moro builds: ${MORO_BUILDS}`
);

if (replayFile) {
  const saved = JSON.parse(readFileSync(resolvePath(replayFile), 'utf8'));
  if (Array.isArray(saved.profiles) && saved.profiles.length) profiles = saved.profiles;
  rows.push(...(saved.rows || []));
  console.log(`\nreplaying ${replayFile} (${saved.date || 'undated'}; ${saved.profileLine || ''}) - no servers started`);
} else for (let i = 0; i < wanted.length; i++) {
  const target = wanted[i];
  process.stdout.write(`\n[${i + 1}/${wanted.length}] ${target.name} ... `);
  const row = await benchTarget(target);
  if (row) {
    const summary = profiles.map(pr => `${fmt(row.byProfile[pr.label]?.reqSec)}`).join(' / ');
    console.log(
      `\n  => ${summary} req/s` +
        (row.latencyAvg != null ? `, ${fmtMs(row.latencyAvg)} avg` : '') +
        (row.cpuUsPerReq != null ? `, ${fmtUs(row.cpuUsPerReq)} cpu/req (${row.cpuPct.toFixed(0)}% of one core)` : '') +
        (row.bytesPerResp != null ? `, ${fmtBytes(row.bytesPerResp)}/resp` : '')
    );
    if (row.errors || row.non2xx) {
      console.log(`  WARNING: ${row.errors} errors / ${row.non2xx} non-2xx responses`);
    }
    rows.push(row);
  }
  if (i < wanted.length - 1 && cooldownSec > 0) {
    process.stdout.write(`  cooling down ${cooldownSec}s...\n`);
    await sleep(cooldownSec * 1000);
  }
}

console.log('');
for (const line of tableLines(rows)) console.log(line);
console.log('');
console.log(`Profile: ${profileLine()}`);

let gateFailed = false;
if (baselineFile && rows.length > 0) {
  let baseline;
  try {
    baseline = JSON.parse(readFileSync(resolvePath(baselineFile), 'utf8'));
  } catch (e) {
    console.error(`Could not read baseline ${baselineFile}: ${e.message}`);
    process.exit(1);
  }
  const { lines, breaches, driftLines } = compareToBaseline(rows, baseline);
  console.log('');
  console.log(`vs baseline ${baselineFile} (${baseline.date || 'undated'}; ${baseline.profileLine || ''})`);
  if (driftLines.length) {
    console.log(`reference drift, unchanged rows [ref] between the two runs (median ±spread; widens the candidate tolerances, never gated): ${driftLines.join('; ')}`);
  }
  for (const line of lines) console.log(line);
  if (breaches.length) {
    console.log('');
    console.log(`${gate ? 'GATE FAILED' : 'Regressions'} (${breaches.length}):`);
    for (const b of breaches) console.log(`  - ${b}`);
    gateFailed = gate;
  } else {
    console.log(gate ? 'GATE PASSED: no regression beyond tolerance' : 'No regressions beyond tolerance');
  }
}

if (flags.save && rows.length > 0) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = join(__dirname, `results-${stamp}.md`);
  const lines = [
    `# Benchmark results - ${new Date().toISOString()}`,
    '',
    `Profile: \`${profileLine()}\``,
    '',
    `Moro builds: \`${MORO_BUILDS}\``,
    '',
    ...tableLines(rows),
    '',
    'CPU µs/req = server process-tree CPU time (user+system, all threads) during the run ÷ requests counted by the generator, from the no-pipelining profile. bytes/resp = bytes the generator read ÷ responses (wire size). RSS = process tree sampled right after load (a thread-clustered server is one process).',
    '',
  ];
  writeFileSync(outFile, lines.join('\n'));
  const jsonFile = join(__dirname, `results-${stamp}.json`);
  writeFileSync(
    jsonFile,
    JSON.stringify(
      {
        schema: 1,
        date: new Date().toISOString(),
        profileLine: profileLine(),
        profiles: profiles.map(pr => ({ label: pr.label, p: pr.p, rate: pr.rate, keepalive: pr.keepalive, generator: pr.generator })),
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu: os.cpus()[0]?.model || null,
        moroBuilds: MORO_BUILDS,
        duration,
        connections,
        runs,
        quick,
        rows,
      },
      null,
      2
    )
  );
  console.log(`Saved: ${outFile}\nSaved: ${jsonFile}`);
}

if (gateFailed) process.exit(1);
