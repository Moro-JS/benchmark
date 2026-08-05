#!/usr/bin/env bash
# Run uNetworking's h1spec HTTP/1.1 compliance suite (unmodified, pinned)
# against @morojs/engine — raw, and under the full MoroJS framework.
# Exits non-zero unless BOTH subjects pass 33/33.
set -euo pipefail
cd "$(dirname "$0")"

# h1spec has no license file (all rights reserved), so it is cloned at run
# time rather than vendored. Pinned so upstream changes can't move the bar
# under us; bump deliberately.
H1SPEC_REPO=https://github.com/uNetworking/h1spec.git
H1SPEC_SHA=f0a5650a20c575fbea0f7179a3a9cfa50f20ba6e

if [ ! -d h1spec/.git ]; then
  git clone -q "$H1SPEC_REPO" h1spec
fi
git -C h1spec fetch -q origin "$H1SPEC_SHA" 2>/dev/null || true
git -C h1spec checkout -q "$H1SPEC_SHA"

# h1spec's test driver is a Deno script. Resolve deno: $DENO override, PATH,
# or a locally vendored copy in ./deno (gitignored).
DENO="${DENO:-}"
if [ -z "$DENO" ]; then
  if command -v deno >/dev/null 2>&1; then
    DENO=deno
  elif [ -x ./deno/bin/deno ]; then
    DENO=./deno/bin/deno
  else
    echo "deno is required to run h1spec's test driver: https://docs.deno.com/runtime/getting_started/installation/" >&2
    exit 1
  fi
fi

fail=0

run_subject() {
  local name="$1" file="$2" port="$3" pid i
  PORT="$port" node "$file" &
  pid=$!
  for i in $(seq 1 50); do
    curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$port/" && break
    sleep 0.1
  done
  echo "=== h1spec vs $name (127.0.0.1:$port) ==="
  "$DENO" run --allow-net h1spec/http_test.ts 127.0.0.1 "$port" || fail=1
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}

run_subject "raw @morojs/engine"      engine_subject.mjs 8000
run_subject "MoroJS on native engine" moro_subject.mjs   8001

exit "$fail"
