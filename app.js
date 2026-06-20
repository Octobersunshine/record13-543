const express = require('express');
const certRoutes = require('./routes/certRoutes');
const retryScheduler = require('./services/retryScheduler');
const expiryMonitor = require('./services/expiryMonitor');
const alertService = require('./services/alertService');
const config = require('./config');

const app = express();
const PORT = config.server.port;

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.json({
    code: 0,
    message: '证书续期任务状态查询 API（含自动重试、过期预警、分级告警推送）',
    data: {
      features: [
        '续期任务状态查询',
        '最近一次续期执行结果查询',
        '续期失败自动重试（指数退避）',
        '证书过期预警监控',
        '分级告警推送（证书过期/续期失败/网络超时等）',
        '多渠道推送（控制台/Webhook/邮件/短信）',
        '告警去重机制',
        '手动触发重试'
      ],
      endpoints: [
        { method: 'GET', path: '/api/cert/tasks', description: '获取所有证书续期任务列表' },
        { method: 'GET', path: '/api/cert/tasks/:id', description: '获取指定任务详情' },
        { method: 'GET', path: '/api/cert/tasks/:id/status', description: '获取指定任务状态及统计（含重试队列）' },
        { method: 'GET', path: '/api/cert/tasks/:id/records', description: '获取指定任务的所有续期记录' },
        { method: 'GET', path: '/api/cert/tasks/:id/records/latest', description: '获取指定任务最近一次续期执行结果' },
        { method: 'POST', path: '/api/cert/tasks/:id/retry', description: '手动触发续期重试' },
        { method: 'GET', path: '/api/cert/retry/queue', description: '获取重试队列' },
        { method: 'GET', path: '/api/cert/retry/queue/pending', description: '获取待执行的重试任务' },
        { method: 'GET', path: '/api/cert/retry/stats', description: '获取重试统计信息' },
        { method: 'GET', path: '/api/cert/records', description: '获取所有续期记录（支持 ?domain= 查询）' },
        { method: 'GET', path: '/api/cert/records/latest', description: '获取最近一次续期执行结果（支持 ?taskId= 或 ?domain=）' },
        { method: 'GET', path: '/api/cert/domain/:domain/status', description: '按域名获取任务状态（含重试队列）' },
        { method: 'GET', path: '/api/cert/domain/:domain/latest', description: '按域名获取最近一次续期执行结果' },
        { method: 'GET', path: '/api/cert/monitor/expiry', description: '获取证书过期风险报告' },
        { method: 'GET', path: '/api/cert/monitor/stats', description: '获取过期监控统计信息' },
        { method: 'GET', path: '/api/cert/alerts', description: '获取告警列表（支持 ?acknowledged= &type= &taskId=）' },
        { method: 'POST', path: '/api/cert/alerts/:id/acknowledge', description: '确认告警' },
        { method: 'GET', path: '/api/cert/alerts/types', description: '获取所有告警类型定义' },
        { method: 'GET', path: '/api/cert/alerts/categories', description: '获取告警分类（证书过期/续期失败/重试相关）' },
        { method: 'GET', path: '/api/cert/alerts/classify', description: '错误信息分类测试（?error=）' },
        { method: 'GET', path: '/api/cert/alerts/push/history', description: '获取告警推送历史（支持 ?type=&level=&category=&taskId=&domain=&limit=）' },
        { method: 'GET', path: '/api/cert/alerts/push/stats', description: '获取告警推送统计' },
        { method: 'POST', path: '/api/cert/alerts/dedup/clear', description: '清除告警去重缓存' }
      ]
    }
  });
});

app.use('/api/cert', certRoutes);

app.use((req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在',
    data: null
  });
});

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    data: null,
    error: err.message
  });
});

retryScheduler.on('retry_scheduled', (data) => {
  console.log(`[Event] retry_scheduled: 任务#${data.taskId} (${data.domain}) 已安排第 ${data.attempt} 次重试, 错误类型: ${data.errorType || 'unknown'}`);
});

retryScheduler.on('retry_started', (data) => {
  console.log(`[Event] retry_started: 任务#${data.taskId} (${data.domain}) 第 ${data.attempt}/${data.maxAttempts} 次重试开始`);
});

retryScheduler.on('retry_success', (data) => {
  console.log(`[Event] retry_success: 任务#${data.taskId} (${data.domain}) 第 ${data.attempt} 次重试成功`);
});

retryScheduler.on('retry_failed', (data) => {
  console.log(`[Event] retry_failed: 任务#${data.taskId} (${data.domain}) 第 ${data.attempt} 次重试失败, 错误类型: ${data.errorType || 'unknown'}, 下次第 ${data.nextAttempt} 次`);
});

retryScheduler.on('retry_exhausted', (data) => {
  console.error(`[Event] retry_exhausted: 任务#${data.taskId} (${data.domain}) 重试耗尽(${data.totalAttempts}次), 错误类型: ${data.errorType || 'unknown'}, 需人工介入`);
});

retryScheduler.on('manual_retry', (data) => {
  console.log(`[Event] manual_retry: 任务#${data.taskId} (${data.domain}) 手动触发重试`);
});

expiryMonitor.on('cert_expired', (data) => {
  console.error(`[Event] cert_expired: ${data.task.domain} 证书已过期 ${data.expiredDays || Math.abs(data.daysRemaining)} 天`);
});

expiryMonitor.on('cert_critical', (data) => {
  console.warn(`[Event] cert_critical: ${data.task.domain} 证书将在 ${data.daysRemaining} 天后过期, 重试进行中: ${data.hasRetryInProgress}`);
});

expiryMonitor.on('cert_warning', (data) => {
  console.warn(`[Event] cert_warning: ${data.task.domain} 证书将在 ${data.daysRemaining} 天后过期`);
});

alertService.on('alert_pushed', (alert, pushResults) => {
  const successChannels = pushResults.filter(r => r.success).map(r => r.channel);
  console.log(`[Event] alert_pushed: [${alert.level.toUpperCase()}] ${alert.icon} ${alert.label} - ${alert.domain} - 推送渠道: [${successChannels.join(', ')}]`);
});

alertService.on('alert_deduplicated', (alert) => {
  console.log(`[Event] alert_deduplicated: ${alert.icon} ${alert.type} - ${alert.domain} (已去重)`);
});

const server = app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════════════════╗
  ║                                                                  ║
  ║   证书续期任务状态查询服务已启动（含分级告警推送）                ║
  ║                                                                  ║
  ║   服务地址: http://localhost:${PORT}                                 ║
  ║                                                                  ║
  ║   核心功能:                                                       ║
  ║   • 分级告警推送（证书过期/续期失败/网络超时等）                  ║
  ║   • 多渠道推送（控制台/Webhook/邮件/短信）                        ║
  ║   • 续期失败自动重试（指数退避策略）                              ║
  ║   • 证书过期预警监控                                              ║
  ║   • 告警去重机制                                                  ║
  ║   • 手动触发重试                                                  ║
  ║                                                                  ║
  ║   示例接口:                                                       ║
  ║   • GET  /api/cert/alerts/types           (告警类型列表)          ║
  ║   • GET  /api/cert/alerts/categories      (告警分类)              ║
  ║   • GET  /api/cert/alerts/push/history    (推送历史)              ║
  ║   • GET  /api/cert/alerts/push/stats       (推送统计)              ║
  ║   • GET  /api/cert/alerts/classify?error=Timeout (错误分类测试)   ║
  ║                                                                  ║
  ╚══════════════════════════════════════════════════════════════════╝
  `);

  if (config.retry.enabled) {
    retryScheduler.start();
  }
  if (config.monitor.enabled) {
    expiryMonitor.start();
  }
});

process.on('SIGTERM', () => {
  console.log('\n正在关闭服务...');
  retryScheduler.stop();
  expiryMonitor.stop();
  server.close(() => {
    console.log('服务已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n正在关闭服务...');
  retryScheduler.stop();
  expiryMonitor.stop();
  server.close(() => {
    console.log('服务已关闭');
    process.exit(0);
  });
});

module.exports = app;
