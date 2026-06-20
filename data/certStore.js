const certTasks = [
  {
    id: 1,
    domain: 'example.com',
    certType: 'SSL/TLS',
    issuer: "Let's Encrypt",
    expireDate: '2026-09-15',
    status: 'active',
    autoRenewal: true,
    createdAt: '2025-09-15T10:30:00Z'
  },
  {
    id: 2,
    domain: 'api.example.com',
    certType: 'SSL/TLS',
    issuer: "Let's Encrypt",
    expireDate: '2026-08-20',
    status: 'active',
    autoRenewal: true,
    createdAt: '2025-08-20T14:20:00Z'
  },
  {
    id: 3,
    domain: 'admin.example.com',
    certType: 'SSL/TLS',
    issuer: "Let's Encrypt",
    expireDate: '2026-07-25',
    status: 'pending_renewal',
    autoRenewal: true,
    createdAt: '2025-07-25T09:15:00Z'
  }
];

const renewalRecords = [
  {
    id: 1,
    taskId: 1,
    domain: 'example.com',
    executeTime: '2026-06-15T02:00:00Z',
    status: 'success',
    result: '证书续期成功，新证书有效期至 2026-09-15',
    oldCertExpire: '2026-06-15',
    newCertExpire: '2026-09-15',
    durationMs: 12500,
    errorMessage: null,
    isRetry: false,
    retryAttempt: 0,
    originalRecordId: null
  },
  {
    id: 2,
    taskId: 2,
    domain: 'api.example.com',
    executeTime: '2026-06-10T02:00:00Z',
    status: 'success',
    result: '证书续期成功，新证书有效期至 2026-08-20',
    oldCertExpire: '2026-06-10',
    newCertExpire: '2026-08-20',
    durationMs: 15200,
    errorMessage: null,
    isRetry: false,
    retryAttempt: 0,
    originalRecordId: null
  },
  {
    id: 3,
    taskId: 3,
    domain: 'admin.example.com',
    executeTime: '2026-06-20T02:00:00Z',
    status: 'failed',
    result: '证书续期失败，ACME 挑战验证超时',
    oldCertExpire: '2026-07-25',
    newCertExpire: null,
    durationMs: 45000,
    errorMessage: 'Timeout during ACME http-01 challenge: connection refused on port 80',
    isRetry: false,
    retryAttempt: 0,
    originalRecordId: null
  },
  {
    id: 4,
    taskId: 1,
    domain: 'example.com',
    executeTime: '2026-03-15T02:00:00Z',
    status: 'success',
    result: '证书续期成功，新证书有效期至 2026-06-15',
    oldCertExpire: '2026-03-15',
    newCertExpire: '2026-06-15',
    durationMs: 11800,
    errorMessage: null,
    isRetry: false,
    retryAttempt: 0,
    originalRecordId: null
  },
  {
    id: 5,
    taskId: 2,
    domain: 'api.example.com',
    executeTime: '2026-03-10T02:00:00Z',
    status: 'failed',
    result: '证书续期失败，DNS 记录未及时生效',
    oldCertExpire: '2026-06-10',
    newCertExpire: null,
    durationMs: 52000,
    errorMessage: 'DNS TXT record not propagated after 30 attempts',
    isRetry: false,
    retryAttempt: 0,
    originalRecordId: null
  },
  {
    id: 6,
    taskId: 2,
    domain: 'api.example.com',
    executeTime: '2026-03-11T02:05:00Z',
    status: 'success',
    result: '证书续期成功，新证书有效期至 2026-06-10',
    oldCertExpire: '2026-06-10',
    newCertExpire: '2026-06-10',
    durationMs: 13200,
    errorMessage: null,
    isRetry: true,
    retryAttempt: 1,
    originalRecordId: 5
  }
];

let nextRecordId = 7;

const retryQueue = [];

const alertLog = [];

function getAllTasks() {
  return certTasks;
}

function getTaskById(id) {
  return certTasks.find(t => t.id === parseInt(id));
}

function getTaskByDomain(domain) {
  return certTasks.find(t => t.domain === domain);
}

function getAllRecords() {
  return [...renewalRecords].sort((a, b) => new Date(b.executeTime) - new Date(a.executeTime));
}

function getRecordsByTaskId(taskId) {
  return renewalRecords
    .filter(r => r.taskId === parseInt(taskId))
    .sort((a, b) => new Date(b.executeTime) - new Date(a.executeTime));
}

function getRecordsByDomain(domain) {
  return renewalRecords
    .filter(r => r.domain === domain)
    .sort((a, b) => new Date(b.executeTime) - new Date(a.executeTime));
}

function getLatestRecord(taskId = null, domain = null) {
  let records = [...renewalRecords];
  if (taskId) {
    records = records.filter(r => r.taskId === parseInt(taskId));
  }
  if (domain) {
    records = records.filter(r => r.domain === domain);
  }
  if (records.length === 0) return null;
  return records.sort((a, b) => new Date(b.executeTime) - new Date(a.executeTime))[0];
}

function getTaskStatus(taskId) {
  const task = getTaskById(taskId);
  if (!task) return null;

  const latestRecord = getLatestRecord(taskId);
  const stats = getRecordsByTaskId(taskId);

  return {
    task,
    latestExecution: latestRecord,
    totalExecutions: stats.length,
    successCount: stats.filter(r => r.status === 'success').length,
    failedCount: stats.filter(r => r.status === 'failed').length
  };
}

function updateTaskStatus(taskId, newStatus) {
  const task = certTasks.find(t => t.id === parseInt(taskId));
  if (!task) return null;
  task.status = newStatus;
  return task;
}

function addRenewalRecord(record) {
  const newRecord = {
    id: nextRecordId++,
    ...record,
    executeTime: new Date().toISOString()
  };
  renewalRecords.push(newRecord);
  return newRecord;
}

function addToRetryQueue(item) {
  const existing = retryQueue.find(
    q => q.taskId === item.taskId && q.status !== 'completed'
  );
  if (existing) return existing;

  const queueItem = {
    id: retryQueue.length + 1,
    taskId: item.taskId,
    domain: item.domain,
    originalRecordId: item.originalRecordId,
    attempt: item.attempt || 1,
    maxAttempts: item.maxAttempts || 3,
    nextRetryTime: item.nextRetryTime || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    lastError: item.lastError || null
  };
  retryQueue.push(queueItem);
  return queueItem;
}

function getRetryQueue() {
  return [...retryQueue];
}

function getRetryQueueByTaskId(taskId) {
  return retryQueue.filter(q => q.taskId === parseInt(taskId));
}

function getPendingRetries() {
  return retryQueue.filter(q => q.status === 'pending');
}

function updateRetryQueueItem(id, updates) {
  const item = retryQueue.find(q => q.id === id);
  if (!item) return null;
  Object.assign(item, updates);
  return item;
}

function removeRetryQueueItem(id) {
  const index = retryQueue.findIndex(q => q.id === id);
  if (index === -1) return false;
  retryQueue.splice(index, 1);
  return true;
}

function getFailedTasksNeedingRetry() {
  return certTasks.filter(task => {
    if (!task.autoRenewal) return false;
    const latestRecord = getLatestRecord(task.id);
    if (!latestRecord || latestRecord.status !== 'failed') return false;
    const existingRetry = retryQueue.find(
      q => q.taskId === task.id && q.status !== 'completed'
    );
    return !existingRetry;
  });
}

function getExpiringTasks(warningDays = 30) {
  const now = new Date();
  const warningThreshold = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);
  return certTasks.filter(task => {
    const expireDate = new Date(task.expireDate);
    if (expireDate <= now) {
      return task.status !== 'expired';
    }
    if (expireDate <= warningThreshold) {
      const latestRecord = getLatestRecord(task.id);
      return !latestRecord || latestRecord.status !== 'success' || new Date(latestRecord.newCertExpire) <= warningThreshold;
    }
    return false;
  });
}

function addAlert(alert) {
  const newAlert = {
    id: alertLog.length + 1,
    ...alert,
    createdAt: new Date().toISOString(),
    acknowledged: false
  };
  alertLog.push(newAlert);
  return newAlert;
}

function getAlerts(options = {}) {
  let alerts = [...alertLog].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (options.acknowledged !== undefined) {
    alerts = alerts.filter(a => a.acknowledged === options.acknowledged);
  }
  if (options.type) {
    alerts = alerts.filter(a => a.type === options.type);
  }
  if (options.taskId) {
    alerts = alerts.filter(a => a.taskId === parseInt(options.taskId));
  }
  return alerts;
}

function acknowledgeAlert(id) {
  const alert = alertLog.find(a => a.id === parseInt(id));
  if (!alert) return null;
  alert.acknowledged = true;
  alert.acknowledgedAt = new Date().toISOString();
  return alert;
}

function getUnacknowledgedAlertCount() {
  return alertLog.filter(a => !a.acknowledged).length;
}

module.exports = {
  getAllTasks,
  getTaskById,
  getTaskByDomain,
  getAllRecords,
  getRecordsByTaskId,
  getRecordsByDomain,
  getLatestRecord,
  getTaskStatus,
  updateTaskStatus,
  addRenewalRecord,
  addToRetryQueue,
  getRetryQueue,
  getRetryQueueByTaskId,
  getPendingRetries,
  updateRetryQueueItem,
  removeRetryQueueItem,
  getFailedTasksNeedingRetry,
  getExpiringTasks,
  addAlert,
  getAlerts,
  acknowledgeAlert,
  getUnacknowledgedAlertCount
};
