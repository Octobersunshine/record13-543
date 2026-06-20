const express = require('express');
const router = express.Router();
const certStore = require('../data/certStore');

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

module.exports = router;
