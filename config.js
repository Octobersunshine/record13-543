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
  },
  alert: {
    enabled: true,
    dedupIntervalMs: 60000,
    channels: {
      console: {
        enabled: true
      },
      webhook: {
        enabled: true,
        url: 'https://hooks.example.com/alert'
      },
      email: {
        enabled: true,
        recipients: ['ops@example.com', 'sec@example.com']
      },
      sms: {
        enabled: true,
        recipients: ['+8613800000001']
      }
    }
  }
};
