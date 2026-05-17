const store   = require('../services/store');
const metrics = require('../services/metrics');
const logger  = require('../middleware/logger');
const {
  STATES, applyTransition, InvalidTransitionError, StepFailureError,
} = require('../services/stateMachine');

// Core: apply one action with idempotency, logging, metrics, compensation.
function executeAction(req, res, action, payload = {}) {
  const { processKey } = req.params;
  const idempKey = req.headers['x-idempotency-key'] || null;
  const correlationId = req.correlationId;
  const logCtx = { correlationId, processKey, action };

  // ── Idempotency check ──────────────────────────────────────────────────────
  if (idempKey) {
    const cached = store.getCachedResponse(processKey, idempKey);
    if (cached) {
      metrics.incrementDuplicate();
      logger.warn('Duplicate delivery ignored', { ...logCtx, idempKey });
      return res.status(200).json({ ...cached, duplicate: true });
    }
  }

  // ── Load or initialise booking ─────────────────────────────────────────────
  let booking = store.getBooking(processKey);
  if (!booking && action === 'reserve') {
    booking = { state: STATES.IDLE, data: {}, createdAt: new Date().toISOString() };
  }
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found', correlationId });
  }

  const previousState = booking.state;
  const start = Date.now();

  try {
    const { nextState, stepData } = applyTransition(booking, action, payload);

    booking = { ...booking, state: nextState, data: { ...booking.data, ...stepData } };
    store.setBooking(processKey, booking);

    metrics.incrementOk();
    metrics.recordLatency(action, Date.now() - start);
    logger.info('State transition', { ...logCtx, from: previousState, to: nextState });

    const response = { processKey, state: nextState, correlationId };
    if (idempKey) store.setCachedResponse(processKey, idempKey, response);
    return res.status(200).json(response);

  } catch (err) {
    metrics.recordLatency(action, Date.now() - start);

    if (err instanceof StepFailureError) {
      metrics.incrementErr();
      logger.error('Step failure — starting compensation', { ...logCtx, error: err.message });

      const { nextState: compensatedState, stepData: compData } =
        applyTransition(booking, 'compensate', {});
      store.setBooking(processKey, {
        ...booking,
        state: compensatedState,
        data: { ...booking.data, ...compData },
      });

      metrics.incrementCompensation();
      logger.warn('Compensation applied', { ...logCtx, from: previousState, to: compensatedState });
      return res.status(500).json({ error: 'Step failed, compensation applied', state: compensatedState, correlationId });
    }

    if (err instanceof InvalidTransitionError) {
      metrics.incrementErr();
      logger.warn('Invalid transition', { ...logCtx, error: err.message });
      return res.status(409).json({ error: err.message, correlationId });
    }

    metrics.incrementErr();
    logger.error('Unexpected error', { ...logCtx, error: err.message });
    return res.status(500).json({ error: 'Internal error', correlationId });
  }
}

function registerRoutes(app) {
  // GET /bookings/:processKey — read current state
  app.get('/bookings/:processKey', (req, res) => {
    const booking = store.getBooking(req.params.processKey);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    return res.status(200).json({ processKey: req.params.processKey, ...booking });
  });

  // Step 1 — Reserve room
  app.post('/bookings/:processKey/reserve', (req, res) => {
    const { room, requestedBy } = req.body || {};
    if (!room) return res.status(400).json({ error: '"room" is required' });
    return executeAction(req, res, 'reserve', { room, requestedBy });
  });

  // Step 2 — Notify attendees
  app.post('/bookings/:processKey/notify', (req, res) => {
    const { attendees } = req.body || {};
    if (!attendees) return res.status(400).json({ error: '"attendees" is required' });
    return executeAction(req, res, 'notify', { attendees });
  });

  // Step 3 — Confirm (may fail → compensation)
  app.post('/bookings/:processKey/confirm', (req, res) => {
    return executeAction(req, res, 'confirm', {});
  });

  // Cancel (manual rollback)
  app.post('/bookings/:processKey/cancel', (req, res) => {
    return executeAction(req, res, 'cancel', {});
  });
}

module.exports = { registerRoutes };