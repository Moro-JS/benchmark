#!/usr/bin/env bash
# Linux benchmark matrix in a dedicated container (8 vCPU VM): the Benchmark
# harness with wrk + oha, the local MoroJS (1.9.0 candidate, built in the
# container) and the local engine (Linux binary), libuv default and io_uring
# opt-in, plus raw node:http and raw uWS for scale. Bun rows if the Bun
# installer works on this arch.
set -u
BENCH="/Users/chrism/My Projects/MoroJS Benchmark"
ENGINE="/Users/chrism/My Projects/MoroJS Engine"
MOROJS="/Users/chrism/My Projects/MoroJS"
OUT="/private/tmp/claude-501/-Users-chrism-My-Projects-MoroJS/d05dc5b1-ba86-47e2-aae5-4c978e2951e5/scratchpad/docker-lanes"
mkdir -p "$OUT"
docker run --rm --security-opt seccomp=unconfined \
  -v "$BENCH:/src/bench:ro" -v "$ENGINE:/src/engine" -v "$MOROJS:/src/MoroJS:ro" -w /work \
  node:24-bookworm bash -c '
    set -u
    apt-get update -qq >/dev/null && apt-get install -y -qq clang lld llvm curl rsync wrk unzip >/dev/null 2>&1
    ARCH=$(uname -m); case "$ARCH" in aarch64) A=arm64;; x86_64) A=amd64;; esac
    curl -sL https://github.com/hatoo/oha/releases/download/v1.16.0/oha-linux-$A -o /usr/local/bin/oha && chmod +x /usr/local/bin/oha
    (curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 && ln -s /root/.bun/bin/bun /usr/local/bin/bun) || echo "bun install failed (rows skipped)"
    uname -r; nproc; wrk --version 2>&1 | head -1; oha --version; bun --version 2>/dev/null || true
    # dedicated copies: benchmark harness + MoroJS candidate (built here)
    mkdir -p /work/bench /work/MoroJS
    rsync -a --exclude node_modules --exclude .git /src/bench/ /work/bench/
    rsync -a --exclude node_modules --exclude dist --exclude .git /src/MoroJS/ /work/MoroJS/
    (cd /src/engine && node tools/build.mjs 2>&1 | tail -1)
    (cd /work/MoroJS && npm ci --no-audit --no-fund 2>&1 | tail -1 && rm -rf node_modules/@morojs/engine node_modules/@morojs/engine-* && ln -s /src/engine/packages/engine node_modules/@morojs/engine && npm run build 2>&1 | tail -1)
    cd /work/bench && npm ci --no-audit --no-fund 2>&1 | tail -1
    rm -rf node_modules/moro-local node_modules/engine-local
    ln -s /work/MoroJS node_modules/moro-local
    ln -s /src/engine/packages/engine node_modules/engine-local
    node -e "const e=require(\"engine-local\"); const p=e.probe(); console.log(\"engine-local\", p.version, p.transport, p.transportReason, \"batch\", p.capabilities.batchDispatch)"
    node -e "console.log(\"moro-local\", require(\"moro-local/package.json\").version)"
    for T in uv uring; do
      echo "################ MORO_ENGINE_TRANSPORT=$T"
      MORO_ENGINE_TRANSPORT=$T node bench.js raw-engine-local engine-local cluster-local --pipelined --rate=20000 --keepalive=off --runs=3 --duration=15 --save 2>&1 | grep -E "^\[|=> |run [0-9]/3:|best:|Saved:|WARNING|transport|threads|workers"
    done
    echo "################ reference rows"
    node bench.js raw-node raw-uws raw-bun elysia-bun --pipelined --rate=20000 --keepalive=off --runs=3 --duration=15 --save 2>&1 | grep -E "^\[|=> |best:|Saved:|WARNING|skipp"
    mkdir -p /src/engine/build/bench-linux && cp -f results-*.json results-*.md /src/engine/build/bench-linux/ 2>/dev/null; ls /src/engine/build/bench-linux/
  ' > "$OUT/bench-linux.log" 2>&1
echo "bench-linux exit $?"; grep -v "^$\|debconf" "$OUT/bench-linux.log" | tail -80
