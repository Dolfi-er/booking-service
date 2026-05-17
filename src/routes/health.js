const metrics = require('../services/metrics');

const ERROR_RATE_THRESHOLD = () =>
  parseFloat(process.env.ERROR_RATE_THRESHOLD || '0.8');

function registerRoutes(app) {
  // Liveness — process is up
  app.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'alive' });
  });

  // Readiness — fails if error rate too high (critical degradation)
  app.get('/health/ready', (_req, res) => {
    const { counters } = metrics.getSnapshot();
    const total = counters.transitionsOk + counters.transitionsErr;
    const errorRate = total === 0 ? 0 : counters.transitionsErr / total;

    if (errorRate >= ERROR_RATE_THRESHOLD()) {
      return res.status(503).json({
        status: 'not ready',
        reason: `Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold`,
      });
    }
    return res.status(200).json({ status: 'ready', errorRate: errorRate.toFixed(3) });
  });

  // Metrics snapshot
  app.get('/metrics', (_req, res) => {
    res.status(200).json(metrics.getSnapshot());
  });
}

module.exports = { registerRoutes };