const EventEmitter = require('events');
const certStore = require('../data/certStore');
const config = require('../config');
const alertService = require('./alertService');
const { ALERT_TYPES } = alertService;

class ExpiryMonitor extends EventEmitter {
  constructor() {
    super();
    this.checkIntervalMs = config.monitor.checkIntervalMs;
    this.warningDays = config.monitor.warningDays;
    this.criticalDays = config.monitor.criticalDays;
    this.timer = null;
    this.running = false;
    this.stats = {
      totalChecks: 0,
      totalWarnings: 0,
      totalCritical: 0,
      totalExpired: 0,
      lastCheckTime: null
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`[ExpiryMonitor] 证书过期监控已启动，检查间隔: ${this.checkIntervalMs / 1000}s，预警天数: ${this.warningDays}天，紧急天数: ${this.criticalDays}天`);

    this._check();

    this.timer = setInterval(() => {
      this._check();
    }, this.checkIntervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('[ExpiryMonitor] 证书过期监控已停止');
  }

  _check() {
    this.stats.totalChecks++;
    this.stats.lastCheckTime = new Date().toISOString();
    const now = new Date();

    const tasks = certStore.getAllTasks();
    for (const task of tasks) {
      const expireDate = new Date(task.expireDate);
      const daysRemaining = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));

      if (daysRemaining <= 0) {
        this._handleExpired(task, daysRemaining);
      } else if (daysRemaining <= this.criticalDays) {
        this._handleCritical(task, daysRemaining);
      } else if (daysRemaining <= this.warningDays) {
        this._handleWarning(task, daysRemaining);
      }
    }
  }

  _handleExpired(task, daysRemaining) {
    certStore.updateTaskStatus(task.id, 'expired');
    this.stats.totalExpired++;

    const expiredDays = Math.abs(daysRemaining);
    console.error(`[ExpiryMonitor] 🔴 证书已过期！域名: ${task.domain}，已过期 ${expiredDays} 天`);

    const severityLevel = expiredDays > 7 ? 'critical' : expiredDays > 3 ? 'critical' : 'critical';

    certStore.addAlert({
      type: ALERT_TYPES.CERT_EXPIRED,
      taskId: task.id,
      domain: task.domain,
      level: severityLevel,
      title: `证书已过期 ${expiredDays} 天，业务站点可能无法访问`,
      message: `域名 ${task.domain} 的 SSL/TLS 证书已于 ${expiredDays} 天前过期，业务站点可能无法正常访问！请立即手动续期。`,
      metadata: {
        daysRemaining,
        expiredDays,
        expireDate: task.expireDate,
        certType: task.certType,
        issuer: task.issuer,
        severity: expiredDays > 7 ? 'extreme' : expiredDays > 3 ? 'severe' : 'urgent'
      }
    });

    alertService.pushAlert({
      type: ALERT_TYPES.CERT_EXPIRED,
      taskId: task.id,
      domain: task.domain,
      title: `【紧急】证书已过期 ${expiredDays} 天 - ${task.domain}`,
      message: `域名 ${task.domain} 的 SSL/TLS 证书已于 ${expiredDays} 天前过期，业务站点可能无法正常访问！请立即手动续期。证书信息：类型=${task.certType}，颁发机构=${task.issuer}，到期日=${task.expireDate}`,
      metadata: {
        daysRemaining,
        expiredDays,
        expireDate: task.expireDate,
        certType: task.certType,
        issuer: task.issuer,
        severity: expiredDays > 7 ? 'extreme' : expiredDays > 3 ? 'severe' : 'urgent'
      }
    });

    this.emit('cert_expired', { task, daysRemaining, expiredDays });
  }

  _handleCritical(task, daysRemaining) {
    this.stats.totalCritical++;

    const latestRecord = certStore.getLatestRecord(task.id);
    const hasRetryInProgress = certStore.getRetryQueueByTaskId(task.id).some(q => q.status === 'pending' || q.status === 'retrying');
    const latestStatus = latestRecord ? latestRecord.status : 'none';

    if (!hasRetryInProgress && latestStatus !== 'success') {
      console.warn(`[ExpiryMonitor] 🔴 紧急：域名 ${task.domain} 证书将在 ${daysRemaining} 天后过期，且无重试进行中`);

      certStore.addAlert({
        type: ALERT_TYPES.CERT_CRITICAL,
        taskId: task.id,
        domain: task.domain,
        level: 'critical',
        title: `证书将在 ${daysRemaining} 天后过期，需紧急处理`,
        message: `域名 ${task.domain} 的证书将在 ${daysRemaining} 天后过期，且续期状态异常（${latestStatus}），无重试进行中。请立即手动续期或触发重试！`,
        metadata: {
          daysRemaining,
          expireDate: task.expireDate,
          latestRecordStatus: latestStatus,
          hasRetryInProgress: false,
          urgency: daysRemaining <= 1 ? 'immediate' : daysRemaining <= 3 ? 'urgent' : 'important'
        }
      });

      alertService.pushAlert({
        type: ALERT_TYPES.CERT_CRITICAL,
        taskId: task.id,
        domain: task.domain,
        title: `【紧急】证书将在 ${daysRemaining} 天后过期 - ${task.domain}`,
        message: `域名 ${task.domain} 的证书将在 ${daysRemaining} 天后过期，且续期失败无重试进行中。请立即手动续期或触发重试！到期日: ${task.expireDate}`,
        metadata: {
          daysRemaining,
          expireDate: task.expireDate,
          latestRecordStatus: latestStatus,
          hasRetryInProgress: false,
          urgency: daysRemaining <= 1 ? 'immediate' : daysRemaining <= 3 ? 'urgent' : 'important'
        }
      });

      this.emit('cert_critical', { task, daysRemaining, hasRetryInProgress: false, latestStatus });
    } else {
      console.info(`[ExpiryMonitor] 🟠 紧急：域名 ${task.domain} 证书将在 ${daysRemaining} 天后过期（重试进行中）`);

      certStore.addAlert({
        type: ALERT_TYPES.CERT_CRITICAL,
        taskId: task.id,
        domain: task.domain,
        level: 'warning',
        title: `证书将在 ${daysRemaining} 天后过期，重试进行中`,
        message: `域名 ${task.domain} 的证书将在 ${daysRemaining} 天后过期，自动重试正在进行中。若重试失败，请立即手动处理。`,
        metadata: {
          daysRemaining,
          expireDate: task.expireDate,
          hasRetryInProgress: true,
          urgency: daysRemaining <= 1 ? 'immediate' : daysRemaining <= 3 ? 'urgent' : 'important'
        }
      });

      alertService.pushAlert({
        type: ALERT_TYPES.CERT_CRITICAL,
        taskId: task.id,
        domain: task.domain,
        title: `证书将在 ${daysRemaining} 天后过期（重试中） - ${task.domain}`,
        message: `域名 ${task.domain} 的证书将在 ${daysRemaining} 天后过期，自动重试正在进行中。若重试失败，请立即手动处理。到期日: ${task.expireDate}`,
        metadata: {
          daysRemaining,
          expireDate: task.expireDate,
          hasRetryInProgress: true,
          urgency: daysRemaining <= 1 ? 'immediate' : daysRemaining <= 3 ? 'urgent' : 'important'
        }
      });

      this.emit('cert_critical', { task, daysRemaining, hasRetryInProgress: true, latestStatus });
    }
  }

  _handleWarning(task, daysRemaining) {
    this.stats.totalWarnings++;

    const latestRecord = certStore.getLatestRecord(task.id);
    const latestStatus = latestRecord ? latestRecord.status : 'none';

    if (latestStatus !== 'success') {
      console.warn(`[ExpiryMonitor] 🟡 预警：域名 ${task.domain} 证书将在 ${daysRemaining} 天后过期，续期状态异常`);

      certStore.addAlert({
        type: ALERT_TYPES.CERT_WARNING,
        taskId: task.id,
        domain: task.domain,
        level: 'warning',
        title: `证书将在 ${daysRemaining} 天后过期预警`,
        message: `域名 ${task.domain} 的证书将在 ${daysRemaining} 天后过期，请确认续期安排。当前续期状态: ${latestStatus}`,
        metadata: {
          daysRemaining,
          expireDate: task.expireDate,
          latestRecordStatus: latestStatus,
          urgency: daysRemaining <= 15 ? 'important' : 'notice'
        }
      });

      alertService.pushAlert({
        type: ALERT_TYPES.CERT_WARNING,
        taskId: task.id,
        domain: task.domain,
        title: `证书将在 ${daysRemaining} 天后过期预警 - ${task.domain}`,
        message: `域名 ${task.domain} 的证书将在 ${daysRemaining} 天后过期，请确认续期安排。当前续期状态: ${latestStatus}，到期日: ${task.expireDate}`,
        metadata: {
          daysRemaining,
          expireDate: task.expireDate,
          latestRecordStatus: latestStatus,
          urgency: daysRemaining <= 15 ? 'important' : 'notice'
        }
      });

      this.emit('cert_warning', { task, daysRemaining, latestStatus });
    }
  }

  getExpiryReport() {
    const tasks = certStore.getAllTasks();
    const now = new Date();

    return tasks.map(task => {
      const expireDate = new Date(task.expireDate);
      const daysRemaining = Math.ceil((expireDate - now) / (1000 * 60 * 60 * 24));
      const latestRecord = certStore.getLatestRecord(task.id);
      const retryQueue = certStore.getRetryQueueByTaskId(task.id);

      let riskLevel = 'safe';
      if (daysRemaining <= 0) riskLevel = 'expired';
      else if (daysRemaining <= this.criticalDays) riskLevel = 'critical';
      else if (daysRemaining <= this.warningDays) riskLevel = 'warning';

      return {
        taskId: task.id,
        domain: task.domain,
        certType: task.certType,
        issuer: task.issuer,
        expireDate: task.expireDate,
        daysRemaining,
        riskLevel,
        taskStatus: task.status,
        latestRenewalStatus: latestRecord ? latestRecord.status : 'none',
        hasRetryInProgress: retryQueue.some(q => q.status === 'pending' || q.status === 'retrying'),
        retryQueueCount: retryQueue.length
      };
    }).sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  getMonitorStats() {
    return {
      ...this.stats,
      isRunning: this.running,
      config: {
        checkIntervalMs: this.checkIntervalMs,
        warningDays: this.warningDays,
        criticalDays: this.criticalDays
      }
    };
  }
}

const instance = new ExpiryMonitor();

module.exports = instance;
