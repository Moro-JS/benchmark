#!/usr/bin/env bash
# raw uWebSockets.js reference row on Linux: uWS 20.69's linux binaries need
# glibc >= 2.38, so this row runs in node:24-trixie (glibc 2.41) instead of the
# bookworm image (2.36) the other Linux rows used. Same VM, same kernel, same
# harness flags as docker-bench.sh's reference-row pass.
set -u
BENCH="/Users/chrism/My Projects/MoroJS Benchmark"
OUT="<out-dir>"
mkdir -p "$OUT/uws-results"
docker run --rm -v "$BENCH:/src/bench:ro" -v "$OUT/uws-results:/out" -w /work node:24-trixie bash -c '
    set -u
    apt-get update -qq >/dev/null && apt-get install -y -qq curl rsync wrk procps >/dev/null 2>&1
    ARCH=$(uname -m); case "$ARCH" in aarch64) A=arm64;; x86_64) A=amd64;; esac
    curl -sL https://github.com/hatoo/oha/releases/download/v1.16.0/oha-linux-$A -o /usr/local/bin/oha && chmod +x /usr/local/bin/oha
    uname -r; nproc; ldd --version | head -1; wrk --version 2>&1 | head -1; oha --version
    mkdir -p /work/bench
    rsync -a --exclude node_modules --exclude .git /src/bench/ /work/bench/
    cd /work/bench && npm ci --no-audit --no-fund 2>&1 | tail -1
    node -e "const u=require(\"uWebSockets.js\"); console.log(\"uws\", require(\"uWebSockets.js/package.json\").version, typeof u.App)"
    echo "################ reference row: raw-uws (trixie)"
    node bench.js raw-uws --pipelined --rate=20000 --keepalive=off --runs=3 --duration=15 --save 2>&1 | grep -E "^\[|=> |run [0-9]/3:|best:|Saved:|WARNING|skipp|stderr|^\| "
    cp -f results-*.json results-*.md /out/ 2>/dev/null; ls /out
  ' > "$OUT/bench-linux-uws.log" 2>&1
echo "bench-linux-uws exit $?"
