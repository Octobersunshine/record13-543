module.exports = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },
  api: {
    prefix: '/api/cert'
  },
  retry: {
    enabled: true,
    checkIntervalMs: 10000,
    maxAttempts: 3,
    baseIntervalMs: 30000,
    maxIntervalMs: 300000,
    backoffMultiplier: 2
  },
  monitor: {
    enabled: true,
    checkIntervalMs: 15000,
    warningDays: 30,
    criticalDays: 7
  }
};
