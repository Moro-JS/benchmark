#!/usr/bin/env node

// MoroJS benchmark runner - boots a server, waits for readiness, runs load
// profiles, samples memory, tears down, prints a paste-ready table.
//
// Usage:
//   node bench.js all                # every target, realistic profile, cooldowns
//   node bench.js uws                # a single target (best-of-3)
//   node bench.js single fastify     # any subset
//   node bench.js uws --pipelined    # ALSO run the pipelining microbenchmark
//   node bench.js uws --runs=5       # override the repeat count
//   node bench.js all --quick        # 10s runs (sanity checks; publish 40s runs)
//   node bench.js all --save         # also write results-<timestamp>.md
//   node bench.js uws --generator=autocannon   # force a specific generator
//
// Flags: --quick --runs=N --settle=3 --warmup[=5] --duration=40
//        --connections=100 --pipelined --pipelining=N --cooldown=8 --save
//        --generator=wrk|oha|bombardier|autocannon
//
// Profiles: DEFAULT is "no pipelining" - the production-representative shape.
//   HTTP/1.1 pipelining is effectively dead in the real world (browsers
//   disabled it, HTTP/2 multiplexing replaced it, fetch/clients/LBs don't do
//   it), so it does NOT represent production traffic. `--pipelined` adds a
//   second, clearly-labeled column measuring pipelined x10 - a microbenchmark
//   that isolates raw server request-processing cost by removing client
//   round-trips. Useful as a diagnostic; never the headline.
//   NOTE: on a single machine over loopback, the realistic (no-pipelining)
//   profile is often bounded by the client/loopback rather than the server,
//   so fast servers converge. Real server-vs-server differences need a
//   dedicated load machine (or higher --connections) to surface honestly.
//
// Load generators (native tools are stronger than a Node-based generator and
// are preferred automatically when installed; autocannon is the always-there
// fallback since it ships as a dependency of this repo):
//   preference: wrk > oha > bombardier > autocannon
//   - wrk        native (C), supports pipelining via a generated Lua script
//   - oha        native (Rust), NO pipelining - only eligible for p1 profiles
//   - bombardier native (Go), NO pipelining - only eligible for p1 profiles
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
//   NOT idle memory. State this if you publish it.

import { spawn, execSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import os from 'node:os';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTOCANNON_BIN = createRequire(import.meta.url).resolve('autocannon/autocannon.js');

// Which MoroJS builds are present - printed with every table so a result can
// never be ambiguous about what it measured
function moroBuildInfo() {
  const parts = [];
  try {
    const v = JSON.parse(
      readFileSync(join(__dirname, 'node_modules/@morojs/moro/package.json'), 'utf8')
    ).version;
    parts.push(`npm @morojs/moro@${v}`);
  } catch {
    parts.push('@morojs/moro not installed');
  }
  try {
    const pkgPath = join(__dirname, 'node_modules/moro-local/package.json');
    const v = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
    const realDir = realpathSync(join(__dirname, 'node_modules/moro-local'));
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
    parts.push(`local moro-local@${v}${git} (${realDir})`);
  } catch {
    // local build not linked - *-local targets will skip
  }
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
const PIPELINE_DEPTH = 10;
let profiles;
if (flags.pipelining !== undefined) {
  const p = parseInt(flags.pipelining, 10);
  profiles = [{ label: p > 1 ? `pipelined x${p} (microbench)` : 'no pipelining', p }];
} else if (flags.pipelined) {
  profiles = [
    { label: 'no pipelining', p: 1 },
    { label: `pipelined x${PIPELINE_DEPTH} (microbench)`, p: PIPELINE_DEPTH },
  ];
} else {
  profiles = [{ label: 'no pipelining', p: 1 }];
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
// Load generator selection
// ---------------------------------------------------------------------------

const GENERATOR_PRIORITY = ['wrk', 'oha', 'bombardier', 'autocannon'];
// Only wrk (via Lua script) and autocannon can pipeline requests
const PIPELINE_CAPABLE = new Set(['wrk', 'autocannon']);

const needsPipelining = profiles.some(pr => pr.p > 1);

function selectGenerator() {
  const forced = typeof flags.generator === 'string' ? flags.generator : null;
  if (forced) {
    if (!GENERATOR_PRIORITY.includes(forced)) {
      console.error(`Unknown generator '${forced}'. Options: ${GENERATOR_PRIORITY.join(', ')}`);
      process.exit(1);
    }
    if (forced !== 'autocannon' && !which(forced)) {
      console.error(`--generator=${forced} requested but '${forced}' is not installed`);
      process.exit(1);
    }
    return forced;
  }
  for (const g of GENERATOR_PRIORITY) {
    if (g === 'autocannon') return g;
    if (needsPipelining && !PIPELINE_CAPABLE.has(g)) continue;
    if (which(g)) return g;
  }
  return 'autocannon';
}

const generator = selectGenerator();

// A forced non-pipelining generator drops the pipelined profile rather than
// silently measuring something else
if (needsPipelining && !PIPELINE_CAPABLE.has(generator)) {
  console.warn(`NOTE: ${generator} does not support HTTP pipelining - pipelined profile skipped`);
  profiles = profiles.filter(pr => pr.p === 1);
  if (profiles.length === 0) {
    console.error('No runnable profiles with this generator.');
    process.exit(1);
  }
}

// wrk needs a Lua script to pipeline; generate one per depth per invocation
const wrkLuaByDepth = new Map();
function getWrkPipelineLua(depth) {
  if (!wrkLuaByDepth.has(depth)) {
    const luaPath = join(tmpdir(), `moro-bench-pipeline-${process.pid}-${depth}.lua`);
    writeFileSync(
      luaPath,
      [
        'init = function(args)',
        `  local depth = ${depth}`,
        '  local r = {}',
        '  for i = 1, depth do r[i] = wrk.format() end',
        '  req = table.concat(r)',
        'end',
        'request = function() return req end',
        '',
      ].join('\n')
    );
    wrkLuaByDepth.set(depth, luaPath);
  }
  return wrkLuaByDepth.get(depth);
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

// All generator adapters normalize to:
//   { reqSec, latAvgMs, latP99Ms|null, errors, non2xx }

async function runWrk(port, durationSec, p) {
  const threads = Math.min(8, Math.max(4, Math.floor((os.availableParallelism?.() || 8) / 2)));
  const cliArgs = [
    '-t', String(threads),
    '-c', String(connections),
    '-d', `${durationSec}s`,
    '--latency',
  ];
  if (p > 1) cliArgs.push('-s', getWrkPipelineLua(p));
  cliArgs.push(`http://127.0.0.1:${port}/`);

  const out = await spawnCollect(which('wrk'), cliArgs);

  const reqSec = parseFloat(out.match(/Requests\/sec:\s+([\d.]+)/)?.[1] ?? 'NaN');
  const latAvg = out.match(/Latency\s+([\d.]+)(us|ms|s|m)/);
  const latP99 = out.match(/99%\s+([\d.]+)(us|ms|s|m)/);
  const non2xx = parseInt(out.match(/Non-2xx or 3xx responses:\s+(\d+)/)?.[1] ?? '0', 10);
  const sockErr = out.match(/Socket errors: connect (\d+), read (\d+), write (\d+), timeout (\d+)/);
  const errors = sockErr ? sockErr.slice(1, 5).reduce((a, b) => a + parseInt(b, 10), 0) : 0;

  if (!Number.isFinite(reqSec)) throw new Error(`could not parse wrk output:\n${out.slice(0, 400)}`);
  // wrk's per-request latency accounting is unreliable under pipelining
  // (it times batches, not individual responses) - don't report it
  const latencyMeaningful = p === 1;
  return {
    reqSec,
    latAvgMs: latencyMeaningful && latAvg ? toMs(latAvg[1], latAvg[2]) : null,
    latP99Ms: latencyMeaningful && latP99 ? toMs(latP99[1], latP99[2]) : null,
    errors,
    non2xx,
  };
}

async function runOha(port, durationSec) {
  const out = await spawnCollect(which('oha'), [
    '-z', `${durationSec}s`,
    '-c', String(connections),
    '--no-tui',
    '--output-format', 'json',
    `http://127.0.0.1:${port}/`,
  ]);
  const j = JSON.parse(out);
  const statusDist = j.statusCodeDistribution || {};
  let non2xx = 0;
  for (const code in statusDist) {
    if (code < '200' || code >= '300') non2xx += statusDist[code];
  }
  return {
    reqSec: j.summary.requestsPerSec,
    latAvgMs: j.summary.average * 1000, // oha reports seconds
    latP99Ms: (j.latencyPercentiles?.p99 ?? null) === null ? null : j.latencyPercentiles.p99 * 1000,
    errors: 0,
    non2xx,
  };
}

async function runBombardier(port, durationSec) {
  const out = await spawnCollect(which('bombardier'), [
    '-c', String(connections),
    '-d', `${durationSec}s`,
    '-l',
    '-p', 'r',
    '-o', 'json',
    `http://127.0.0.1:${port}/`,
  ]);
  const r = JSON.parse(out).result;
  const p99 = r.latency?.percentiles?.['99'];
  return {
    reqSec: r.rps.mean,
    latAvgMs: r.latency.mean / 1000, // bombardier reports microseconds
    latP99Ms: p99 != null ? p99 / 1000 : null,
    errors: r.others || 0,
    non2xx: (r.req4xx || 0) + (r.req5xx || 0),
  };
}

async function runAutocannon(port, durationSec, p) {
  const out = await spawnCollect(process.execPath, [
    AUTOCANNON_BIN,
    '-c', String(connections),
    '-d', String(durationSec),
    '-p', String(p),
    '--json',
    `http://127.0.0.1:${port}`,
  ]);
  const j = JSON.parse(out);
  return {
    reqSec: j.requests.average,
    latAvgMs: j.latency.average,
    latP99Ms: j.latency.p99 ?? null,
    errors: j.errors || 0,
    non2xx: j.non2xx || 0,
  };
}

function runLoad(port, durationSec, p) {
  if (generator === 'wrk') return runWrk(port, durationSec, p);
  if (generator === 'oha') return runOha(port, durationSec);
  if (generator === 'bombardier') return runBombardier(port, durationSec);
  return runAutocannon(port, durationSec, p);
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

function processTreeRssMb(pid) {
  try {
    const pids = [pid];
    // Collect children (cluster workers) - best effort, unix only
    try {
      const kids = execSync(`pgrep -P ${pid}`, { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(Number);
      pids.push(...kids);
    } catch {
      // no children
    }
    let totalKb = 0;
    for (const p of pids) {
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
// (wrong version, wrong state) would be benchmarked instead of ours
function portOccupiedBy(port) {
  try {
    const pid = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim().split('\n')[0];
    return pid || null;
  } catch {
    return null; // lsof exits non-zero when the port is free
  }
}

function resolveRuntime(target) {
  if (!target.runtime || target.runtime === 'node') return process.execPath;
  return which(target.runtime);
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
    console.log(
      `skipped - requires '${target.requiresPackage}' (link the local build first: npm run local:link)`
    );
    return null;
  }

  const squatter = portOccupiedBy(target.port);
  if (squatter) {
    console.error(
      `skipped - port ${target.port} is already in use by pid ${squatter} ` +
        `(kill it first: kill ${squatter}). Refusing to measure an unknown server.`
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
    stdio: 'ignore',
    detached: true, // own process group so cluster workers die with the primary
  });
  liveChildren.add(child);

  try {
    const ready = await waitForReady(target.port);
    if (!ready) {
      console.error(`  ${target.name}: server failed to become ready - skipped`);
      return null;
    }

    // Idle settle: clustering finishes forking, boot logging flushes, GC
    // settles - mirrors the pause before a manual generator invocation
    await sleep(settleSec * 1000);

    if (warmupSec > 0) {
      await runLoad(target.port, warmupSec, 1);
      await sleep(2000); // let TIME_WAIT/GC from the warmup drain
    }

    const row = {
      name: target.name,
      key: target.key,
      byProfile: {}, // label -> best reqSec
      latencyAvg: null,
      latencyP99: null,
      rssMb: null,
      errors: 0,
      non2xx: 0,
    };

    for (const profile of profiles) {
      let best = null;
      for (let run = 0; run < runs; run++) {
        if (run > 0) await sleep(3000);
        const r = await runLoad(target.port, duration, profile.p);
        if (!best || r.reqSec > best.reqSec) best = r;
        if (runs > 1) {
          process.stdout.write(`\n    ${profile.label} run ${run + 1}/${runs}: ${fmt(r.reqSec)} req/s`);
        }
      }
      row.byProfile[profile.label] = best.reqSec;
      row.errors = Math.max(row.errors, best.errors);
      row.non2xx = Math.max(row.non2xx, best.non2xx);
      // Latency columns come from the no-pipelining profile, where
      // per-request latency is actually meaningful
      if (profile.p === 1 || row.latencyAvg === null) {
        if (best.latAvgMs != null) {
          row.latencyAvg = best.latAvgMs;
          row.latencyP99 = best.latP99Ms;
        }
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

function profileLine() {
  const profileDesc = profiles.map(pr => pr.label).join(' + ');
  return `${generator} -c ${connections} -d ${duration} | ${profileDesc}${runs > 1 ? ` | best of ${runs} runs` : ''} | node ${process.version} | ${process.platform}/${process.arch}${quick ? ' | QUICK RUN - do not publish' : ''}`;
}

function tableLines(resultRows) {
  const profileCols = profiles.map(pr => `Req/sec (${pr.label})`);
  const header = `| Server | ${profileCols.join(' | ')} | Latency avg | Latency p99 | RSS under load |`;
  const divider = `|--------|${profileCols.map(() => '---------------').join('|')}|-------------|-------------|----------------|`;
  return [
    header,
    divider,
    ...resultRows.map(
      r =>
        `| ${r.name} | ${profiles.map(pr => fmt(r.byProfile[pr.label])).join(' | ')} | ${fmtMs(r.latencyAvg)} | ${fmtMs(r.latencyP99)} | ${r.rssMb ? `${r.rssMb} MB` : '-'} |`
    ),
  ];
}

const rows = [];
console.log(
  `Running ${wanted.length} benchmark(s): ${wanted.map(t => t.key).join(', ')}\n` +
    `Generator: ${generator} | profiles: ${profiles.map(pr => pr.label).join(', ')} | ${duration}s per run, ${connections} conns\n` +
    `Moro builds: ${MORO_BUILDS}`
);

for (let i = 0; i < wanted.length; i++) {
  const target = wanted[i];
  process.stdout.write(`\n[${i + 1}/${wanted.length}] ${target.name} ... `);
  const row = await benchTarget(target);
  if (row) {
    const summary = profiles.map(pr => `${fmt(row.byProfile[pr.label])}`).join(' / ');
    console.log(`\n  => ${summary} req/s${row.latencyAvg != null ? `, ${fmtMs(row.latencyAvg)} avg` : ''}`);
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
  ];
  writeFileSync(outFile, lines.join('\n'));
  console.log(`Saved: ${outFile}`);
}
