module.exports = {
  server: {
    port: 3111,        // Default benchmark port (can be overridden by PORT env var)
    host: '127.0.0.1',  // Default benchmark host (can be overridden by HOST env var)
    requestTracking: {
        enabled: false, // Disable for fair comparison
    },
    errorBoundary: {
        enabled: false, // Disable for fair comparison
    },
  },
  // Minimal middleware for fair comparison
  performance: {
      clustering: {
          enabled: true, // unleash the power of clustering to really see the power
          workers: 'auto'
      },
  },

  // Minimal logging for benchmarks
  logger: {
      level: 'warn'  // This will now work correctly without env var override
  }
}