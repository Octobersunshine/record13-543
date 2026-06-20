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
    errorMessage: null
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
    errorMessage: null
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
    errorMessage: 'Timeout during ACME http-01 challenge: connection refused on port 80'
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
    errorMessage: null
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
    errorMessage: 'DNS TXT record not propagated after 30 attempts'
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
    errorMessage: null
  }
];

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

module.exports = {
  getAllTasks,
  getTaskById,
  getTaskByDomain,
  getAllRecords,
  getRecordsByTaskId,
  getRecordsByDomain,
  getLatestRecord,
  getTaskStatus
};
