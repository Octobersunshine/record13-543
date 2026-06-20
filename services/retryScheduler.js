const EventEmitter = require('events');
const certStore = require('../data/certStore');
const config = require('../config');

class RetryScheduler extends EventEmitter {
  constructor() {
    super();
    this.checkIntervalMs = config.retry.checkIntervalMs;
    this.maxAttempts = config.retry.maxAttempts;
    this.baseIntervalMs = config.retry.baseIntervalMs;
    this.maxIntervalMs = config.retry.maxIntervalMs;
    this.backoffMultiplier = config.retry.backoffMultiplier;
    this.timer = null;
    this.running = false;
    this.stats = {
      totalRetriesAttempted: 0,
      totalRetriesSucceeded: 0,
      totalRetriesFailed: 0,
      totalRetriesExhausted: 0,
      lastCheckTime: null
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[RetryScheduler] 自动重试调度已启动，检查间隔: ${this.checkIntervalMs / 1000}s，最大重试次数: ${this.maxAttempts}`);

    this._scanFailedTasks();

    this.timer = setInterval(() => {
      this._tick();
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('[RetryScheduler] 自动重试调度已停止');
  }

  _tick() {
    this._scanFailedTasks();
    this._processRetryQueue();
    this.stats.lastCheckTime = new Date().toISOString();
  }

  _scanFailedTasks() {
    const failedTasks = certStore.getFailedTasksNeedingRetry();
    for (const task of failedTasks) {
      const latestRecord = certStore.getLatestRecord(task.id);
      const nextRetryTime = this._calculateNextRetryTime(1);

      certStore.addToRetryQueue({
        taskId: task.id,
        domain: task.domain,
        originalRecordId: latestRecord.id,
        attempt: 1,
        maxAttempts: this.maxAttempts,
        nextRetryTime: nextRetryTime.toISOString(),
        lastError: latestRecord.errorMessage
      });

      console.log(`[RetryScheduler] 检测到失败任务 #${task.id} (${task.domain})，已加入重试队列，下次重试: ${nextRetryTime.toISOString()}`);

      certStore.addAlert({
        type: 'retry_scheduled',
        taskId: task.id,
        domain: task.domain,
        level: 'warning',
        title: '续期失败，已安排自动重试',
        message: `域名 ${task.domain} 证书续期失败，已自动安排重试。失败原因: ${latestRecord.errorMessage}`,
        metadata: {
          originalRecordId: latestRecord.id,
          attempt: 1,
          maxAttempts: this.maxAttempts,
          nextRetryTime: nextRetryTime.toISOString()
        }
      });

      this.emit('retry_scheduled', { taskId: task.id, domain: task.domain, attempt: 1 });
    }
  }

  _processRetryQueue() {
    const pendingRetries = certStore.getPendingRetries();
    const now = new Date();

    for (const item of pendingRetries) {
      if (new Date(item.nextRetryTime) <= now) {
        this._executeRetry(item);
      }
    }
  }

  async _executeRetry(item) {
    certStore.updateRetryQueueItem(item.id, { status: 'retrying' });

    console.log(`[RetryScheduler] 正在重试任务 #${item.taskId} (${item.domain})，第 ${item.attempt}/${item.maxAttempts} 次重试`);

    this.emit('retry_started', {
      taskId: item.taskId,
      domain: item.domain,
      attempt: item.attempt,
      maxAttempts: item.maxAttempts
    });

    this.stats.totalRetriesAttempted++;

    const result = await this._simulateRenewal(item);

    if (result.success) {
      certStore.updateRetryQueueItem(item.id, { status: 'completed' });

      const newRecord = certStore.addRenewalRecord({
        taskId: item.taskId,
        domain: item.domain,
        status: 'success',
        result: result.message,
        oldCertExpire: result.oldCertExpire,
        newCertExpire: result.newCertExpire,
        durationMs: result.durationMs,
        errorMessage: null,
        isRetry: true,
        retryAttempt: item.attempt,
        originalRecordId: item.originalRecordId
      });

      certStore.updateTaskStatus(item.taskId, 'active');

      this.stats.totalRetriesSucceeded++;

      console.log(`[RetryScheduler] 重试成功！任务 #${item.taskId} (${item.domain})，第 ${item.attempt} 次重试`);

      certStore.addAlert({
        type: 'retry_success',
        taskId: item.taskId,
        domain: item.domain,
        level: 'info',
        title: '续期重试成功',
        message: `域名 ${item.domain} 证书续期重试成功（第 ${item.attempt} 次重试），新证书有效期至 ${result.newCertExpire}`,
        metadata: {
          retryAttempt: item.attempt,
          newRecordId: newRecord.id,
          newCertExpire: result.newCertExpire
        }
      });

      this.emit('retry_success', {
        taskId: item.taskId,
        domain: item.domain,
        attempt: item.attempt,
        newRecord
      });

    } else {
      if (item.attempt >= item.maxAttempts) {
        certStore.updateRetryQueueItem(item.id, {
          status: 'completed',
          lastError: result.error
        });

        this.stats.totalRetriesExhausted++;

        console.error(`[RetryScheduler] 重试已耗尽！任务 #${item.taskId} (${item.domain})，已重试 ${item.maxAttempts} 次均失败`);

        certStore.addAlert({
          type: 'retry_exhausted',
          taskId: item.taskId,
          domain: item.domain,
          level: 'critical',
          title: '续期重试已耗尽，需人工介入',
          message: `域名 ${item.domain} 证书续期已重试 ${item.maxAttempts} 次均失败，证书即将过期，请立即人工处理！最后错误: ${result.error}`,
          metadata: {
            totalAttempts: item.maxAttempts,
            lastError: result.error
          }
        });

        this.emit('retry_exhausted', {
          taskId: item.taskId,
          domain: item.domain,
          totalAttempts: item.maxAttempts,
          lastError: result.error
        });

      } else {
        const nextAttempt = item.attempt + 1;
        const nextRetryTime = this._calculateNextRetryTime(nextAttempt);

        certStore.updateRetryQueueItem(item.id, {
          attempt: nextAttempt,
          nextRetryTime: nextRetryTime.toISOString(),
          status: 'pending',
          lastError: result.error
        });

        this.stats.totalRetriesFailed++;

        console.warn(`[RetryScheduler] 重试失败，任务 #${item.taskId} (${item.domain})，第 ${item.attempt} 次重试失败，下次重试: ${nextRetryTime.toISOString()}`);

        certStore.addAlert({
          type: 'retry_failed',
          taskId: item.taskId,
          domain: item.domain,
          level: 'warning',
          title: '续期重试失败，将再次重试',
          message: `域名 ${item.domain} 证书续期第 ${item.attempt} 次重试失败，将在 ${this._formatDuration(nextRetryTime - new Date())} 后进行第 ${nextAttempt} 次重试。错误: ${result.error}`,
          metadata: {
            attempt: item.attempt,
            nextAttempt,
            nextRetryTime: nextRetryTime.toISOString(),
            error: result.error
          }
        });

        this.emit('retry_failed', {
          taskId: item.taskId,
          domain: item.domain,
          attempt: item.attempt,
          nextAttempt,
          nextRetryTime,
          error: result.error
        });
      }
    }
  }

  _calculateNextRetryTime(attempt) {
    const delayMs = Math.min(
      this.baseIntervalMs * Math.pow(this.backoffMultiplier, attempt - 1),
      this.maxIntervalMs
    );
    return new Date(Date.now() + delayMs);
  }

  _formatDuration(ms) {
    if (ms < 60000) return `${Math.round(ms / 1000)} 秒`;
    if (ms < 3600000) return `${Math.round(ms / 60000)} 分钟`;
    return `${Math.round(ms / 3600000)} 小时`;
  }

  async _simulateRenewal(item) {
    const task = certStore.getTaskById(item.taskId);
    if (!task) {
      return { success: false, error: '任务不存在' };
    }

    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    const successRate = Math.min(0.3 + item.attempt * 0.2, 0.8);
    const isSuccess = Math.random() < successRate;

    if (isSuccess) {
      const now = new Date();
      const newExpire = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      return {
        success: true,
        message: `证书续期成功（第 ${item.attempt} 次重试），新证书有效期至 ${newExpire.toISOString().split('T')[0]}`,
        oldCertExpire: task.expireDate,
        newCertExpire: newExpire.toISOString().split('T')[0],
        durationMs: Math.round(8000 + Math.random() * 20000)
      };
    }

    const errors = [
      'ACME challenge verification timeout',
      'DNS propagation delay',
      'Rate limit exceeded from CA',
      'Connection refused on port 443',
      'Certificate signing request rejected'
    ];
    const error = errors[Math.floor(Math.random() * errors.length)];
    return { success: false, error };
  }

  triggerManualRetry(taskId) {
    const task = certStore.getTaskById(taskId);
    if (!task) {
      return { success: false, error: '任务不存在' };
    }

    const latestRecord = certStore.getLatestRecord(taskId);
    if (!latestRecord) {
      return { success: false, error: '暂无续期记录' };
    }

    const existingPending = certStore.getRetryQueueByTaskId(taskId).find(q => q.status === 'pending');
    if (existingPending) {
      return {
        success: true,
        message: '该任务已在重试队列中',
        data: existingPending
      };
    }

    const nextRetryTime = new Date(Date.now() + 5000);
    const queueItem = certStore.addToRetryQueue({
      taskId: task.id,
      domain: task.domain,
      originalRecordId: latestRecord.id,
      attempt: 1,
      maxAttempts: this.maxAttempts,
      nextRetryTime: nextRetryTime.toISOString(),
      lastError: latestRecord.errorMessage
    });

    console.log(`[RetryScheduler] 手动触发重试: 任务 #${task.id} (${task.domain})`);

    this.emit('manual_retry', { taskId: task.id, domain: task.domain });

    return { success: true, message: '已加入重试队列', data: queueItem };
  }

  getRetryStats() {
    const queue = certStore.getRetryQueue();
    return {
      ...this.stats,
      queueStatus: {
        total: queue.length,
        pending: queue.filter(q => q.status === 'pending').length,
        retrying: queue.filter(q => q.status === 'retrying').length,
        completed: queue.filter(q => q.status === 'completed').length
      },
      isRunning: this.running,
      config: {
        checkIntervalMs: this.checkIntervalMs,
        maxAttempts: this.maxAttempts,
        baseIntervalMs: this.baseIntervalMs,
        maxIntervalMs: this.maxIntervalMs,
        backoffMultiplier: this.backoffMultiplier
      }
    };
  }
}

const instance = new RetryScheduler();

module.exports = instance;
