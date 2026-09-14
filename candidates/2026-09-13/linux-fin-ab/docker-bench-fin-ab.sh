#!/usr/bin/env bash
# Cross-generator survey on Linux: wrk, oha, bombardier, autocannon x
# {plain keep-alive, fixed rate 20k, keep-alive off} x {raw engine, MoroJS on
# engine, raw Bun, raw uWS}, with perf stat (instructions, cycles, syscalls
# per request) where the VM allows it. node:24-trixie so the uWS binary loads;
# --privileged for perf tracepoints.
set -u
BENCH="/Users/chrism/My Projects/MoroJS Benchmark"
ENGINE="/Users/chrism/My Projects/MoroJS Engine"
MOROJS="/Users/chrism/My Projects/MoroJS"
OUT="<out-dir>"
mkdir -p "$OUT"
docker run --rm --privileged --security-opt seccomp=unconfined \
  -v "$BENCH:/src/bench:ro" -v "$ENGINE:/src/engine" -v "$MOROJS:/src/MoroJS:ro" -v "$OUT:/out" -w /work \
  node:24-trixie bash -c '
    set -u
    apt-get update -qq >/dev/null && apt-get install -y -qq clang lld llvm curl rsync wrk unzip procps linux-perf strace >/dev/null 2>&1
    ARCH=$(uname -m); case "$ARCH" in aarch64) A=arm64;; x86_64) A=amd64;; esac
    curl -sL https://github.com/hatoo/oha/releases/download/v1.16.0/oha-linux-$A -o /usr/local/bin/oha && chmod +x /usr/local/bin/oha
    curl -sL https://github.com/codesenberg/bombardier/releases/download/v1.2.6/bombardier-linux-$A -o /usr/local/bin/bombardier && chmod +x /usr/local/bin/bombardier
    (curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 && ln -s /root/.bun/bin/bun /usr/local/bin/bun) || echo "bun install failed (rows skipped)"
    uname -r; nproc; ldd --version | head -1; oha --version; bombardier --version 2>&1 | head -1; bun --version 2>/dev/null || true
    perf --version 2>&1 | head -1; cat /proc/sys/kernel/perf_event_paranoid; ls /sys/kernel/tracing/events/syscalls 2>/dev/null | head -2 || echo "no tracefs"
    mkdir -p /work/bench /work/MoroJS
    rsync -a --exclude node_modules --exclude .git /src/bench/ /work/bench/
    rsync -a --exclude node_modules --exclude dist --exclude .git /src/MoroJS/ /work/MoroJS/
    (cd /src/engine && node tools/build.mjs 2>&1 | tail -1)
    (cd /work/MoroJS && npm ci --no-audit --no-fund 2>&1 | tail -1 && rm -rf node_modules/@morojs/engine node_modules/@morojs/engine-* && ln -s /src/engine/packages/engine node_modules/@morojs/engine && npm run build 2>&1 | tail -1)
    cd /work/bench && npm ci --no-audit --no-fund 2>&1 | tail -1
    rm -rf node_modules/moro-local node_modules/engine-local
    ln -s /work/MoroJS node_modules/moro-local
    ln -s /src/engine/packages/engine node_modules/engine-local
    node -e "const e=require(\"engine-local\"); const p=e.probe(); console.log(\"engine-local\", p.version, p.transport, p.transportReason, \"batch\", p.capabilities.batchDispatch, \"fast\", p.fastApi && p.fastApi.installed)"
    # FIN policy A/B on Linux: coalesced (current) vs separate segment, engine
    # rows against uWS, keep-alive-off only, oha + bombardier, rotated rounds.
    for ROUND in 1 2 3; do
      case $ROUND in 1) ROWS="raw-engine-local engine-local raw-uws";; 2) ROWS="raw-uws engine-local raw-engine-local";; 3) ROWS="engine-local raw-uws raw-engine-local";; esac
      for G in oha bombardier; do
        for FIN in coalesced separate; do
          echo "################ round=$ROUND generator=$G fin=$FIN"
          MORO_ENGINE_FIN=$FIN node bench.js $ROWS --keepalive=off --generator=$G --runs=2 --duration=10 --save 2>&1 | grep -E "^\[|=> |best:|Saved:|WARNING|skipp|stderr|NOTE"
          mkdir -p /out/$FIN && mv -f results-*.json results-*.md /out/$FIN/ 2>/dev/null
        done
      done
    done
    cp -f results-*.json results-*.md /out/ 2>/dev/null; ls /out
  ' > "$OUT/bench-linux-fin-ab.log" 2>&1
echo "bench-linux-fin-ab exit $?"
