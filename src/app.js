const express = require('express');
const { randomUUID } = require('node:crypto');
const bookingRoutes = require('./routes/booking');
const healthRoutes  = require('./routes/health');

function createApp() {
  const app = express();

  app.use(express.json());

  // Attach correlation ID to every request
  app.use((req, res, next) => {
    req.correlationId = req.headers['x-correlation-id'] || randomUUID();
    res.setHeader('X-Correlation-ID', req.correlationId);
    next();
  });

  bookingRoutes.registerRoutes(app);
  healthRoutes.registerRoutes(app);

  return app;
}

module.exports = { createApp };