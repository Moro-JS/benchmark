#!/usr/bin/env bash
# Pinned-core profile: raw @morojs/engine vs raw uWebSockets.js with the
# server hard-pinned to one dedicated core (taskset -c 0) and the load
# generator pinned to cores 2+, so the server owns 100% of exactly one core
# and never shares it with the client. Community-requested methodology
# (Aug 2026) — see pinned/README.md for results and caveats.
#
# Linux-only (macOS has no CPU-affinity API); on other hosts it re-runs
# itself inside a Linux container via Docker, installing both packages fresh
# from their registries so the result describes what is published, not a
# local build. Prints per-run receipts: package versions, the server's
# actual affinity mask, and mid-run core saturation.
set -euo pipefail
cd "$(dirname "$0")"

export DURATION="${DURATION:-10}"
export RUNS="${RUNS:-3}"
export DEPTH="${DEPTH:-10}"

if [ "$(uname -s)" != "Linux" ]; then
  command -v docker >/dev/null 2>&1 || {
    echo "this profile needs Linux (taskset) or Docker to provide one" >&2
    exit 1
  }
  exec docker run --rm \
    -v "$(cd .. && pwd)":/bench:ro \
    -e DURATION -e RUNS -e DEPTH -e PINNED_IN_CONTAINER=1 \
    node:24-trixie bash /bench/pinned/run.sh
fi

if [ "${PINNED_IN_CONTAINER:-}" = "1" ]; then
  export DEBIAN_FRONTEND=noninteractive
  echo "container setup: apt (wrk) + fresh npm install of both packages..."
  apt-get update -qq >/dev/null && apt-get install -y -qq wrk procps git >/dev/null
  mkdir -p /work && cd /work
  npm init -y >/dev/null
  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));p.type='module';fs.writeFileSync('package.json',JSON.stringify(p,null,2))"
  npm i --no-audit --no-fund @morojs/engine 'uNetworking/uWebSockets.js#semver:^v20.52.0' >/dev/null
  # servers are copied next to /work/node_modules: ESM imports resolve by
  # walking up from the file's own directory (NODE_PATH is ignored for ESM),
  # and the mounted repo's node_modules holds host-platform binaries
  cp /bench/servers/raw-engine-server.js /bench/servers/raw-uws-server.js /work/
  SRVDIR=/work
  MODDIR=/work/node_modules
else
  # Native Linux: use the repo checkout. Run `npm install` at the repo root
  # and install wrk (apt install wrk) first.
  command -v wrk >/dev/null 2>&1 || { echo "install wrk first (apt install wrk)" >&2; exit 1; }
  command -v taskset >/dev/null 2>&1 || { echo "taskset (util-linux) is required" >&2; exit 1; }
  [ -d ../node_modules/@morojs/engine ] || { echo "run npm install at the repo root first" >&2; exit 1; }
  SRVDIR=$(cd ../servers && pwd)
  MODDIR=$(cd ../node_modules && pwd)
fi

NCPU=$(nproc)
[ "$NCPU" -ge 4 ] || { echo "need >=4 cores for meaningful isolation (have $NCPU)" >&2; exit 1; }
CLIENT_CPUS="2-$((NCPU - 1))"
WRK_THREADS=$(( NCPU - 2 < 8 ? NCPU - 2 : 8 ))

NODE_PATH_DIR=$MODDIR node -e "
  const fs = require('fs');
  const v = p => JSON.parse(fs.readFileSync(process.env.NODE_PATH_DIR + '/' + p + '/package.json')).version;
  console.log('engine ' + v('@morojs/engine') + ' / uws ' + v('uWebSockets.js') + ' / node ' + process.version + ' / ' + process.arch);
"
echo "engine core: 0 | uws core: 1 | client cores: $CLIENT_CPUS (wrk -t$WRK_THREADS -c100 -d$DURATION, ABBA-interleaved, best of $RUNS)"

LUA=$(mktemp /tmp/pinned-pipe-XXXXXX.lua)
# the request must be built inside init() — after wrk applies the URL's Host —
# or spec-strict servers reject the Host-less requests with 400 + close
cat > "$LUA" <<EOF
init = function(args)
  local r = {}
  for i = 1, $DEPTH do r[i] = wrk.format() end
  req = table.concat(r)
end
request = function() return req end
EOF
trap 'rm -f "$LUA"' EXIT

cpu_pct() { # instantaneous saturation: utime+stime delta over 2s vs one core
  local pid=$1 hz t0 t1
  hz=$(getconf CLK_TCK)
  t0=$(awk '{print $14 + $15}' "/proc/$pid/stat")
  sleep 2
  t1=$(awk '{print $14 + $15}' "/proc/$pid/stat")
  awk -v a="$t0" -v b="$t1" -v hz="$hz" 'BEGIN{printf "%.0f", (b - a) / 2 / hz * 100}'
}

bench() { # $1: extra wrk args; prints rps
  # shellcheck disable=SC2086
  taskset -c "$CLIENT_CPUS" wrk -t"$WRK_THREADS" -c100 -d"$DURATION" $1 "http://127.0.0.1:$PORT/" |
    awk '/Requests\/sec/{print $2}'
}

# Both servers run for the whole session on their own dedicated cores
# (engine core 0, uws core 1, client cores 2+), and every run index bench-
# marks the two back to back in alternating order (ABBA). A fixed order
# would hand whichever server runs later the benefit — or cost — of any
# host drift (thermals, background load, VM scheduling) accumulated during
# the session; alternation cancels that instead of hiding it.
start_server() { # $1: name, $2: server file, $3: port, $4: core -> START_PID
  local name=$1 file=$2 port=$3 core=$4
  PORT=$port NODE_ENV=production taskset -c "$core" node "$SRVDIR/$file" >/dev/null 2>&1 &
  START_PID=$!
  sleep 1.5
  kill -0 "$START_PID" 2>/dev/null || { echo "[$name] server failed to start" >&2; exit 1; }
}

receipt() { # $1: name, $2: port, $3: pid — warmup doubles as saturation receipt
  local name=$1 port=$2 pid=$3 wpid
  taskset -c "$CLIENT_CPUS" wrk -t"$WRK_THREADS" -c100 -d6 "http://127.0.0.1:$port/" >/dev/null 2>&1 &
  wpid=$!
  sleep 1
  echo "[$name] affinity: core $(taskset -pc "$pid" | awk '{print $NF}') | mid-run saturation: $(cpu_pct "$pid")% of one core"
  wait "$wpid" 2>/dev/null || true
}

start_server engine raw-engine-server.js 3128 0
E_PID=$START_PID
start_server uws raw-uws-server.js 3121 1
U_PID=$START_PID
receipt engine 3128 "$E_PID"
receipt uws 3121 "$U_PID"

bench_side() { # $1: side, $2: run index, $3: profile label, $4: extra wrk args -> RPS
  local port=3128
  [ "$1" = uws ] && port=3121
  RPS=$(PORT=$port bench "$4")
  echo "  $1 $3 run$2: $RPS rps"
}

E_PLAIN=0 U_PLAIN=0 E_PIPE=0 U_PIPE=0
for i in $(seq 1 "$RUNS"); do
  order="engine uws"
  [ $((i % 2)) -eq 0 ] && order="uws engine"
  for side in $order; do
    bench_side "$side" "$i" plain ""
    if [ "$side" = engine ]; then
      E_PLAIN=$(awk -v a="$E_PLAIN" -v b="$RPS" 'BEGIN{print (b > a) ? b : a}')
    else
      U_PLAIN=$(awk -v a="$U_PLAIN" -v b="$RPS" 'BEGIN{print (b > a) ? b : a}')
    fi
  done
done
for i in $(seq 1 "$RUNS"); do
  order="engine uws"
  [ $((i % 2)) -eq 0 ] && order="uws engine"
  for side in $order; do
    bench_side "$side" "$i" "pipe$DEPTH" "-s $LUA"
    if [ "$side" = engine ]; then
      E_PIPE=$(awk -v a="$E_PIPE" -v b="$RPS" 'BEGIN{print (b > a) ? b : a}')
    else
      U_PIPE=$(awk -v a="$U_PIPE" -v b="$RPS" 'BEGIN{print (b > a) ? b : a}')
    fi
  done
done
kill "$E_PID" "$U_PID" 2>/dev/null || true
wait "$E_PID" "$U_PID" 2>/dev/null || true

echo
echo "== pinned-core summary (best of $RUNS) =="
awk -v ep="$E_PLAIN" -v up="$U_PLAIN" -v ei="$E_PIPE" -v ui="$U_PIPE" 'BEGIN{
  printf "plain:          engine %12.0f rps | uws %12.0f rps | engine %+.1f%%\n", ep, up, (ep/up - 1) * 100
  printf "pipelined:      engine %12.0f rps | uws %12.0f rps | engine %+.1f%%\n", ei, ui, (ei/ui - 1) * 100
}'
