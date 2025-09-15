# MoroJS Performance Benchmark Results

## PERFORMANCE COMPARISON

| Framework | Requests/sec | Latency (avg) | Latency (50%) | Notes |
|-----------|--------------|---------------|---------------|--------|
| **MoroJS (Clustered)** | **136,937** | **6.81ms** | **6ms** | Built-in clustering |
| **MoroJS (Single)** | 61,562 | 15.74ms | 12ms | No clustering |

## DETAILED RESULTS

### MoroJS with Built-in Clustering
```
Running test @ http://127.0.0.1:3111
100 connections with 10 pipelining factor

┌─────────┬──────┬──────┬───────┬───────┬─────────┬─────────┬────────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%   │ Avg     │ Stdev   │ Max    │
├─────────┼──────┼──────┼───────┼───────┼─────────┼─────────┼────────┤
│ Latency │ 6 ms │ 6 ms │ 13 ms │ 14 ms │ 6.81 ms │ 1.83 ms │ 116 ms │
└─────────┴──────┴──────┴───────┴───────┴─────────┴─────────┴────────┘

┌───────────┬─────────┬─────────┬─────────┬─────────┬───────────┬──────────┬─────────┐
│ Stat      │ 1%      │ 2.5%    │ 50%     │ 97.5%   │ Avg       │ Stdev    │ Min     │
├───────────┼─────────┼─────────┼─────────┼─────────┼───────────┼──────────┼─────────┤
│ Req/Sec   │ 116,031 │ 116,031 │ 137,983 │ 139,519 │ 136,936.8 │ 3,693.12 │ 115,972 │
├───────────┼─────────┼─────────┼─────────┼─────────┼───────────┼──────────┼─────────┤
│ Bytes/Sec │ 68.4 MB │ 68.4 MB │ 81.3 MB │ 82.2 MB │ 80.6 MB   │ 2.17 MB  │ 68.3 MB │
└───────────┴─────────┴─────────┴─────────┴─────────┴───────────┴──────────┴─────────┘
```

### MoroJS Single-Threaded
```
Running test @ http://127.0.0.1:3111
100 connections with 10 pipelining factor

┌─────────┬──────┬───────┬───────┬───────┬──────────┬─────────┬────────┐
│ Stat    │ 2.5% │ 50%   │ 97.5% │ 99%   │ Avg      │ Stdev   │ Max    │
├─────────┼──────┼───────┼───────┼───────┼──────────┼─────────┼────────┤
│ Latency │ 9 ms │ 12 ms │ 24 ms │ 29 ms │ 15.74 ms │ 8.04 ms │ 623 ms │
└─────────┴──────┴───────┴───────┴───────┴──────────┴─────────┴────────┘

┌───────────┬────────┬────────┬─────────┬────────┬──────────┬──────────┬────────┐
│ Stat      │ 1%     │ 2.5%   │ 50%     │ 97.5%  │ Avg      │ Stdev    │ Min    │
├───────────┼────────┼────────┼─────────┼────────┼──────────┼──────────┼────────┤
│ Req/Sec   │ 52,639 │ 52,639 │ 61,919  │ 64,575 │ 61,562.4 │ 2,319.56 │ 52,637 │
├───────────┼────────┼────────┼─────────┼────────┼──────────┼──────────┼────────┤
│ Bytes/Sec │ 31 MB  │ 31 MB  │ 36.5 MB │ 38 MB  │ 36.3 MB  │ 1.37 MB  │ 31 MB  │
└───────────┴────────┴────────┴─────────┴────────┴──────────┴──────────┴────────┘
```

## KEY FINDINGS

### Performance Impact of Built-in Clustering

1. **Request Throughput**
   - Clustered: 136,937 req/sec
   - Single: 61,562 req/sec
   - **Improvement: 122% increase**

2. **Latency**
   - Clustered: 6.81ms average
   - Single: 15.74ms average
   - **Improvement: 57% reduction**

3. **Stability**
   - Clustered: 1.83ms standard deviation
   - Single: 8.04ms standard deviation
   - **Improvement: 77% more stable**

## CONFIGURATION

### Enabling Clustering
Add to your `moro.config.js` or app configuration:
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

1. **Built-in Clustering is Highly Effective**
   - More than doubles throughput
   - Cuts latency in half
   - Significantly improves stability

2. **Easy to Enable**
   - Simple configuration
   - No manual cluster setup needed
   - Automatic worker management

3. **Production Ready**
   - Stable under load
   - Consistent performance
   - Low latency variance