# HTTP/1.1 conformance (h1spec)

Throughput numbers mean nothing if the parser cuts corners, so this folder
runs [uNetworking/h1spec](https://github.com/uNetworking/h1spec) — the
33-test HTTP/1.1 server compliance suite written by the uWebSockets.js
team — against `@morojs/engine`, unmodified. A suite authored by a
competing server's maintainers is the most adversarial conformance
evidence available; we did not write these tests and cannot shape them.

Two subjects run, and CI fails unless **both** score 33/33:

| Subject | Score (2026-08-05, engine 1.1.5) |
|---|---|
| raw `@morojs/engine` from npm | **33/33** |
| full MoroJS framework on the engine (`engine: 'moro'`) from npm | **33/33** |

Reference scores from h1spec's own README (Oct 2024): uWS 33/33,
Node 32/33, Bun 32/33, Deno 31/33, mrhttp 17/33.

## No excuses by construction

- **Packages come from the npm registry** on every CI run (no lockfile is
  committed), so a green badge describes the published `@morojs/engine`
  and `@morojs/moro` — not a local build. The workflow prints the exact
  resolved versions, and a weekly scheduled run re-verifies new releases.
- **h1spec is pinned** to commit `f0a5650` (its latest, Oct 2024) and
  cloned at run time — pinned so upstream changes can't silently move the
  bar; cloned rather than vendored because upstream ships no license file.
- **The framework subject refuses to start** if the native engine didn't
  actually load, so a silent node-http fallback can never produce a
  bogus pass.
- The subjects ([engine_subject.mjs](engine_subject.mjs),
  [moro_subject.mjs](moro_subject.mjs)) are ~30 lines each: echo the
  request body back for any method, exactly the contract h1spec's README
  specifies. Everything protocol-level that h1spec probes — malformed
  heads, smuggling-shaped Transfer-Encoding/Content-Length conflicts,
  Host discipline, `Expect: 100-continue`, chunked bodies, fragmented
  requests — is handled by the engine, not the subject.

## Run it yourself

```bash
npm install          # from the repo root — pulls the published packages
npm run h1spec       # clones pinned h1spec, runs both subjects
```

Requires Node and [Deno](https://docs.deno.com/runtime/getting_started/installation/)
(h1spec's test driver is a Deno script; `DENO=/path/to/deno` overrides
resolution). Ports 8000/8001 are used briefly; the whole run takes a few
seconds.
