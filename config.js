module.exports = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },
  api: {
    prefix: '/api/cert'
  },
  certificate: {
    renewal: {
      autoRetryMaxAttempts: 3,
      retryIntervalMinutes: 5,
      warningDays: 30
    }
  }
};
