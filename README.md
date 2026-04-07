# MoroJS Performance Benchmarks

**MoroJS reaches ~226,253 req/sec with uWebSockets.js, ~190,717 req/sec with built-in clustering, and ~93,992 req/sec single-threaded on the standard stack—while keeping TypeScript safety, validation, and developer experience.**

## Performance Results

### Synthetic Benchmark (Industry Standard)
- **~226,253 req/sec** with **uWebSockets.js** (`npm run hello-world-uws` + `npm run bench-uws`)
- **3.92ms average latency** with uWebSockets.js (50th percentile **4ms**)
- **~190,717 req/sec** with built-in clustering (Node HTTP, `npm run hello-world` + `npm run bench`)
- **~93,992 req/sec** single-threaded (`npm run hello-world-single` + `npm run bench-single`, port **3110**)
- **4.89ms average latency** with clustering (50th **5ms**); **10.14ms** average / **8ms** p50 single-threaded
- **0% error rate** across all test scenarios

### Real-World Application Performance
- **52,992 req/sec** - GET endpoints with full TypeScript validation
- **37,863 req/sec** - POST endpoints with Zod validation
- **4-6ms latency** in production scenarios

## Framework Comparison

| Metric | Fastify | **MoroJS (Single)** | **MoroJS (Clustered)** | **MoroJS (uWS)** | MoroJS Advantage |
|--------|---------|---------------------|------------------------|------------------|------------------|
| **Synthetic Performance** | 46,400 req/sec | **~93,992 req/sec** | **~190,717 req/sec** | **~226,253 req/sec** | **Up to ~387% faster** (uWS vs Fastify) |
| **Latency (avg)** | 21.04ms | **10.14ms** | **4.89ms** | **3.92ms** | **~52–81% lower** than Fastify (single → uWS) |
| **TypeScript Support** | Plugin-based | **Native first-class** | **Native first-class** | **Native first-class** | **Built-in intelligence** |
| **Validation** | JSON Schema | **Zod integration** | **Zod integration** | **Zod integration** | **Faster + better DX** |
| **Error Handling** | Manual setup | **Intelligent defaults** | **Intelligent defaults** | **Intelligent defaults** | **Zero-config safety** |
| **Real-world Testing** | Synthetic only | **Comprehensive suite** | **Comprehensive suite** | **Comprehensive suite** | **Production-ready validation** |
| **Learning Curve** | Complex plugins | **Intuitive API** | **Intuitive API** | **Intuitive API** | **Faster development** |

## Why MoroJS is the New Performance Standard

### Beyond Raw Speed
While other frameworks focus solely on synthetic benchmarks, MoroJS delivers superior performance across every metric that matters:

**Performance**: 
- **~226,253 req/sec** with optional uWebSockets.js on the same hello-world autocannon profile
- **~387% higher throughput** than Fastify’s synthetic figure with uWebSockets.js; **~311%** with clustering on the standard stack
- **~103% higher throughput** than Fastify’s synthetic figure in single-threaded mode (~94k vs ~46k req/sec — roughly **2×**)
- Built-in clustering achieves **~190,717 req/sec** on the standard HTTP stack with zero configuration (**~103%** higher throughput vs single-threaded on recorded runs)

**Safety**: TypeScript-native with zero runtime overhead
**Validation**: Zod integration that's faster than JSON Schema
**Developer Experience**: Intelligent APIs that reduce bugs and development time
**Production Ready**: Comprehensive error handling and edge case coverage

### The Complete Package
```typescript
// Fastify: Fast but basic
fastify.post('/users', {
  schema: { /* JSON Schema complexity */ }
}, handler)

// MoroJS: Faster AND better
app.post('/users', {
  schema: z.object({
    name: z.string(),
    email: z.string().email()
  })
}, async (req) => {
  // Type-safe, runtime-safe, zero config
});
```

## Technical Advantages

### Performance Optimizations
1. **Built-in clustering** - Automatic multi-core utilization
2. **Zero-cost routing** - Intelligent route matching without overhead
3. **Native TypeScript compilation** - No runtime type checking penalties  
4. **Optimized Zod integration** - Faster validation than JSON Schema
5. **Smart bundling** - Production builds eliminate dead code

### Architecture Benefits
- **TypeScript-first design** eliminates entire classes of runtime errors
- **Intelligent middleware system** with automatic optimization
- **Production-hardened defaults** based on real-world usage patterns
- **Comprehensive testing** including edge cases other frameworks ignore
- **Built-in clustering** with zero configuration needed

## Benchmark Methodology

### Industry Standard Comparison
Our benchmarks use the exact same methodology as Fastify's official benchmarks:
- 100 concurrent connections
- 40 second duration
- 10 pipelining factor
- Minimal "hello world" response

The **uWebSockets.js** numbers use the same autocannon settings against `hello-world-uws-server.js` on port **3112** (`npm run hello-world-uws` / `npm run bench-uws`). **Single-threaded** runs use `hello-world-server-single-thread.js` on port **3110** with `npm run bench-single`. **Clustered** runs use `hello-world-server.js` on port **3111** with `npm run bench`.

### Real-World Testing
Unlike synthetic-only frameworks, MoroJS includes comprehensive real-world scenarios:
- Multiple endpoint types (GET, POST, parameterized routes)
- Production validation patterns
- TypeScript compilation overhead
- Error handling and edge cases
- Multi-core utilization

## Running the Benchmarks

### Quick Start
```bash
# Install dependencies
npm install

# Start the test server
npm run hello-world

# Run the benchmark (in another terminal)
npm run bench
```

**Single-threaded** (port 3110 — use its own server + load pair):

```bash
npm run hello-world-single
# other terminal:
npm run bench-single
```

**Clustered** (second terminal for load):

```bash
npm run hello-world
# other terminal:
npm run bench
```

**uWebSockets** (second terminal for load):

```bash
npm run hello-world-uws
# other terminal:
npm run bench-uws
```

**Expected Results**: 
- ~226,253 req/sec with uWebSockets.js (verified autocannon run)
- ~190,717 req/sec with default clustering (standard stack)
- ~93,992 req/sec single-threaded (`hello-world-server-single-thread.js` on port 3110)

### Available Tests
- `npm run hello-world` — Clustered server (port **3111**); pair with `npm run bench`
- `npm run hello-world-single` — Single-threaded server (port **3110**); pair with `npm run bench-single`
- `npm run hello-world-uws` — uWebSockets.js server (port **3112**); pair with `npm run bench-uws`
- `npm run bench-quick` / `bench-single-quick` / `bench-uws-quick` — Shorter autocannon runs

## The MoroJS Advantage

### Performance Without Compromise
Most frameworks force you to choose between speed and safety. MoroJS delivers both:

- **Up to ~387% higher synthetic throughput than Fastify** with uWebSockets.js; **~311%** with clustering on the standard stack; **~103%** single-threaded vs Fastify’s synthetic figure
- **Superior real-world performance** with validation and safety
- **TypeScript intelligence** that prevents entire classes of bugs
- **Zero configuration** for production-ready applications

### Production Ready
While other frameworks excel in synthetic benchmarks but struggle in production, MoroJS is built for real applications:
- Built-in clustering for maximum performance
- Comprehensive error handling
- Intelligent middleware system
- Production-hardened defaults
- Real-world performance validation

## Framework Positioning

**Fastify**: Fast synthetic benchmarks, complex production setup
**MoroJS**: Superior performance + built-in clustering + better developer experience

MoroJS represents the next generation of Node.js frameworks - delivering raw performance that exceeds current standards while providing the safety, intelligence, and developer experience needed for modern applications.

---

**Ready to experience the fastest TypeScript-first framework?** Run the benchmarks and see why MoroJS is setting the new performance standard.