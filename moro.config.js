module.exports = {
    // Minimal middleware for fair comparison
    performance: {
      clustering: {
        enabled: true, // unleash the power of clustering to really see the power
        workers: 'auto'
      },
      compression: {
        enabled: false  // Disable compression
      },
      circuitBreaker: {
        enabled: false  // Disable circuit breaker overhead
      }
    },
    
    // Disable some modules for maximum performance
    modules: {
      cache: {
        enabled: true
      },
      rateLimit: {
        enabled: false
      },
      validation: {
        enabled: false
      }
    },
    
    // Disable all middleware overhead
    cors: false,           // No CORS processing
    helmet: false,         // No security headers
    compression: false,    // Legacy compression setting
    
    // Minimal logging
    logger: {
      level: 'error'  // Only log errors, no debug/info overhead
    }
  }