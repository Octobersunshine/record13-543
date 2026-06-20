const express = require('express');
const router = express.Router();
const certStore = require('../data/certStore');
const retryScheduler = require('../services/retryScheduler');
const expiryMonitor = require('../services/expiryMonitor');

router.get('/tasks', (req, res) => {
  const tasks = certStore.getAllTasks();
  res.json({
    code: 0,
    message: 'success',
    data: tasks,
    total: tasks.length
  });
});

router.get('/tasks/:id', (req, res) => {
  const task = certStore.getTaskById(req.params.id);
  if (!task) {
    return res.status(404).json({
      code: 404,
      message: '任务不存在',
      data: null
    });
  }
  res.json({
    code: 0,
    message: 'success',
    data: task
  });
});

router.get('/tasks/:id/status', (req, res) => {
  const status = certStore.getTaskStatus(req.params.id);
  if (!status) {
    return res.status(404).json({
      code: 404,
      message: '任务不存在',
      data: null
    });
  }
  const retryQueue = certStore.getRetryQueueByTaskId(req.params.id);
  status.retryQueue = retryQueue;
  status.hasRetryInProgress = retryQueue.some(q => q.status === 'pending' || q.status === 'retrying');
  res.json({
    code: 0,
    message: 'success',
    data: status
  });
});

router.get('/tasks/:id/records', (req, res) => {
  const task = certStore.getTaskById(req.params.id);
  if (!task) {
    return res.status(404).json({
      code: 404,
      message: '任务不存在',
      data: null
    });
  }
  const records = certStore.getRecordsByTaskId(req.params.id);
  res.json({
    code: 0,
    message: 'success',
    data: records,
    total: records.length
  });
});

router.get('/tasks/:id/records/latest', (req, res) => {
  const task = certStore.getTaskById(req.params.id);
  if (!task) {
    return res.status(404).json({
      code: 404,
      message: '任务不存在',
      data: null
    });
  }
  const latest = certStore.getLatestRecord(req.params.id);
  if (!latest) {
    return res.status(404).json({
      code: 404,
      message: '暂无续期记录',
      data: null
    });
  }
  res.json({
    code: 0,
    message: 'success',
    data: latest
  });
});

router.post('/tasks/:id/retry', (req, res) => {
  const task = certStore.getTaskById(req.params.id);
  if (!task) {
    return res.status(404).json({
      code: 404,
      message: '任务不存在',
      data: null
    });
  }
  if (!task.autoRenewal) {
    return res.status(400).json({
      code: 400,
      message: '该任务未启用自动续期，无法触发重试',
      data: null
    });
  }
  const result = retryScheduler.triggerManualRetry(req.params.id);
  if (!result.success) {
    return res.status(400).json({
      code: 400,
      message: result.error,
      data: null
    });
  }
  res.json({
    code: 0,
    message: result.message || '已触发重试',
    data: result.data || null
  });
});

router.get('/retry/queue', (req, res) => {
  const queue = certStore.getRetryQueue();
  res.json({
    code: 0,
    message: 'success',
    data: queue,
    total: queue.length
  });
});

router.get('/retry/queue/pending', (req, res) => {
  const pending = certStore.getPendingRetries();
  res.json({
    code: 0,
    message: 'success',
    data: pending,
    total: pending.length
  });
});

router.get('/retry/stats', (req, res) => {
  const stats = retryScheduler.getRetryStats();
  res.json({
    code: 0,
    message: 'success',
    data: stats
  });
});

router.get('/records', (req, res) => {
  const { domain } = req.query;
  let records;
  if (domain) {
    records = certStore.getRecordsByDomain(domain);
  } else {
    records = certStore.getAllRecords();
  }
  res.json({
    code: 0,
    message: 'success',
    data: records,
    total: records.length
  });
});

router.get('/records/latest', (req, res) => {
  const { taskId, domain } = req.query;

  if (domain) {
    const task = certStore.getTaskByDomain(domain);
    if (!task) {
      return res.status(404).json({
        code: 404,
        message: '域名不存在',
        data: null
      });
    }
  }

  const latest = certStore.getLatestRecord(taskId, domain);
  if (!latest) {
    return res.status(404).json({
      code: 404,
      message: '暂无续期记录',
      data: null
    });
  }
  res.json({
    code: 0,
    message: 'success',
    data: latest
  });
});

router.get('/domain/:domain/status', (req, res) => {
  const { domain } = req.params;
  const task = certStore.getTaskByDomain(domain);
  if (!task) {
    return res.status(404).json({
      code: 404,
      message: '域名不存在',
      data: null
    });
  }
  const status = certStore.getTaskStatus(task.id);
  const retryQueue = certStore.getRetryQueueByTaskId(task.id);
  status.retryQueue = retryQueue;
  status.hasRetryInProgress = retryQueue.some(q => q.status === 'pending' || q.status === 'retrying');
  res.json({
    code: 0,
    message: 'success',
    data: status
  });
});

router.get('/domain/:domain/latest', (req, res) => {
  const { domain } = req.params;
  const task = certStore.getTaskByDomain(domain);
  if (!task) {
    return res.status(404).json({
      code: 404,
      message: '域名不存在',
      data: null
    });
  }
  const latest = certStore.getLatestRecord(null, domain);
  if (!latest) {
    return res.status(404).json({
      code: 404,
      message: '暂无续期记录',
      data: null
    });
  }
  res.json({
    code: 0,
    message: 'success',
    data: latest
  });
});

router.get('/monitor/expiry', (req, res) => {
  const report = expiryMonitor.getExpiryReport();
  res.json({
    code: 0,
    message: 'success',
    data: report,
    total: report.length
  });
});

router.get('/monitor/stats', (req, res) => {
  const stats = expiryMonitor.getMonitorStats();
  res.json({
    code: 0,
    message: 'success',
    data: stats
  });
});

router.get('/alerts', (req, res) => {
  const { acknowledged, type, taskId } = req.query;
  const options = {};
  if (acknowledged !== undefined) options.acknowledged = acknowledged === 'true';
  if (type) options.type = type;
  if (taskId) options.taskId = taskId;

  const alerts = certStore.getAlerts(options);
  res.json({
    code: 0,
    message: 'success',
    data: alerts,
    total: alerts.length,
    unacknowledgedCount: certStore.getUnacknowledgedAlertCount()
  });
});

router.post('/alerts/:id/acknowledge', (req, res) => {
  const alert = certStore.acknowledgeAlert(req.params.id);
  if (!alert) {
    return res.status(404).json({
      code: 404,
      message: '告警不存在',
      data: null
    });
  }
  res.json({
    code: 0,
    message: '告警已确认',
    data: alert
  });
});

module.exports = router;
