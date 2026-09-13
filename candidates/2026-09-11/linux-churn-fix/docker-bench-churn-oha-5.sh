#!/usr/bin/env bash
# Five-run churn head-to-head (second pass of the cross-check) with oha (--disable-keepalive), the generator
# that closes after every response regardless of what the server answers:
# wrk's keep-alive-off profile relies on the server echoing `Connection:
# close`, and Bun / uWS do not, so under wrk they pay one failed request +
# read error per connection. node:24-trixie (glibc 2.41) so the uWS binary
# loads; engine + MoroJS built in the container as in docker-bench.sh.
set -u
BENCH="/Users/chrism/My Projects/MoroJS Benchmark"
ENGINE="/Users/chrism/My Projects/MoroJS Engine"
MOROJS="/Users/chrism/My Projects/MoroJS"
OUT="<out-dir>"
mkdir -p "$OUT"
docker run --rm --security-opt seccomp=unconfined \
  -v "$BENCH:/src/bench:ro" -v "$ENGINE:/src/engine" -v "$MOROJS:/src/MoroJS:ro" -v "$OUT:/out" -w /work \
  node:24-trixie bash -c '
    set -u
    apt-get update -qq >/dev/null && apt-get install -y -qq clang lld llvm curl rsync wrk unzip procps >/dev/null 2>&1
    ARCH=$(uname -m); case "$ARCH" in aarch64) A=arm64;; x86_64) A=amd64;; esac
    curl -sL https://github.com/hatoo/oha/releases/download/v1.16.0/oha-linux-$A -o /usr/local/bin/oha && chmod +x /usr/local/bin/oha
    (curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1 && ln -s /root/.bun/bin/bun /usr/local/bin/bun) || echo "bun install failed (rows skipped)"
    uname -r; nproc; ldd --version | head -1; oha --version; bun --version 2>/dev/null || true
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
    echo "################ churn cross-check, generator=oha, keep-alive off"
    node bench.js raw-engine-local raw-bun engine-local raw-uws --keepalive=off --generator=oha --runs=5 --duration=15 --save 2>&1 | grep -E "^\[|=> |run [0-9]/5:|best:|Saved:|WARNING|skipp|stderr|threads|workers"
    cp -f results-*.json results-*.md /out/ 2>/dev/null; ls /out
  ' > "$OUT/bench-linux-churn-oha-5.log" 2>&1
echo "bench-linux-churn-oha-5 exit $?"
