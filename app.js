const express = require('express');
const certRoutes = require('./routes/certRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.json({
    code: 0,
    message: '证书续期任务状态查询 API',
    data: {
      endpoints: [
        { method: 'GET', path: '/api/cert/tasks', description: '获取所有证书续期任务列表' },
        { method: 'GET', path: '/api/cert/tasks/:id', description: '获取指定任务详情' },
        { method: 'GET', path: '/api/cert/tasks/:id/status', description: '获取指定任务状态及统计信息' },
        { method: 'GET', path: '/api/cert/tasks/:id/records', description: '获取指定任务的所有续期记录' },
        { method: 'GET', path: '/api/cert/tasks/:id/records/latest', description: '获取指定任务最近一次续期执行结果' },
        { method: 'GET', path: '/api/cert/records', description: '获取所有续期记录（支持 ?domain= 查询）' },
        { method: 'GET', path: '/api/cert/records/latest', description: '获取最近一次续期执行结果（支持 ?taskId= 或 ?domain=）' },
        { method: 'GET', path: '/api/cert/domain/:domain/status', description: '按域名获取任务状态' },
        { method: 'GET', path: '/api/cert/domain/:domain/latest', description: '按域名获取最近一次续期执行结果' }
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

app.listen(PORT, () => {
  console.log(`
  ╔═════════════════════════════════════════════════════════╗
  ║                                                         ║
  ║   证书续期任务状态查询服务已启动                         ║
  ║                                                         ║
  ║   服务地址: http://localhost:${PORT}                        ║
  ║                                                         ║
  ║   示例接口:                                             ║
  ║   • GET /api/cert/tasks                                 ║
  ║   • GET /api/cert/tasks/1/records/latest                ║
  ║   • GET /api/cert/domain/example.com/latest             ║
  ║                                                         ║
  ╚═════════════════════════════════════════════════════════╝
  `);
});
