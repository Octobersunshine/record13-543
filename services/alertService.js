const EventEmitter = require('events');
const config = require('../config');

const ALERT_CATEGORIES = {
  CERT_EXPIRY: 'cert_expiry',
  RENEWAL_FAILURE: 'renewal_failure',
  RETRY: 'retry'
};

const ALERT_TYPES = {
  CERT_EXPIRED: 'cert_expired',
  CERT_CRITICAL: 'cert_critical',
  CERT_WARNING: 'cert_warning',
  RENEWAL_NETWORK_TIMEOUT: 'renewal_network_timeout',
  RENEWAL_DNS_ERROR: 'renewal_dns_error',
  RENEWAL_ACME_CHALLENGE: 'renewal_acme_challenge',
  RENEWAL_CA_RATE_LIMIT: 'renewal_ca_rate_limit',
  RENEWAL_CA_REJECTED: 'renewal_ca_rejected',
  RENEWAL_UNKNOWN: 'renewal_unknown',
  RETRY_SCHEDULED: 'retry_scheduled',
  RETRY_SUCCESS: 'retry_success',
  RETRY_FAILED: 'retry_failed',
  RETRY_EXHAUSTED: 'retry_exhausted',
  RETRY_MANUAL_TRIGGERED: 'retry_manual_triggered'
};

const ALERT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

const ERROR_TYPE_RULES = [
  {
    pattern: /timeout|timed out/i,
    type: ALERT_TYPES.RENEWAL_NETWORK_TIMEOUT,
    category: ALERT_CATEGORIES.RENEWAL_FAILURE,
    level: ALERT_LEVELS.WARNING,
    label: '网络超时'
  },
  {
    pattern: /dns|domain name|propagation/i,
    type: ALERT_TYPES.RENEWAL_DNS_ERROR,
    category: ALERT_CATEGORIES.RENEWAL_FAILURE,
    level: ALERT_LEVELS.WARNING,
    label: 'DNS 解析错误'
  },
  {
    pattern: /acme|challenge|http-01|dns-01|tls-alpn-01/i,
    type: ALERT_TYPES.RENEWAL_ACME_CHALLENGE,
    category: ALERT_CATEGORIES.RENEWAL_FAILURE,
    level: ALERT_LEVELS.WARNING,
    label: 'ACME 挑战验证失败'
  },
  {
    pattern: /rate.?limit|too many requests|429/i,
    type: ALERT_TYPES.RENEWAL_CA_RATE_LIMIT,
    category: ALERT_CATEGORIES.RENEWAL_FAILURE,
    level: ALERT_LEVELS.WARNING,
    label: 'CA 接口限流'
  },
  {
    pattern: /reject|refused|invalid csr|signing/i,
    type: ALERT_TYPES.RENEWAL_CA_REJECTED,
    category: ALERT_CATEGORIES.RENEWAL_FAILURE,
    level: ALERT_LEVELS.CRITICAL,
    label: 'CA 拒绝签发'
  }
];

const ALERT_TYPE_META = {
  [ALERT_TYPES.CERT_EXPIRED]: {
    category: ALERT_CATEGORIES.CERT_EXPIRY,
    level: ALERT_LEVELS.CRITICAL,
    label: '证书已过期',
    icon: '🔴',
    channels: ['console', 'webhook', 'email', 'sms']
  },
  [ALERT_TYPES.CERT_CRITICAL]: {
    category: ALERT_CATEGORIES.CERT_EXPIRY,
    level: ALERT_LEVELS.CRITICAL,
    label: '证书即将过期（紧急）',
    icon: '🟠',
    channels: ['console', 'webhook', 'email']
  },
  [ALERT_TYPES.CERT_WARNING]: {
    category: ALERT_CATEGORIES.CERT_EXPIRY,
    level: ALERT_LEVELS.WARNING,
    label: '证书即将过期（预警）',
    icon: '🟡',
    channels: ['console', 'webhook']
  },
  [ALERT_TYPES.RENEWAL_NETWORK_TIMEOUT]: {
    category: ALERT_CATEGORIES.RENEWAL_FAILURE,
    level: ALERT_LEVELS.WARNING,
    label: '续期失败：网络超时',
    icon: '⏱️',
    channels: ['console', 'webhook']
  },
  [ALERT_TYPES.RENEWAL_DNS_ERROR]: {
    category: ALERT_CATEGORIES.RENEWAL_FAILURE,
    level: ALERT_LEVELS.WARNING,
    label: '续期失败：DNS 解析错误',
    icon: '🌐',
    channels: ['console', 'webhook']
  },
  [ALERT_TYPES.RENEWAL_ACME_CHALLENGE]: {
    category: ALERT_CATEGORIES.RENEWAL_FAILURE,
    level: ALERT_LEVELS.WARNING,
    label: '续期失败：ACME 挑战验证失败',
    icon: '🔐',
    channels: ['console', 'webhook']
  },
  [ALERT_TYPES.RENEWAL_CA_RATE_LIMIT]: {
    category: ALERT_CATEGORIES.RENEWAL_FAILURE,
    level: ALERT_LEVELS.WARNING,
    label: '续期失败：CA 接口限流',
    icon: '🚦',
    channels: ['console', 'webhook']
  },
  [ALERT_TYPES.RENEWAL_CA_REJECTED]: {
    category: ALERT_CATEGORIES.RENEWAL_FAILURE,
    level: ALERT_LEVELS.CRITICAL,
    label: '续期失败：CA 拒绝签发',
    icon: '❌',
    channels: ['console', 'webhook', 'email']
  },
  [ALERT_TYPES.RENEWAL_UNKNOWN]: {
    category: ALERT_CATEGORIES.RENEWAL_FAILURE,
    level: ALERT_LEVELS.WARNING,
    label: '续期失败：未知错误',
    icon: '❓',
    channels: ['console', 'webhook']
  },
  [ALERT_TYPES.RETRY_SCHEDULED]: {
    category: ALERT_CATEGORIES.RETRY,
    level: ALERT_LEVELS.WARNING,
    label: '已安排自动重试',
    icon: '🔄',
    channels: ['console', 'webhook']
  },
  [ALERT_TYPES.RETRY_SUCCESS]: {
    category: ALERT_CATEGORIES.RETRY,
    level: ALERT_LEVELS.INFO,
    label: '重试成功',
    icon: '✅',
    channels: ['console']
  },
  [ALERT_TYPES.RETRY_FAILED]: {
    category: ALERT_CATEGORIES.RETRY,
    level: ALERT_LEVELS.WARNING,
    label: '重试失败',
    icon: '⚠️',
    channels: ['console', 'webhook']
  },
  [ALERT_TYPES.RETRY_EXHAUSTED]: {
    category: ALERT_CATEGORIES.RETRY,
    level: ALERT_LEVELS.CRITICAL,
    label: '重试已耗尽',
    icon: '🚨',
    channels: ['console', 'webhook', 'email', 'sms']
  },
  [ALERT_TYPES.RETRY_MANUAL_TRIGGERED]: {
    category: ALERT_CATEGORIES.RETRY,
    level: ALERT_LEVELS.INFO,
    label: '手动触发重试',
    icon: '🖐️',
    channels: ['console']
  }
};

const PUSH_CHANNELS = {
  CONSOLE: 'console',
  WEBHOOK: 'webhook',
  EMAIL: 'email',
  SMS: 'sms'
};

class AlertService extends EventEmitter {
  constructor() {
    super();
    this.pushHistory = [];
    this.alertDedupCache = new Map();
    this.stats = {
      totalAlerts: 0,
      totalPushes: 0,
      totalDeduplicated: 0,
      byType: {},
      byLevel: {},
      byChannel: {},
      byCategory: {},
      lastAlertTime: null
    };
    this.dedupIntervalMs = config.alert.dedupIntervalMs;
    this.channels = config.alert.channels;
  }

  classifyError(errorMessage) {
    if (!errorMessage) {
      return {
        type: ALERT_TYPES.RENEWAL_UNKNOWN,
        ...ALERT_TYPE_META[ALERT_TYPES.RENEWAL_UNKNOWN]
      };
    }
    for (const rule of ERROR_TYPE_RULES) {
      if (rule.pattern.test(errorMessage)) {
        return {
          type: rule.type,
          category: rule.category,
          level: rule.level,
          label: rule.label,
          ...ALERT_TYPE_META[rule.type]
        };
      }
    }
    return {
      type: ALERT_TYPES.RENEWAL_UNKNOWN,
      ...ALERT_TYPE_META[ALERT_TYPES.RENEWAL_UNKNOWN]
    };
  }

  getAlertTypeMeta(type) {
    return ALERT_TYPE_META[type] || null;
  }

  getAllAlertTypes() {
    return Object.entries(ALERT_TYPE_META).map(([type, meta]) => ({
      type,
      ...meta
    }));
  }

  getAllCategories() {
    return [
      { id: ALERT_CATEGORIES.CERT_EXPIRY, name: '证书过期', types: [ALERT_TYPES.CERT_EXPIRED, ALERT_TYPES.CERT_CRITICAL, ALERT_TYPES.CERT_WARNING] },
      { id: ALERT_CATEGORIES.RENEWAL_FAILURE, name: '续期失败', types: [ALERT_TYPES.RENEWAL_NETWORK_TIMEOUT, ALERT_TYPES.RENEWAL_DNS_ERROR, ALERT_TYPES.RENEWAL_ACME_CHALLENGE, ALERT_TYPES.RENEWAL_CA_RATE_LIMIT, ALERT_TYPES.RENEWAL_CA_REJECTED, ALERT_TYPES.RENEWAL_UNKNOWN] },
      { id: ALERT_CATEGORIES.RETRY, name: '重试相关', types: [ALERT_TYPES.RETRY_SCHEDULED, ALERT_TYPES.RETRY_SUCCESS, ALERT_TYPES.RETRY_FAILED, ALERT_TYPES.RETRY_EXHAUSTED, ALERT_TYPES.RETRY_MANUAL_TRIGGERED] }
    ];
  }

  _isDuplicate(taskId, type) {
    const key = `${taskId}:${type}`;
    const now = Date.now();
    const lastTime = this.alertDedupCache.get(key);
    if (lastTime && (now - lastTime) < this.dedupIntervalMs) {
      return true;
    }
    this.alertDedupCache.set(key, now);
    return false;
  }

  async pushAlert(alertData, options = {}) {
    const { force = false } = options;
    const meta = ALERT_TYPE_META[alertData.type];
    if (!meta) {
      console.error(`[AlertService] 未知告警类型: ${alertData.type}`);
      return null;
    }

    const alert = {
      ...alertData,
      category: meta.category,
      level: meta.level,
      label: meta.label,
      icon: meta.icon,
      pushTime: new Date().toISOString()
    };

    this.stats.totalAlerts++;
    this.stats.lastAlertTime = alert.pushTime;
    this.stats.byType[alert.type] = (this.stats.byType[alert.type] || 0) + 1;
    this.stats.byLevel[alert.level] = (this.stats.byLevel[alert.level] || 0) + 1;
    this.stats.byCategory[alert.category] = (this.stats.byCategory[alert.category] || 0) + 1;

    if (!force && this._isDuplicate(alert.taskId, alert.type)) {
      this.stats.totalDeduplicated++;
      console.log(`[AlertService] [去重] ${meta.icon} ${alert.type} - ${alert.domain} (${alert.title})`);
      this.emit('alert_deduplicated', alert);
      return { ...alert, deduplicated: true };
    }

    const pushResults = [];
    for (const channel of meta.channels) {
      if (!this.channels[channel]?.enabled) continue;
      const result = await this._pushToChannel(channel, alert);
      pushResults.push(result);
      if (result.success) {
        this.stats.totalPushes++;
        this.stats.byChannel[channel] = (this.stats.byChannel[channel] || 0) + 1;
      }
    }

    const historyItem = {
      id: this.pushHistory.length + 1,
      ...alert,
      pushResults,
      channelsPushed: pushResults.filter(r => r.success).map(r => r.channel)
    };
    this.pushHistory.push(historyItem);

    this.emit('alert_pushed', alert, pushResults);

    console.log(`[AlertService] [${alert.level.toUpperCase()}] ${meta.icon} [${meta.label}] ${alert.domain} - ${alert.title}`);

    return historyItem;
  }

  async _pushToChannel(channel, alert) {
    const startTime = Date.now();
    try {
      switch (channel) {
        case PUSH_CHANNELS.CONSOLE:
          return await this._pushConsole(alert, startTime);
        case PUSH_CHANNELS.WEBHOOK:
          return await this._pushWebhook(alert, startTime);
        case PUSH_CHANNELS.EMAIL:
          return await this._pushEmail(alert, startTime);
        case PUSH_CHANNELS.SMS:
          return await this._pushSms(alert, startTime);
        default:
          return {
            channel,
            success: false,
            durationMs: Date.now() - startTime,
            error: `未知推送渠道: ${channel}`
          };
      }
    } catch (err) {
      return {
        channel,
        success: false,
        durationMs: Date.now() - startTime,
        error: err.message
      };
    }
  }

  async _pushConsole(alert, startTime) {
    const meta = ALERT_TYPE_META[alert.type];
    const logFn = alert.level === ALERT_LEVELS.CRITICAL ? console.error : alert.level === ALERT_LEVELS.WARNING ? console.warn : console.info;
    logFn(`[告警推送][控制台] ${meta.icon} [${alert.level.toUpperCase()}] [${meta.label}] ${alert.domain} | ${alert.title} | ${alert.message}`);
    return {
      channel: PUSH_CHANNELS.CONSOLE,
      success: true,
      durationMs: Date.now() - startTime
    };
  }

  async _pushWebhook(alert, startTime) {
    const webhookUrl = this.channels.webhook?.url;
    if (!webhookUrl) {
      return {
        channel: PUSH_CHANNELS.WEBHOOK,
        success: false,
        durationMs: Date.now() - startTime,
        error: '未配置 Webhook URL'
      };
    }
    await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
    return {
      channel: PUSH_CHANNELS.WEBHOOK,
      success: true,
      durationMs: Date.now() - startTime,
      endpoint: webhookUrl
    };
  }

  async _pushEmail(alert, startTime) {
    const recipients = this.channels.email?.recipients || [];
    await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 30));
    return {
      channel: PUSH_CHANNELS.EMAIL,
      success: true,
      durationMs: Date.now() - startTime,
      recipients,
      subject: `[证书续期告警] ${alert.icon} ${alert.label} - ${alert.domain}`
    };
  }

  async _pushSms(alert, startTime) {
    const recipients = this.channels.sms?.recipients || [];
    await new Promise(resolve => setTimeout(resolve, 15 + Math.random() * 25));
    return {
      channel: PUSH_CHANNELS.SMS,
      success: true,
      durationMs: Date.now() - startTime,
      recipients
    };
  }

  getPushHistory(options = {}) {
    let history = [...this.pushHistory].sort((a, b) => new Date(b.pushTime) - new Date(a.pushTime));
    if (options.type) history = history.filter(h => h.type === options.type);
    if (options.level) history = history.filter(h => h.level === options.level);
    if (options.category) history = history.filter(h => h.category === options.category);
    if (options.taskId) history = history.filter(h => h.taskId === parseInt(options.taskId));
    if (options.domain) history = history.filter(h => h.domain === options.domain);
    if (options.limit) history = history.slice(0, options.limit);
    return history;
  }

  getAlertStats() {
    return {
      ...this.stats,
      alertTypes: ALERT_TYPES,
      alertCategories: this.getAllCategories(),
      alertLevels: ALERT_LEVELS,
      pushChannels: PUSH_CHANNELS,
      config: {
        dedupIntervalMs: this.dedupIntervalMs,
        channels: Object.entries(this.channels).map(([id, cfg]) => ({ id, enabled: cfg.enabled, ...cfg }))
      },
      recentHistory: this.getPushHistory({ limit: 20 }),
      alertTypeMeta: ALERT_TYPE_META
    };
  }

  clearDedupCache() {
    const count = this.alertDedupCache.size;
    this.alertDedupCache.clear();
    return count;
  }
}

const instance = new AlertService();

module.exports = instance;
module.exports.ALERT_TYPES = ALERT_TYPES;
module.exports.ALERT_LEVELS = ALERT_LEVELS;
module.exports.ALERT_CATEGORIES = ALERT_CATEGORIES;
module.exports.PUSH_CHANNELS = PUSH_CHANNELS;
module.exports.ALERT_TYPE_META = ALERT_TYPE_META;
