const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { request } = require('./helpers');
const store   = require('../src/services/store');
const metrics = require('../src/services/metrics');

beforeEach(() => {
  store.clear();
  metrics.reset();
  process.env.CONFIRM_FAIL_RATE = '0';
  process.env.ERROR_RATE_THRESHOLD = '0.8';
});

// ── Metrics ────────────────────────────────────────────────────────────────
describe('GET /metrics', () => {
  it('starts with all counters at zero', async () => {
    const res = await request.get('/metrics');
    assert.equal(res.status, 200);
    const { counters } = res.body;
    assert.equal(counters.transitionsOk, 0);
    assert.equal(counters.transitionsErr, 0);
    assert.equal(counters.duplicateDeliveries, 0);
    assert.equal(counters.compensations, 0);
  });

  it('counts successful transitions', async () => {
    await request.post('/bookings/p1/reserve').send({ room: 'A1' });
    await request.post('/bookings/p1/notify').send({ attendees: ['Bob'] });
    const res = await request.get('/metrics');
    assert.equal(res.body.counters.transitionsOk, 2);
  });

  it('counts error transitions on invalid state', async () => {
    await request.post('/bookings/p1/reserve').send({ room: 'A1' });
    await request.post('/bookings/p1/confirm'); // wrong order
    const res = await request.get('/metrics');
    assert.ok(res.body.counters.transitionsErr >= 1);
  });

  it('counts duplicate deliveries', async () => {
    await request.post('/bookings/p1/reserve').send({ room: 'A1' }).set('X-Idempotency-Key', 'idem-dup');
    await request.post('/bookings/p1/reserve').send({ room: 'A1' }).set('X-Idempotency-Key', 'idem-dup');
    const res = await request.get('/metrics');
    assert.equal(res.body.counters.duplicateDeliveries, 1);
  });

  it('counts compensations when confirm step fails', async () => {
    process.env.CONFIRM_FAIL_RATE = '1';
    await request.post('/bookings/p1/reserve').send({ room: 'A1' });
    await request.post('/bookings/p1/notify').send({ attendees: ['Bob'] });
    await request.post('/bookings/p1/confirm');
    const res = await request.get('/metrics');
    assert.equal(res.body.counters.compensations, 1);
  });

  it('records per-step latency', async () => {
    await request.post('/bookings/p1/reserve').send({ room: 'A1' });
    const res = await request.get('/metrics');
    assert.ok(res.body.latency.reserve);
    assert.equal(res.body.latency.reserve.samples, 1);
    assert.equal(typeof res.body.latency.reserve.avgMs, 'number');
  });
});

// ── Health — liveness ──────────────────────────────────────────────────────
describe('GET /health/live', () => {
  it('always returns 200 alive', async () => {
    const res = await request.get('/health/live');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'alive');
  });
});

// ── Health — readiness ─────────────────────────────────────────────────────
describe('GET /health/ready', () => {
  it('returns 200 when no errors have occurred', async () => {
    const res = await request.get('/health/ready');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ready');
  });

  it('returns 503 when error rate exceeds threshold', async () => {
    process.env.ERROR_RATE_THRESHOLD = '0.5';
    metrics.incrementErr();
    metrics.incrementErr();
    const res = await request.get('/health/ready');
    assert.equal(res.status, 503);
    assert.equal(res.body.status, 'not ready');
  });

  it('returns 200 when error rate is below threshold', async () => {
    process.env.ERROR_RATE_THRESHOLD = '0.8';
    metrics.incrementOk();
    metrics.incrementOk();
    metrics.incrementOk();
    metrics.incrementErr(); // 25% — below threshold
    const res = await request.get('/health/ready');
    assert.equal(res.status, 200);
  });
});