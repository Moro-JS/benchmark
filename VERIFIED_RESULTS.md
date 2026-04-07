# MoroJS Performance Benchmark Results

## PERFORMANCE COMPARISON

| Framework | Requests/sec | Latency (avg) | Latency (50%) | Notes |
|-----------|--------------|---------------|---------------|--------|
| **MoroJS (uWebSockets.js)** | **226,253** | **3.92ms** | **4ms** | `hello-world-uws-server.js`, port 3112; same autocannon profile |
| **MoroJS (Clustered)** | **190,717** | **4.89ms** | **5ms** | Built-in clustering; `hello-world-server.js`, port 3111; `npm run bench` |
| **MoroJS (Single)** | **93,992** | **10.14ms** | **8ms** | Clustering disabled; `hello-world-server-single-thread.js`, port 3110; `npm run bench-single` |

## DETAILED RESULTS

### MoroJS with uWebSockets.js
```
Running test @ http://127.0.0.1:3112
100 connections with 10 pipelining factor

┌─────────┬──────┬──────┬───────┬──────┬─────────┬─────────┬───────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%  │ Avg     │ Stdev   │ Max   │
├─────────┼──────┼──────┼───────┼──────┼─────────┼─────────┼───────┤
│ Latency │ 1 ms │ 4 ms │ 6 ms  │ 6 ms │ 3.92 ms │ 1.15 ms │ 20 ms │
└─────────┴──────┴──────┴───────┴──────┴─────────┴─────────┴───────┘
┌───────────┬─────────┬─────────┬─────────┬─────────┬───────────┬──────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ 50%     │ 97.5%   │ Avg       │ Stdev    │ Min     │
├───────────┼─────────┼─────────┼─────────┼─────────┼───────────┼──────────┼─────────┤
│ Req/Sec   │ 215,935 │ 215,935 │ 226,559 │ 231,807 │ 226,252.8 │ 2,793.93 │ 215,874 │
├───────────┼─────────┼─────────┼─────────┼─────────┼───────────┼──────────┼─────────┤
│ Bytes/Sec │ 30.7 MB │ 30.7 MB │ 32.2 MB │ 32.9 MB │ 32.1 MB   │ 398 kB   │ 30.7 MB │
└───────────┴─────────┴─────────┴─────────┴─────────┴───────────┴──────────┴─────────┘

Req/Bytes counts sampled once per second.
# of samples: 40

9051k requests in 40.03s, 1.29 GB read
```

### MoroJS with Built-in Clustering
```
Running 40s test @ http://127.0.0.1:3111
100 connections with 10 pipelining factor

┌─────────┬──────┬──────┬───────┬──────┬─────────┬────────┬───────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%  │ Avg     │ Stdev  │ Max   │
├─────────┼──────┼──────┼───────┼──────┼─────────┼────────┼───────┤
│ Latency │ 4 ms │ 5 ms │ 5 ms  │ 6 ms │ 4.89 ms │ 0.6 ms │ 41 ms │
└─────────┴──────┴──────┴───────┴──────┴─────────┴────────┴───────┘

┌───────────┬─────────┬─────────┬─────────┬─────────┬───────────┬──────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ 50%     │ 97.5%   │ Avg       │ Stdev    │ Min     │
├───────────┼─────────┼─────────┼─────────┼─────────┼───────────┼──────────┼─────────┤
│ Req/Sec   │ 174,079 │ 174,079 │ 191,743 │ 193,535 │ 190,716.8 │ 3,379.18 │ 173,956 │
├───────────┼─────────┼─────────┼─────────┼─────────┼───────────┼──────────┼─────────┤
│ Bytes/Sec │ 32.5 MB │ 32.5 MB │ 35.8 MB │ 36.2 MB │ 35.7 MB   │ 632 kB   │ 32.5 MB │
└───────────┴─────────┴─────────┴─────────┴─────────┴───────────┴──────────┴─────────┘

Req/Bytes counts sampled once per second.
# of samples: 40

7630k requests in 40.09s, 1.43 GB read
```

### MoroJS Single-Threaded
```
Running 40s test @ http://127.0.0.1:3110
100 connections with 10 pipelining factor

┌─────────┬──────┬──────┬───────┬───────┬──────────┬────────┬────────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%   │ Avg      │ Stdev  │ Max    │
├─────────┼──────┼──────┼───────┼───────┼──────────┼────────┼────────┤
│ Latency │ 6 ms │ 8 ms │ 17 ms │ 18 ms │ 10.14 ms │ 4.7 ms │ 400 ms │
└─────────┴──────┴──────┴───────┴───────┴──────────┴────────┴────────┘

┌───────────┬─────────┬─────────┬─────────┬─────────┬─────────┬──────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ 50%     │ 97.5%   │ Avg     │ Stdev    │ Min     │
├───────────┼─────────┼─────────┼─────────┼─────────┼─────────┼──────────┼─────────┤
│ Req/Sec   │ 86,655  │ 86,655  │ 93,951  │ 97,279  │ 93,992  │ 2,197.97 │ 86,601  │
├───────────┼─────────┼─────────┼─────────┼─────────┼─────────┼──────────┼─────────┤
│ Bytes/Sec │ 16.2 MB │ 16.2 MB │ 17.6 MB │ 18.2 MB │ 17.6 MB │ 411 kB   │ 16.2 MB │
└───────────┴─────────┴─────────┴─────────┴─────────┴─────────┴──────────┴─────────┘

Req/Bytes counts sampled once per second.
# of samples: 40

3761k requests in 40.01s, 703 MB read
```

## KEY FINDINGS

### uWebSockets.js vs standard Node HTTP (same workload)

1. **Request throughput**
   - uWebSockets.js: **226,253 req/sec** (avg)
   - Clustered (standard stack): **190,717 req/sec** (avg)
   - **Improvement: ~19% higher throughput** with uWebSockets.js vs clustered on this benchmark

2. **Latency**
   - uWebSockets.js: **3.92ms** average (50th **4ms**)
   - Clustered: **4.89ms** average (50th **5ms**)
   - **Improvement: ~20% lower average latency** with uWebSockets.js vs clustered on this run

### Performance Impact of Built-in Clustering

1. **Request Throughput**
   - Clustered: **190,717 req/sec**
   - Single: **93,992 req/sec**
   - **Improvement: ~103% increase** (roughly **2×** throughput vs single on recorded runs)

2. **Latency**
   - Clustered: **4.89ms** average (50th **5ms**)
   - Single: **10.14ms** average (50th **8ms**)
   - **Improvement: ~52% lower average latency** vs single-threaded on this run

3. **Stability (latency stdev)**
   - Clustered: **0.6ms**
   - Single: **4.7ms**
   - **Improvement: ~87% lower** average latency standard deviation under load

## CONFIGURATION

### Enabling Clustering
Add to your `moro.config.cjs` (or `moro.config.js` in CommonJS projects) or app configuration:
```javascript
{
  performance: {
    clustering: {
      enabled: true,
      workers: 'auto' // or specific number
    }
  }
}
```

## CONCLUSIONS

1. **uWebSockets.js is Optional Peak Performance**
   - Substantially higher throughput and lower latency than the clustered standard stack on the synthetic hello-world benchmark
   - Same Moro API; enable with `server.useUWebSockets: true` and the `uWebSockets.js` dependency

2. **Built-in Clustering is Highly Effective**
   - Roughly **doubles** throughput vs single-threaded on recorded runs (~191k vs ~94k req/sec)
   - Cuts average latency vs single-threaded (~4.9ms vs ~10.1ms on these runs)
   - Much tighter latency standard deviation under load than single-threaded (~0.6ms vs ~4.7ms)

3. **Easy to Enable**
   - Simple configuration
   - No manual cluster setup needed
   - Automatic worker management

4. **Production Ready**
   - Stable under load
   - Consistent performance
   - Low latency variance